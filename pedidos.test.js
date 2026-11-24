const test = require('node:test');
const assert = require('node:assert/strict');
const p = require('./pedidos.js');

const produtos = ['Camiseta', 'Boné'];
const base = [
  { data: '2026-11-01', produto: 'Camiseta', tipo: 'entrada', quantidade: 10, valor: 20 },
  { data: '2026-11-05', produto: 'Camiseta', tipo: 'entrada', quantidade: 10, valor: 30 },
  { data: '2026-11-10', produto: 'Camiseta', tipo: 'saida', quantidade: 5, valor: 50 }
];

function perto(atual, esperado) {
  assert.equal(Number(atual.toFixed(2)), esperado);
}

test('custo médio: 10 a R$ 20 + 10 a R$ 30, venda de 5 a R$ 50', () => {
  const c = p.resumir(produtos, base).porProduto[0];
  assert.equal(c.qtdEntrada, 20);
  assert.equal(c.qtdSaida, 5);
  assert.equal(c.estoque, 15);
  perto(c.custoMedio, 25);
  perto(c.custoEntradas, 500);
  perto(c.custoVendas, 125);
  perto(c.receita, 250);
  perto(c.lucro, 125);
  perto(c.margem.valor, 0.5);
  perto(c.valorEstoque, 375);
});

test('custo médio usa só as entradas até a data da venda', () => {
  const l = [
    { data: '2026-11-01', produto: 'Camiseta', tipo: 'entrada', quantidade: 10, valor: 20 },
    { data: '2026-11-02', produto: 'Camiseta', tipo: 'saida', quantidade: 10, valor: 40 },
    { data: '2026-11-03', produto: 'Camiseta', tipo: 'entrada', quantidade: 10, valor: 30 }
  ];
  const c = p.resumir(produtos, l).porProduto[0];
  perto(c.custoVendas, 200);
  perto(c.lucro, 200);
  perto(c.custoMedio, 30);
});

test('produto sem venda: lucro 0 e margem não calculável', () => {
  const b = p.resumir(produtos, base).porProduto[1];
  assert.equal(b.receita, 0);
  assert.equal(b.lucro, 0);
  assert.equal(b.margem.calculavel, false);
  assert.match(b.margem.mensagem, /Não calculável/);
});

test('totais somam todos os produtos', () => {
  const l = base.concat([
    { data: '2026-11-02', produto: 'Boné', tipo: 'entrada', quantidade: 4, valor: 10 },
    { data: '2026-11-03', produto: 'Boné', tipo: 'saida', quantidade: 4, valor: 8 }
  ]);
  const t = p.resumir(produtos, l).totais;
  perto(t.receita, 282);
  perto(t.custoVendas, 165);
  perto(t.lucro, 117);
  assert.equal(t.qtdEntrada, 24);
  assert.equal(t.qtdSaida, 9);
});

test('lucro negativo quando vende abaixo do custo médio', () => {
  const l = [
    { data: '2026-11-01', produto: 'Boné', tipo: 'entrada', quantidade: 2, valor: 10 },
    { data: '2026-11-02', produto: 'Boné', tipo: 'saida', quantidade: 2, valor: 6 }
  ];
  const b = p.resumir(produtos, l).porProduto[1];
  perto(b.lucro, -8);
  assert.ok(b.margem.valor < 0);
});

test('saída maior que o estoque é bloqueada', () => {
  const r = p.adicionarLancamento(produtos, base,
    { data: '2026-11-11', produto: 'Camiseta', tipo: 'saida', quantidade: '16', valor: '50' });
  assert.match(r.erro, /maior que o estoque/);
  const semEstoque = p.adicionarLancamento(produtos, [],
    { data: '2026-11-11', produto: 'Boné', tipo: 'saida', quantidade: '1', valor: '5' });
  assert.match(semEstoque.erro, /maior que o estoque/);
});

