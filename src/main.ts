import express from 'express';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

let app: express.Express;

async function bootstrap() {
  if (app) return app;

  const expressApp = express();
  const nestApp = await NestFactory.create(AppModule, new ExpressAdapter(expressApp));

  nestApp.use(helmet());
  nestApp.enableCors({
    origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((o) => o.trim().replace(/\/$/, '')),
    credentials: true,
  });
  nestApp.setGlobalPrefix('api');
  nestApp.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Multi-Negócio API')
    .setDescription('Sistema de gestão multi-negócio — Catálogo, Estoque e Autenticação')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(nestApp, config);
  SwaggerModule.setup('api/docs', nestApp, document);

  await nestApp.init();
  app = expressApp;
  return app;
}

export default async (req: express.Request, res: express.Response) => {
  const expressApp = await bootstrap();
  expressApp(req, res);
};

if (process.env.NODE_ENV !== 'production') {
  const port = process.env.API_PORT || 3000;
  bootstrap().then((expressApp) => {
    expressApp.listen(port, () => console.log(`API running on http://localhost:${port}`));
  });
}
