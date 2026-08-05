import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('App (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/vitrine/:slug retorna o negócio', async () => {
    const res = await request(app.getHttpServer()).get('/api/vitrine/walker-salgados');
    expect(res.status).toBe(200);
    expect(res.body.negocio).toBeDefined();
    expect(res.body.negocio.nome).toBeTruthy();
  });

  it('GET /api/whatsapp/webhook falha sem token válido', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/whatsapp/webhook')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'token-errado', 'hub.challenge': 'x' });
    expect(res.status).toBe(403);
  });
});
