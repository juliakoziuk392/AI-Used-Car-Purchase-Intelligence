import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Sse,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard, type JwtPayload } from '../auth/jwt-auth.guard';
import { AnalysesService } from './analyses.service';
import { Model3dService } from './model3d.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class AnalysesController {
  constructor(
    private readonly analyses: AnalysesService,
    private readonly model3d: Model3dService,
  ) {}

  @Post('listings/:listingId/analyses')
  create(
    @CurrentUser() user: JwtPayload,
    @Param('listingId', ParseUUIDPipe) listingId: string,
  ) {
    return this.analyses.create(user.sub, listingId);
  }

  @Get('analyses/:id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.analyses.findOne(user.sub, id);
  }

  /** GLB-модель авто, згенерована з фото оголошення. */
  @Get('analyses/:id/model.glb')
  async model(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    await this.analyses.findOne(user.sub, id);
    return new StreamableFile(createReadStream(this.model3d.filePath(id)), {
      type: 'model/gltf-binary',
    });
  }

  /** SSE: стан аналізу в реальному часі. Стрім закривається, коли аналіз done/failed. */
  @Sse('analyses/:id/events')
  async events(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    await this.analyses.findOne(user.sub, id);
    return this.analyses.stream(user.sub, id);
  }
}
