import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Sequelize } from 'sequelize-typescript';

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly sequelize: Sequelize) {}

  @Get()
  @ApiOperation({ summary: 'Стан API та БД' })
  async check() {
    await this.sequelize.authenticate();
    return { status: 'ok', db: 'up' };
  }
}
