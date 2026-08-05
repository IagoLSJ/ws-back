import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  const service = {
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    recuperarSenha: jest.fn(),
    redefinirSenha: jest.fn(),
    getMe: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: service }],
    }).compile();
    controller = module.get<AuthController>(AuthController);
    jest.clearAllMocks();
  });

  it('login repassa ip e user-agent', () => {
    service.login.mockReturnValue({ accessToken: 'x' });
    const req = { ip: '1.2.3.4', headers: { 'user-agent': 'test-agent' } };
    const result = controller.login({ email: 'a@b.com', senha: '123456' } as any, req as any);
    expect(service.login).toHaveBeenCalledWith({ email: 'a@b.com', senha: '123456' }, '1.2.3.4', 'test-agent');
    expect(result).toEqual({ accessToken: 'x' });
  });

  it('refresh repassa dto', () => {
    service.refresh.mockReturnValue({ accessToken: 'y' });
    expect(controller.refresh({ refreshToken: 'rt' } as any)).toEqual({ accessToken: 'y' });
    expect(service.refresh).toHaveBeenCalledWith({ refreshToken: 'rt' });
  });

  it('logout usa refreshToken', () => {
    service.logout.mockReturnValue({ success: true });
    controller.logout({ refreshToken: 'rt' } as any);
    expect(service.logout).toHaveBeenCalledWith('rt');
  });

  it('me chama getMe com userId', () => {
    service.getMe.mockReturnValue({ id: 'u1' });
    expect(controller.me('u1')).toEqual({ id: 'u1' });
    expect(service.getMe).toHaveBeenCalledWith('u1');
  });
});
