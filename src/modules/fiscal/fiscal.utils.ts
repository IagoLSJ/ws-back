export function digitsOnly(value: string): string {
  return String(value ?? '').replace(/\D/g, '');
}

export function validarCnpj(valor: string): boolean {
  const cnpj = digitsOnly(valor);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calcular = (base: string, pesosInicio: number): number => {
    let soma = 0;
    let peso = pesosInicio;
    for (const char of base) {
      soma += Number(char) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = calcular(cnpj.slice(0, 12), 5);
  const d2 = calcular(cnpj.slice(0, 12) + d1, 6);
  return cnpj === cnpj.slice(0, 12) + `${d1}${d2}`;
}

export function validarCpf(valor: string): boolean {
  const cpf = digitsOnly(valor);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += Number(cpf[i]) * (10 - i);
  const d1 = (soma * 10) % 11;
  let soma2 = d1 === 10 || d1 === 11 ? 0 : d1;
  for (let i = 0; i < 10; i++) soma2 += Number(cpf[i]) * (11 - i);
  const d2 = (soma2 * 10) % 11;
  const dv2 = d2 === 10 || d2 === 11 ? 0 : d2;
  return Number(cpf[9]) === (d1 === 10 || d1 === 11 ? 0 : d1) && Number(cpf[10]) === dv2;
}

export function baseCnpj(valor: string): string {
  return digitsOnly(valor).slice(0, 8);
}
