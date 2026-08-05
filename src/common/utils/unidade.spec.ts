import {
  normalizarUnidadePeso,
  ehUnidadeDePeso,
  converterParaKg,
  converterPeso,
} from './unidade';

describe('unidade (normalizarUnidadePeso)', () => {
  it('deve normalizar unidades de peso padrão', () => {
    expect(normalizarUnidadePeso('kg')).toBe('kg');
    expect(normalizarUnidadePeso('g')).toBe('g');
    expect(normalizarUnidadePeso('mg')).toBe('mg');
    expect(normalizarUnidadePeso('t')).toBe('t');
  });

  it('deve normalizar sinônimos de unidade de peso', () => {
    expect(normalizarUnidadePeso('quilo')).toBe('kg');
    expect(normalizarUnidadePeso('quilos')).toBe('kg');
    expect(normalizarUnidadePeso('kilo')).toBe('kg');
    expect(normalizarUnidadePeso('kilos')).toBe('kg');
    expect(normalizarUnidadePeso('quilograma')).toBe('kg');
    expect(normalizarUnidadePeso('kilograma')).toBe('kg');
    expect(normalizarUnidadePeso('grama')).toBe('g');
    expect(normalizarUnidadePeso('gramas')).toBe('g');
    expect(normalizarUnidadePeso('gr')).toBe('g');
    expect(normalizarUnidadePeso('miligrama')).toBe('mg');
    expect(normalizarUnidadePeso('miligramas')).toBe('mg');
    expect(normalizarUnidadePeso('ton')).toBe('t');
    expect(normalizarUnidadePeso('tonelada')).toBe('t');
    expect(normalizarUnidadePeso('toneladas')).toBe('t');
  });

  it('deve ser case-insensitive e ignorar espaços e ponto final', () => {
    expect(normalizarUnidadePeso('KG')).toBe('kg');
    expect(normalizarUnidadePeso('Grama')).toBe('g');
    expect(normalizarUnidadePeso(' kg ')).toBe('kg');
    expect(normalizarUnidadePeso('g.')).toBe('g');
    expect(normalizarUnidadePeso('Tonelada.')).toBe('t');
  });

  it('deve retornar null para unidades não-peso ou vazias', () => {
    expect(normalizarUnidadePeso(null)).toBeNull();
    expect(normalizarUnidadePeso(undefined)).toBeNull();
    expect(normalizarUnidadePeso('')).toBeNull();
    expect(normalizarUnidadePeso('UN')).toBeNull();
    expect(normalizarUnidadePeso('un')).toBeNull();
    expect(normalizarUnidadePeso('cx')).toBeNull();
    expect(normalizarUnidadePeso('litro')).toBeNull();
  });
});

describe('unidade (ehUnidadeDePeso)', () => {
  it('deve retornar true para unidades de peso', () => {
    expect(ehUnidadeDePeso('kg')).toBe(true);
    expect(ehUnidadeDePeso('grama')).toBe(true);
    expect(ehUnidadeDePeso('tonelada')).toBe(true);
  });

  it('deve retornar false para unidades não-peso ou ausentes', () => {
    expect(ehUnidadeDePeso('UN')).toBe(false);
    expect(ehUnidadeDePeso('un')).toBe(false);
    expect(ehUnidadeDePeso(null)).toBe(false);
    expect(ehUnidadeDePeso(undefined)).toBe(false);
  });
});

describe('unidade (converterParaKg)', () => {
  it('deve retornar o valor sem conversão quando a unidade não for de peso', () => {
    expect(converterParaKg(5, 'UN')).toBe(5);
    expect(converterParaKg(5, null)).toBe(5);
    expect(converterParaKg(5, undefined)).toBe(5);
  });

  it('deve converter g para kg', () => {
    expect(converterParaKg(500, 'g')).toBeCloseTo(0.5, 5);
  });

  it('deve converter mg para kg', () => {
    expect(converterParaKg(1000000, 'mg')).toBeCloseTo(1, 5);
  });

  it('deve converter tonelada para kg', () => {
    expect(converterParaKg(2, 't')).toBe(2000);
  });

  it('deve manter o valor para kg', () => {
    expect(converterParaKg(3, 'kg')).toBe(3);
  });
});

describe('unidade (converterPeso)', () => {
  it('deve converter 1kg para g = 1000', () => {
    expect(converterPeso(1, 'kg', 'g')).toBeCloseTo(1000, 5);
  });

  it('deve converter 500g para kg = 0.5', () => {
    expect(converterPeso(500, 'g', 'kg')).toBeCloseTo(0.5, 5);
  });

  it('deve converter 1.5kg para g = 1500', () => {
    expect(converterPeso(1.5, 'kg', 'g')).toBeCloseTo(1500, 5);
  });

  it('deve converter sinônimos (quilo para grama)', () => {
    expect(converterPeso(1, 'quilo', 'grama')).toBeCloseTo(1000, 5);
  });

  it('deve converter kg para mg', () => {
    expect(converterPeso(1, 'kg', 'mg')).toBe(1000000);
  });

  it('deve converter g para t', () => {
    expect(converterPeso(1000, 'g', 't')).toBeCloseTo(0.001, 6);
  });

  it('deve retornar o valor em kg quando o destino não for de peso', () => {
    expect(converterPeso(500, 'g', 'UN')).toBeCloseTo(0.5, 5);
  });
});
