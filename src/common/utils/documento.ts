function apenasDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

export function validarCpf(cpf: string): boolean {
  const c = apenasDigitos(cpf);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(c[i], 10) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  if (resto !== parseInt(c[9], 10)) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(c[i], 10) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  return resto === parseInt(c[10], 10);
}

export function validarCnpj(cnpj: string): boolean {
  const c = apenasDigitos(cnpj);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;

  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  let soma = 0;
  for (let i = 0; i < 12; i++) soma += parseInt(c[i], 10) * pesos1[i];
  const d1 = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  if (d1 !== parseInt(c[12], 10)) return false;

  soma = 0;
  for (let i = 0; i < 13; i++) soma += parseInt(c[i], 10) * pesos2[i];
  const d2 = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  return d2 === parseInt(c[13], 10);
}

export function validarCpfCnpj(valor: string): boolean {
  const digitos = apenasDigitos(valor);
  if (digitos.length === 11) return validarCpf(digitos);
  if (digitos.length === 14) return validarCnpj(digitos);
  return false;
}
