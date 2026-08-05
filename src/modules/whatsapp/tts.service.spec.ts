import { EventEmitter } from 'events';
import { Test, TestingModule } from '@nestjs/testing';
import { TtsService } from './tts.service';

jest.mock('msedge-tts', () => ({
  MsEdgeTTS: jest.fn().mockImplementation(() => ({
    setMetadata: jest.fn().mockResolvedValue(undefined),
    toStream: jest.fn().mockResolvedValue({ audioStream: new EventEmitter() }),
  })),
  OUTPUT_FORMAT: { AUDIO_24KHZ_96KBITRATE_MONO_MP3: 'audio-24khz-96kbitrate-mono-mp3' },
}));

describe('TtsService', () => {
  let service: TtsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TtsService],
    }).compile();
    service = module.get<TtsService>(TtsService);
  });

  it('deve retornar null para texto vazio', async () => {
    await expect(service.synthesize('   ')).resolves.toBeNull();
  });

  it('deve gerar audio quando o EdgeTTS emite data e close', async () => {
    const MsEdgeTTSMock = (await import('msedge-tts')).MsEdgeTTS as unknown as jest.Mock;
    const ee = new EventEmitter();
    MsEdgeTTSMock.mockImplementationOnce(() => ({
      setMetadata: jest.fn().mockResolvedValue(undefined),
      toStream: jest.fn().mockResolvedValue({ audioStream: ee }),
    }));

    const promise = service.synthesize('Olá, bem-vindo!');
    await new Promise((r) => setTimeout(r, 10));
    ee.emit('data', Buffer.from([1, 2, 3]));
    ee.emit('close');

    const result = await promise;
    expect(result).not.toBeNull();
    expect(result!.buffer).toEqual(Buffer.from([1, 2, 3]));
    expect(result!.mimeType).toBe('audio/mpeg');
  });

  it('deve retornar null quando o audio vier vazio', async () => {
    const MsEdgeTTSMock = (await import('msedge-tts')).MsEdgeTTS as unknown as jest.Mock;
    const ee = new EventEmitter();
    MsEdgeTTSMock.mockImplementationOnce(() => ({
      setMetadata: jest.fn().mockResolvedValue(undefined),
      toStream: jest.fn().mockResolvedValue({ audioStream: ee }),
    }));

    const promise = service.synthesize('sem audio');
    await new Promise((r) => setTimeout(r, 10));
    ee.emit('close'); // fecha sem data

    await expect(promise).resolves.toBeNull();
  });
});
