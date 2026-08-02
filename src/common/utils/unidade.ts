const FATORES_PARA_KG: Record<string, number> = {
  kg: 1,
  g: 0.001,
  mg: 0.000001,
  t: 1000,
};

const SINONIMOS: Record<string, string> = {
  quilo: 'kg',
  quilos: 'kg',
  kilo: 'kg',
  kilos: 'kg',
  quilograma: 'kg',
  quilogramas: 'kg',
  kilograma: 'kg',
  kilogramas: 'kg',
  grama: 'g',
  gramas: 'g',
  gr: 'g',
  miligrama: 'mg',
  miligramas: 'mg',
  ton: 't',
  tonelada: 't',
  toneladas: 't',
};

export function normalizarUnidadePeso(unidade?: string | null): string | null {
  if (!unidade) return null;
  const u = unidade.trim().toLowerCase().replace(/\.$/, '');
  if (u in FATORES_PARA_KG) return u;
  if (u in SINONIMOS) return SINONIMOS[u];
  return null;
}

export function ehUnidadeDePeso(unidade?: string | null): boolean {
  return normalizarUnidadePeso(unidade) !== null;
}

export function converterParaKg(valor: number, unidade?: string | null): number {
  const u = normalizarUnidadePeso(unidade);
  if (!u) return valor;
  return valor * FATORES_PARA_KG[u];
}

export function converterPeso(valor: number, de?: string | null, para?: string | null): number {
  const kg = converterParaKg(valor, de);
  const destino = normalizarUnidadePeso(para);
  if (!destino) return kg;
  return kg / FATORES_PARA_KG[destino];
}