test('saída retroativa antes da entrada é bloqueada (estoque negativo na data)', () => {
  const r = p.adicionarLancamento(produtos, base,
    { data: '2026-10-31', produto: 'Camiseta', tipo: 'saida', quantidade: '1', valor: '50' });
  assert.match(r.erro, /maior que o estoque/);
});

test('vender exatamente o estoque é permitido e zera o estoque', () => {
  const r = p.adicionarLancamento(produtos, base,
    { data: '2026-11-12', produto: 'camiseta', tipo: 'saida', quantidade: '15', valor: '50' });
  assert.equal(r.erro, undefined);
  assert.equal(p.resumir(produtos, r.lancamentos).porProduto[0].estoque, 0);
  assert.equal(r.lancamentos[3].produto, 'Camiseta');
});

test('venda retroativa bloqueada: o aviso cita a venda recém-digitada, não a seguinte', () => {
  const r = p.adicionarLancamento(produtos, base,
    { data: '2026-11-07', produto: 'Camiseta', tipo: 'saida', quantidade: '16', valor: '50' });
  assert.match(r.erro, /^Saída de 16 de Camiseta em 2026-11-07 /);
  assert.match(r.erro, /estoque disponível nessa data \(15\)/);
  assert.match(r.erro, /venda de 2026-11-10/);
  const ok = p.adicionarLancamento(produtos, base,
    { data: '2026-11-07', produto: 'Camiseta', tipo: 'saida', quantidade: '15', valor: '50' });
  assert.equal(ok.erro, undefined);
});

test('lançamentos digitados fora da ordem de data dão o mesmo resultado', () => {
  const embaralhados = [base[2], base[0], base[1]];
  let lista = [];
  const recusados = [];
  for (const l of embaralhados) {
    const r = p.adicionarLancamento(produtos, lista, { ...l, quantidade: String(l.quantidade), valor: String(l.valor) });
    if (r.erro) recusados.push(l); else lista = r.lancamentos;
  }
  // A venda de 10/11 chega antes de qualquer entrada e é recusada; redigitada depois, entra.
  assert.equal(recusados.length, 1);
  lista = p.adicionarLancamento(produtos, lista, { ...base[2], quantidade: '5', valor: '50' }).lancamentos;
  assert.deepEqual(p.resumir(produtos, lista), p.resumir(produtos, base));

  const fora = [base[1], base[2], base[0]];
  const c = p.resumir(produtos, fora).porProduto[0];
  perto(c.custoVendas, 125);
  perto(c.lucro, 125);
  assert.equal(c.estoque, 15);
});

test('localStorage inconsistente vira aviso; vazio abre sem aviso', () => {
  assert.deepEqual(p.validarEstado(null), { vazio: true });
  const bom = p.validarEstado(JSON.stringify({ produtos, lancamentos: base }));
  assert.deepEqual(bom.estado.lancamentos, base);
  assert.match(p.validarEstado('{quebrado').erro, /JSON/);
  assert.match(p.validarEstado('{"produtos":[]}').erro, /faltam/);
  assert.match(p.validarEstado(JSON.stringify({ produtos: ['A', 'a'], lancamentos: [] })).erro, /repetido/);
  assert.match(p.validarEstado(JSON.stringify({ produtos, lancamentos: [{ ...base[0], quantidade: -1 }] })).erro, /lançamento nº 1: Quantidade/);
  assert.match(p.validarEstado(JSON.stringify({ produtos, lancamentos: [base[2]] })).erro, /maior que o estoque/);
});

test('remover entrada que deixaria uma venda sem estoque é recusado', () => {
  const r = p.removerLancamento(produtos, base, 0);
  assert.equal(r.erro, undefined);
  const r2 = p.removerLancamento(produtos, r.lancamentos, 0);
  assert.match(r2.erro, /Não dá para remover/);
});

