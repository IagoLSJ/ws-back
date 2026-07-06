export function calcularPrecoFinal(produto: {
  preco: number | { toNumber(): number };
  tipoDesconto?: string | null;
  valorDesconto?: number | { toNumber(): number } | null;
}): number {
  const preco = typeof produto.preco === 'number' ? produto.preco : Number(produto.preco);
  if (!produto.tipoDesconto || !produto.valorDesconto) return preco;
  const valorDesconto =
    typeof produto.valorDesconto === 'number'
      ? produto.valorDesconto
      : Number(produto.valorDesconto);
  if (valorDesconto <= 0) return preco;
  if (produto.tipoDesconto === 'FIXO') return Math.max(0, preco - valorDesconto);
  if (produto.tipoDesconto === 'PERCENTUAL')
    return Math.max(0, preco - (preco * valorDesconto) / 100);
  return preco;
}
