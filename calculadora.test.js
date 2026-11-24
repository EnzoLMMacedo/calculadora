const test = require('node:test');
const assert = require('node:assert/strict');
const { calcular } = require('./calculadora.js');

const exemplo = {
  preco: 100, custo: 40, outros: 5, impostos: 6, comissoes: 10,
  quantidade: 100, fixos: 2000, margem: 30
};

function perto(atual, esperado, casas = 2) {
  assert.equal(Number(atual.toFixed(casas)), esperado);
}

function semNaNNemInfinity(obj) {
  JSON.stringify(obj, (_, v) => {
    if (typeof v === 'number') assert.ok(Number.isFinite(v), `valor não finito: ${v}`);
    return v;
  });
}

test('exemplo: lucro 39, margem 39%, markup 122,22%, preço ideal 83,33', () => {
  const r = calcular(exemplo);
  assert.equal(r.valido, true);
  perto(r.porUnidade.lucro, 39);
  perto(r.porUnidade.margemLiquida.valor * 100, 39);
  assert.ok(Math.abs(r.porUnidade.markup.valor - 55 / 45) < 1e-12);
  perto(r.porUnidade.markup.valor * 100, 122.22);
  perto(r.precoIdeal.valor, 83.33);
  perto(r.porUnidade.impostos, 6);
  perto(r.porUnidade.comissoes, 10);
  perto(r.porUnidade.custoTotal, 61);
  perto(r.periodo.receita, 10000);
  perto(r.periodo.custosVariaveis, 6100);
  perto(r.periodo.lucroTotal, 1900);
});

test('percentual 6 vale 6% (não 600%)', () => {
  const r = calcular({ ...exemplo, comissoes: 0 });
  perto(r.porUnidade.impostos, 6);
  assert.ok(r.porUnidade.lucro > 0);
});

test('ponto de equilíbrio em unidades é arredondado para cima', () => {
  const r = calcular({ ...exemplo, fixos: 100 });
  // 100 / 39 = 2,56... -> 3 unidades
  assert.equal(r.periodo.peUnidades.valor, 3);
  perto(r.periodo.peReais.valor, 256.41);
});

test('PE exato não sobe por ruído de ponto flutuante', () => {
  const r = calcular({ ...exemplo, fixos: 117 });
  // 117 / 39 = 3 exatos
  assert.equal(r.periodo.peUnidades.valor, 3);
});

test('preço zero: margem líquida e PE em R$ não calculáveis', () => {
  const r = calcular({ ...exemplo, preco: 0 });
  assert.equal(r.valido, true);
  assert.equal(r.porUnidade.margemLiquida.calculavel, false);
  assert.match(r.porUnidade.margemLiquida.mensagem, /preço de venda é zero/);
  assert.equal(r.periodo.peReais.calculavel, false);
  assert.match(r.periodo.peReais.mensagem, /preço de venda é zero/);
  semNaNNemInfinity(r);
});

test('margem de contribuição <= 0: ponto de equilíbrio não existe', () => {
  for (const preco of [45 / 0.84, 50]) {
    const r = calcular({ ...exemplo, preco });
    assert.ok(r.porUnidade.lucro <= 0);
    assert.equal(r.periodo.peUnidades.calculavel, false);
    assert.match(r.periodo.peUnidades.mensagem, /não existe/);
    assert.equal(r.periodo.peReais.calculavel, false);
    semNaNNemInfinity(r);
  }
});

test('impostos + comissões + margem >= 100%: preço ideal impossível', () => {
  const r = calcular({ ...exemplo, margem: 84 });
  assert.equal(r.precoIdeal.calculavel, false);
  assert.equal(calcular({ ...exemplo, margem: 90 }).precoIdeal.calculavel, false);
  assert.match(r.precoIdeal.mensagem, /impossível/);
  semNaNNemInfinity(r);
});

test('custo + outros = 0: markup indefinido', () => {
  const r = calcular({ ...exemplo, custo: 0, outros: 0 });
  assert.equal(r.porUnidade.markup.calculavel, false);
  assert.match(r.porUnidade.markup.mensagem, /indefinido/);
  semNaNNemInfinity(r);
});

test('entradas vazias, negativas ou não numéricas: validação sem calcular', () => {
  for (const [campo, valor, trecho] of [
    ['preco', '', /preencha/],
    ['custo', undefined, /preencha/],
    ['quantidade', -1, /negativo/],
    ['impostos', 'abc', /número válido/],
    ['fixos', NaN, /número válido/]
  ]) {
    const r = calcular({ ...exemplo, [campo]: valor });
    assert.equal(r.valido, false);
    assert.equal(r.porUnidade, undefined);
    assert.equal(r.erros.length, 1);
    assert.equal(r.erros[0].campo, campo);
    assert.match(r.erros[0].mensagem, trecho);
  }
  assert.equal(calcular({}).erros.length, 8);
});

test('aceita texto com vírgula decimal', () => {
  const r = calcular({ ...exemplo, preco: '100,00', impostos: '6' });
  perto(r.porUnidade.lucro, 39);
});

test('ponto de milhar: 2.000 vale 2000, não 2', () => {
  const r = calcular({ ...exemplo, fixos: '2.000' });
  assert.equal(r.valido, true);
  assert.equal(r.periodo.lucroTotal, 1900);
  assert.equal(calcular({ ...exemplo, fixos: '1.234.567' }).periodo.lucroTotal,
    calcular({ ...exemplo, fixos: 1234567 }).periodo.lucroTotal);
  assert.equal(calcular({ ...exemplo, preco: '1.000,50' }).periodo.receita,
    calcular({ ...exemplo, preco: 1000.5 }).periodo.receita);
});

test('ponto de milhar mal formado é recusado', () => {
  for (const v of ['1.23,4', '1..000', '12.34.567']) {
    const r = calcular({ ...exemplo, fixos: v });
    assert.equal(r.valido, false, v);
  }
});

test('margem de lucro: do período e valor em R$ no preço ideal', () => {
  const r = calcular(exemplo);
  perto(r.periodo.margemPeriodo.valor, 0.19, 4);
  perto(r.lucroNoPrecoIdeal.valor, 25);
  const semVenda = calcular({ ...exemplo, quantidade: 0 });
  assert.equal(semVenda.periodo.margemPeriodo.calculavel, false);
  const impossivel = calcular({ ...exemplo, margem: 84 });
  assert.equal(impossivel.lucroNoPrecoIdeal.calculavel, false);
  semNaNNemInfinity(semVenda);
  semNaNNemInfinity(impossivel);
});
