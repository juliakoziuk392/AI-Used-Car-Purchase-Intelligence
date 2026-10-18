import { Controller, Get } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';

@Controller('health')
export class HealthController {
  constructor(private readonly sequelize: Sequelize) {}

  @Get()
  async check() {
    await this.sequelize.authenticate();
    return { status: 'ok', db: 'up' };
  }
}
