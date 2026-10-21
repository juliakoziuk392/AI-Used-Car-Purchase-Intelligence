import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Sse,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard, type JwtPayload } from '../auth/jwt-auth.guard';
import { AnalysesService } from './analyses.service';
import { GLB_CONTENT_TYPE, Model3dService } from './model3d.service';

@ApiTags('analyses')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class AnalysesController {
  constructor(
    private readonly analyses: AnalysesService,
    private readonly model3d: Model3dService,
  ) {}

  @Post('listings/:listingId/analyses')
  @ApiOperation({ summary: 'Запустити аналіз (задача в черзі BullMQ). Діє денний ліміт на користувача' })
  create(
    @CurrentUser() user: JwtPayload,
    @Param('listingId', ParseUUIDPipe) listingId: string,
  ) {
    return this.analyses.create(user.sub, listingId);
  }

  @Get('analyses/:id')
  @ApiOperation({ summary: 'Аналіз з прапорцями ризиків' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.analyses.findOne(user.sub, id);
  }

  @Get('analyses/:id/model.glb')
  @ApiOperation({ summary: 'GLB-модель авто, згенерована з фото оголошення' })
  @ApiProduces(GLB_CONTENT_TYPE)
  async model(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    await this.analyses.findOne(user.sub, id);
    const { body, length } = await this.model3d.open(id);
    return new StreamableFile(body, { type: GLB_CONTENT_TYPE, length });
  }

  @Post('analyses/:id/model3d')
  @HttpCode(202)
  // Генерація витрачає квоту GPU — не частіше 3 разів на 10 хвилин.
  @Throttle({ default: { ttl: 600_000, limit: 3 } })
  @ApiOperation({
    summary: 'Згенерувати 3D-модель ще раз: ставить задачу в чергу, прогрес — у result.model3d через SSE',
  })
  regenerateModel(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.analyses.regenerateModel(user.sub, id);
  }

  @Sse('analyses/:id/events')
  @ApiOperation({
    summary: 'SSE: стан аналізу в реальному часі, закривається на done/failed, коли 3D не генерується',
  })
  @ApiProduces('text/event-stream')
  async events(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    await this.analyses.findOne(user.sub, id);
    return this.analyses.stream(user.sub, id);
  }
}
