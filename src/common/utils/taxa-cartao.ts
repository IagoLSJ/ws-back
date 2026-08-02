export interface TaxaCartaoFaixa {
  ate: number;
  valor: number;
}

export function calcularTaxaCartao(
  total: number,
  faixas?: TaxaCartaoFaixa[] | null,
): number {
  if (!Array.isArray(faixas) || !faixas.length) return 0;
  const ordenadas = [...faixas]
    .filter((f) => Number.isFinite(Number(f?.ate)) && Number.isFinite(Number(f?.valor)))
    .sort((a, b) => Number(a.ate) - Number(b.ate));
  if (!ordenadas.length) return 0;

  const faixa = ordenadas.find((f) => total <= Number(f.ate));
  const valor = faixa ? Number(faixa.valor) : Number(ordenadas[ordenadas.length - 1].valor);
  return Math.round(Math.max(0, valor) * 100) / 100;
}
