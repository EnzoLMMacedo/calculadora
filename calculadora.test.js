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

test('margem de lucro do período: lucro total ÷ receita', () => {
  perto(calcular(exemplo).periodo.margemPeriodo.valor, 0.19, 4);
  const semVenda = calcular({ ...exemplo, quantidade: 0 });
  assert.equal(semVenda.periodo.margemPeriodo.calculavel, false);
  semNaNNemInfinity(semVenda);
});

test('valor da margem no preço ideal: preço ideal × margem desejada', () => {
  perto(calcular(exemplo).lucroNoPrecoIdeal.valor, 25);
  const impossivel = calcular({ ...exemplo, margem: 84 });
  assert.equal(impossivel.lucroNoPrecoIdeal.calculavel, false);
  semNaNNemInfinity(impossivel);
});

test('preço ideal em dois valores no exemplo padrão: 83,33 e 120,37', () => {
  const r = calcular(exemplo);
  assert.ok(Math.abs(r.precoIdeal.valor - 45 / 0.54) < 1e-9);
  assert.ok(Math.abs(r.precoIdealComFixos.valor - 65 / 0.54) < 1e-9);
  assert.equal(r.precoIdeal.valor.toFixed(2), '83.33');
  assert.equal(r.precoIdealComFixos.valor.toFixed(2), '120.37');
});

test('quantidade zero: preço com fixos vira aviso, sem NaN ou Infinity', () => {
  const r = calcular({ ...exemplo, quantidade: 0 });
  assert.equal(r.valido, true);
  assert.equal(r.precoIdeal.valor.toFixed(2), '83.33');
  assert.equal(r.precoIdealComFixos.calculavel, false);
  assert.match(r.precoIdealComFixos.mensagem, /quantidade vendida é zero/);
  assert.equal(r.precoIdealComFixos.valor, undefined);
  semNaNNemInfinity(r);
});

test('margem inválida (soma >= 100%): os dois preços viram aviso', () => {
  for (const margem of [84, 90]) {
    const r = calcular({ ...exemplo, margem });
    assert.equal(r.precoIdeal.calculavel, false);
    assert.equal(r.precoIdealComFixos.calculavel, false);
    assert.match(r.precoIdealComFixos.mensagem, /100% ou mais/);
  }
});

test('custos fixos zero: os dois preços ideais são iguais', () => {
  const r = calcular({ ...exemplo, fixos: 0 });
  assert.equal(r.precoIdealComFixos.valor, r.precoIdeal.valor);
  assert.equal(r.precoIdealComFixos.valor.toFixed(2), '83.33');
});

const { seloMargem, faltaPorUnidade, unidadesParaMeta } = require('./calculadora.js');

test('selo: exemplo padrão (19% contra 30%) fica abaixo da meta', () => {
  const r = calcular(exemplo);
  assert.equal(r.alertas.seloMargem.valor, 'Abaixo da meta');
});

test('selo: acima da meta, exatamente na meta e prejuízo', () => {
  assert.equal(calcular({ ...exemplo, margem: 10 }).alertas.seloMargem.valor, 'Acima da meta');
  assert.equal(calcular({ ...exemplo, margem: 19 }).alertas.seloMargem.valor, 'Acima da meta');
  assert.equal(calcular({ ...exemplo, fixos: 5000 }).alertas.seloMargem.valor, 'Prejuízo');
  assert.equal(seloMargem({ calculavel: true, valor: 0 }, 0.3).valor, 'Abaixo da meta');
});

test('selo: receita zero deixa o selo sem cálculo', () => {
  const r = calcular({ ...exemplo, quantidade: 0 });
  assert.equal(r.alertas.seloMargem.calculavel, false);
  assert.equal(r.alertas.faltaPorUnidade.calculavel, false);
  semNaNNemInfinity(r);
});

test('quanto falta por unidade: preço ideal com fixos − preço atual (20,37)', () => {
  const r = calcular(exemplo);
  perto(r.alertas.faltaPorUnidade.valor, 20.37);
  assert.ok(Math.abs(r.alertas.faltaPorUnidade.valor - (r.precoIdealComFixos.valor - 100)) < 1e-9);
});

test('quanto falta: acima da meta não mostra valor; margem impossível vira aviso', () => {
  assert.equal(calcular({ ...exemplo, margem: 10 }).alertas.faltaPorUnidade.calculavel, false);
  const r = calcular({ ...exemplo, margem: 90 });
  assert.equal(r.alertas.faltaPorUnidade.calculavel, false);
  assert.match(r.alertas.faltaPorUnidade.mensagem, /100% ou mais/);
});

