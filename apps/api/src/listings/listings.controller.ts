import { createListingSchema, type CreateListingInput } from '@carintel/shared';
import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard, type JwtPayload } from '../auth/jwt-auth.guard';
import { ApiZodBody } from '../common/zod-openapi';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ListingsService } from './listings.service';

@ApiTags('listings')
@ApiBearerAuth()
@Controller('listings')
@UseGuards(JwtAuthGuard)
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Get()
  @ApiOperation({ summary: 'Оголошення користувача' })
  findAll(@CurrentUser() user: JwtPayload) {
    return this.listings.findAll(user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Оголошення з авто й аналізами' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.listings.findOne(user.sub, id);
  }

  @Post()
  @ApiOperation({ summary: 'Створити оголошення за посиланням auto.ria — авто, ціна й фото дістаються зі сторінки' })
  @ApiZodBody(createListingSchema)
  create(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createListingSchema)) body: CreateListingInput,
  ) {
    return this.listings.create(user.sub, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Видалити оголошення' })
  remove(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.listings.remove(user.sub, id);
  }
}
