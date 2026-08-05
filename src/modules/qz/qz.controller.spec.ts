import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { generateKeyPairSync } from 'crypto';
import { QzController } from './qz.controller';

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return { ...actual, existsSync: jest.fn(), readFileSync: jest.fn() };
});

const fs = jest.requireMock('fs');
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

async function criarController() {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [QzController],
  }).compile();
  return module.get<QzController>(QzController);
}

describe('QzController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lança 400 quando request ausente', async () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(privateKey);
    const controller = await criarController();
    try {
      // Chamada direta: @Body('request') extrai a propriedade → aqui passamos undefined
      controller.sign(undefined as any);
      fail('deveria lançar');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      expect((e as HttpException).getStatus()).toBe(400);
    }
  });

  it('lança 404 sem private-key.pem', async () => {
    fs.existsSync.mockReturnValue(false);
    const controller = await criarController();
    try {
      controller.sign('ola' as any);
      fail('deveria lançar');
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(404);
    }
  });

  it('assina a mensagem com SHA512', async () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(privateKey);
    const controller = await criarController();
    const result = controller.sign('{"msg":"oi"}' as any);
    expect(typeof result.signature).toBe('string');
    expect(result.signature.length).toBeGreaterThan(0);
  });
});