test('meta de lucro: (fixos + lucro desejado) / lucro unitário, para cima', () => {
  assert.equal(calcular({ ...exemplo, lucroDesejado: 3000 }).alertas.unidadesParaMeta.valor, 129);
  assert.equal(calcular({ ...exemplo, lucroDesejado: '1.900' }).alertas.unidadesParaMeta.valor, 100);
  assert.equal(unidadesParaMeta(0, 0, 39).valor, 0);
});

test('meta de lucro: lucro unitário zero ou negativo vira aviso', () => {
  for (const preco of [45 / 0.84, 50]) {
    const r = calcular({ ...exemplo, preco, lucroDesejado: 1000 });
    assert.equal(r.alertas.unidadesParaMeta.calculavel, false);
    assert.match(r.alertas.unidadesParaMeta.mensagem, /zero ou negativo/);
    semNaNNemInfinity(r);
  }
});

test('meta de lucro: campo vazio é opcional; negativo ou inválido é recusado', () => {
  const r = calcular({ ...exemplo, lucroDesejado: '' });
  assert.equal(r.valido, true);
  assert.equal(r.alertas.unidadesParaMeta.calculavel, false);
  for (const v of ['-1', 'abc']) {
    const e = calcular({ ...exemplo, lucroDesejado: v });
    assert.equal(e.valido, false);
    assert.equal(e.erros[0].campo, 'lucroDesejado');
  }
});

const { graficoEquilibrio } = require('./calculadora.js');

test('QA: falta menor que R$ 0,01 conta como meta atingida (preço 120,37)', () => {
  const r = calcular({ ...exemplo, preco: '120,37' });
  assert.ok(r.periodo.margemPeriodo.valor < 0.3);
  assert.equal(r.alertas.seloMargem.valor, 'Acima da meta');
  assert.equal(r.alertas.faltaPorUnidade.calculavel, false);
  assert.equal(calcular({ ...exemplo, preco: '120,36' }).alertas.seloMargem.valor, 'Abaixo da meta');
});

test('gráfico: exemplo padrão vai de 0 a 200 un e cruza em 52 un / R$ 5.128,21', () => {
  const g = calcular(exemplo).grafico;
  assert.equal(g.calculavel, true);
  const v = g.valor;
  assert.equal(v.qMax, 200);
  assert.equal(v.pontos.length, 11);
  assert.deepEqual(v.pontos[0], { quantidade: 0, receita: 0, custoTotal: 2000 });
  const fim = v.pontos[10];
  assert.equal(fim.quantidade, 200);
  perto(fim.receita, 20000);
  perto(fim.custoTotal, 14200);
  assert.equal(v.cruzamento.unidades, 52);
  perto(v.cruzamento.quantidade, 51.28);
  perto(v.cruzamento.reais, 5128.21);
  assert.equal(v.yMax, 20000);
  assert.deepEqual(v.marcasY, [0, 5000, 10000, 15000, 20000]);
  semNaNNemInfinity(g);
});

test('gráfico: sem ponto de equilíbrio vira aviso, sem NaN nem Infinity', () => {
  for (const preco of [45 / 0.84, 50, 0]) {
    const g = calcular({ ...exemplo, preco }).grafico;
    assert.equal(g.calculavel, false);
    assert.match(g.mensagem, /Sem ponto de equilíbrio/);
    assert.equal(g.valor, undefined);
    semNaNNemInfinity(g);
  }
  const invalido = graficoEquilibrio({ preco: NaN, custoVariavelUnitario: 61, fixos: 2000, quantidade: 100 });
  assert.equal(invalido.calculavel, false);
  assert.equal(calcular({ ...exemplo, preco: 'abc' }).grafico, undefined);
});

test('gráfico: custos fixos zero cruzam na origem', () => {
  const v = calcular({ ...exemplo, fixos: 0 }).grafico.valor;
  assert.equal(v.qMax, 200);
  assert.deepEqual(v.cruzamento, { quantidade: 0, unidades: 0, reais: 0 });
  assert.equal(v.pontos[0].custoTotal, 0);
  assert.ok(v.pontos.slice(1).every(p => p.receita > p.custoTotal));
  const vazio = graficoEquilibrio({ preco: 100, custoVariavelUnitario: 61, fixos: 0, quantidade: 0 });
  assert.equal(vazio.valor.qMax, 10);
  semNaNNemInfinity(vazio);
});
