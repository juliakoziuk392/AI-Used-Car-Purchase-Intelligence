import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';
import { models } from './models';

@Global()
@Module({
  imports: [
    SequelizeModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        dialect: 'postgres',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: Number(config.get('DB_EXTERNAL_PORT', 5432)),
        username: config.getOrThrow<string>('DB_USERNAME'),
        password: config.getOrThrow<string>('DB_PASSWORD'),
        database: config.getOrThrow<string>('DB_NAME'),
        // Сертифікат Supabase підписаний її власним CA, не публічним — ланцюжок не перевіряємо.
        dialectOptions: config.get<boolean>('DB_SSL') ? { ssl: { require: true, rejectUnauthorized: false } } : undefined,
        models,
        // Схемою керують міграції (apps/api/db/migrations), не sync().
        synchronize: false,
        logging: false,
      }),
    }),
    SequelizeModule.forFeature(models),
  ],
  exports: [SequelizeModule],
})
export class DatabaseModule {}
