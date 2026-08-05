import { verificarAbertoEm } from './horario';

const dias = [
  { abertura: '08:00', fechamento: '18:00', fechado: false }, // Seg (0)
  { abertura: '08:00', fechamento: '18:00', fechado: false }, // Ter (1)
  { abertura: '08:00', fechamento: '18:00', fechado: false }, // Qua (2)
  { abertura: '08:00', fechamento: '18:00', fechado: false }, // Qui (3)
  { abertura: '08:00', fechamento: '18:00', fechado: false }, // Sex (4)
  { abertura: '09:00', fechamento: '14:00', fechado: false }, // Sáb (5)
  { abertura: '00:00', fechamento: '00:00', fechado: true },  // Dom (6)
];

// Ex.: 15/08/2026 é um sábado. getDay() = 6.
function data(ano: number, mes: number, dia: number, hora: number, min = 0): Date {
  return new Date(ano, mes - 1, dia, hora, min);
}

describe('verificarAbertoEm', () => {
  it('retorna true quando não há horário configurado', () => {
    expect(verificarAbertoEm(null, data(2026, 8, 15, 12))).toBe(true);
    expect(verificarAbertoEm({ dias: [] }, data(2026, 8, 15, 12))).toBe(true);
  });

  it('segunda a sexta: aberto dentro do horário', () => {
    // 10/08/2026 é segunda-feira (getDay = 1)
    expect(verificarAbertoEm({ dias }, data(2026, 8, 10, 9))).toBe(true);
    expect(verificarAbertoEm({ dias }, data(2026, 8, 10, 18))).toBe(true);
  });

  it('fechado antes da abertura e depois do fechamento', () => {
    expect(verificarAbertoEm({ dias }, data(2026, 8, 10, 7, 59))).toBe(false);
    expect(verificarAbertoEm({ dias }, data(2026, 8, 10, 18, 1))).toBe(false);
  });

  it('SÁBADO usa o índice 5 (não o do domingo) — regressão do off-by-one', () => {
    // 15/08/2026 é sábado. Antes do bug, lia dias[6] (Domingo) e dizia FECHADO.
    expect(verificarAbertoEm({ dias }, data(2026, 8, 15, 10))).toBe(true);
    expect(verificarAbertoEm({ dias }, data(2026, 8, 15, 15))).toBe(false);
  });

  it('DOMINGO usa o índice 6 e respeita fechado', () => {
    // 16/08/2026 é domingo.
    expect(verificarAbertoEm({ dias }, data(2026, 8, 16, 10))).toBe(false);
  });

  it('dia fechado no meio da semana bloqueia', () => {
    const comQuartaFechada = dias.map((d, i) => (i === 2 ? { ...d, fechado: true } : d));
    // 12/08/2026 é quarta-feira.
    expect(verificarAbertoEm({ dias: comQuartaFechada }, data(2026, 8, 12, 10))).toBe(false);
  });
});
