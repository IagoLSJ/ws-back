import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import type { Request, Response, NextFunction } from 'express';

let cachedApp: any = null;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  app.enableCors({
    origin: (process.env.CORS_ORIGIN || 'https://localhost:5173').split(',').map((o) => o.trim().replace(/\/$/, '')),
    credentials: true,
  });

  app.setGlobalPrefix('api');
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Multi-Negócio API')
      .setDescription('Sistema de gestão multi-negócio')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.init();
  return app;
}

export default async function handler(req: Request, res: Response, next: NextFunction) {
  if (!cachedApp) {
    cachedApp = await bootstrap();
  }
  const instance = cachedApp.getHttpAdapter().getInstance();
  instance(req, res, next);
}