test('validação do lançamento: texto pt-BR aceito, valores inválidos recusados', () => {
  const ok = p.normalizarLancamento({ data: '2026-11-01', produto: 'Boné', tipo: 'entrada', quantidade: '1.000', valor: '12,50' }, produtos);
  assert.equal(ok.lancamento.quantidade, 1000);
  assert.equal(ok.lancamento.valor, 12.5);
  const casos = [
    [{ produto: '' }, /Escolha um produto/],
    [{ produto: 'Meia' }, /não está cadastrado/],
    [{ tipo: 'troca' }, /Tipo/],
    [{ data: '2026-02-30' }, /Data inválida/],
    [{ quantidade: '0' }, /Quantidade/],
    [{ quantidade: 'abc' }, /Quantidade/],
    [{ valor: '-1' }, /Valor unitário/]
  ];
  for (const [mudanca, erro] of casos) {
    const r = p.normalizarLancamento({ data: '2026-11-01', produto: 'Boné', tipo: 'entrada', quantidade: '1', valor: '1', ...mudanca }, produtos);
    assert.match(r.erro, erro);
  }
});

test('cadastro de produto: nome vazio e repetido são recusados', () => {
  assert.match(p.adicionarProduto(produtos, '  ').erro, /Digite/);
  assert.match(p.adicionarProduto(produtos, 'boné').erro, /já cadastrado/);
  assert.deepEqual(p.adicionarProduto(produtos, 'Meia').produtos, ['Camiseta', 'Boné', 'Meia']);
});

test('CSV: exportar e importar devolve os mesmos dados', () => {
  const nomes = ['Camiseta', 'Boné', 'Caneca; "grande"'];
  const csv = p.paraCSV(nomes, base);
  assert.match(csv, /^data;produto;tipo;quantidade;valor_unitario\n/);
  assert.match(csv, /2026-11-10;Camiseta;saida;5;50/);
  const r = p.lerCSV(csv);
  assert.equal(r.erro, undefined);
  assert.deepEqual(r.produtos.slice().sort(), nomes.slice().sort());
  assert.deepEqual(r.lancamentos, base);
});

test('CSV: nomes que começam com = + - @ ganham apóstrofo e voltam iguais', () => {
  const nomes = ['=SOMA(A1)', '+55 chip', '-desconto', '@marca', "'já tinha", 'Normal'];
  const lanc = nomes.map((n, i) => ({ data: '2026-11-0' + (i + 1), produto: n, tipo: 'entrada', quantidade: 1, valor: 2 }));
  const csv = p.paraCSV(nomes, lanc);
  for (const linha of csv.trim().split('\n').slice(1)) {
    assert.doesNotMatch(linha.split(';')[1], /^[=+\-@]/);
  }
  assert.match(csv, /;'=SOMA\(A1\);/);
  assert.match(csv, /;''já tinha;/);
  assert.match(csv, /;Normal;/);
  const r = p.lerCSV(csv);
  assert.equal(r.erro, undefined);
  assert.deepEqual(r.produtos, nomes);
  assert.deepEqual(r.lancamentos, lanc);
});

test('CSV: aceita vírgula decimal e recusa o arquivo inteiro se uma linha estiver errada', () => {
  const bom = 'data;produto;tipo;quantidade;valor_unitario\n2026-11-01;Copo;entrada;3;12,50\n2026-11-02;Copo;saída;1;20\n';
  const r = p.lerCSV(bom);
  assert.equal(r.lancamentos[0].valor, 12.5);
  assert.equal(r.lancamentos[1].tipo, 'saida');
  assert.match(p.lerCSV('nome,valor\n').erro, /não reconhecido/);
  assert.match(p.lerCSV(bom + '2026-11-03;Copo;entrada;x;1\n').erro, /Linha 4: Quantidade/);
  assert.match(p.lerCSV(bom + '2026-11-03;Copo;saida;9;1\n').erro, /maior que o estoque/);
});
