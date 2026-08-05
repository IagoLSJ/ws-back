export interface DiaHorario {
  abertura: string;
  fechamento: string;
  fechado: boolean;
}

export interface HorarioFuncionamento {
  dias?: DiaHorario[];
}

/**
 * Verifica se o negócio está aberto em `data`.
 *
 * IMPORTANTE: o array `horario.dias` é salvo pelo frontend começando na SEGUNDA
 * (índice 0 = Segunda, ..., índice 6 = Domingo). `Date.getDay()` retorna
 * 0 = Domingo, 1 = Segunda, ..., 6 = Sábado. Por isso o índice é convertido
 * com `(getDay() + 6) % 7`.
 */
export function verificarAbertoEm(horario: HorarioFuncionamento | null, data: Date): boolean {
  if (!horario?.dias?.length) return true;

  const hoje = horario.dias[(data.getDay() + 6) % 7];
  if (!hoje || hoje.fechado) return false;

  const minutos = data.getHours() * 60 + data.getMinutes();
  const [hInicio, mInicio] = (hoje.abertura || '00:00').split(':').map(Number);
  const [hFim, mFim] = (hoje.fechamento || '23:59').split(':').map(Number);

  return minutos >= (hInicio * 60 + mInicio) && minutos <= (hFim * 60 + mFim);
}
