import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { serveWeb } from './common/serve-web';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // Фото оголошень вантажаться напряму з CDN auto.ria; текстури GLB three.js читає через blob:.
          'img-src': ["'self'", 'data:', 'blob:', 'https:'],
          'connect-src': ["'self'", 'blob:'],
        },
      },
    }),
  );
  app.enableCors({ origin: config.get<string>('WEB_ORIGIN', 'http://localhost:5174') });
  if (config.get<boolean>('TRUST_PROXY')) app.set('trust proxy', 1);
  app.enableShutdownHooks();

  const webDist = config.get<string>('WEB_DIST_DIR');
  if (webDist) serveWeb(app, webDist);

  // У продакшені документацію API вимкнено, якщо явно не задано SWAGGER_ENABLED=true.
  const swaggerEnabled = config.get<boolean>('SWAGGER_ENABLED') ?? config.get('NODE_ENV') !== 'production';
  if (swaggerEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('CarIntel API')
        .setDescription('AI-перевірка оголошень про продаж вживаних авто')
        .setVersion('0.1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('docs', app, document, { swaggerOptions: { persistAuthorization: true } });
  }

  const port = config.get<number>('API_PORT', 3000);
  await app.listen(port);
  Logger.log(`API listening on http://localhost:${port}`, 'Bootstrap');
  if (swaggerEnabled) Logger.log(`Swagger UI on http://localhost:${port}/docs`, 'Bootstrap');
}

void bootstrap();
