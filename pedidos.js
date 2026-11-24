// Entradas (compras) e saídas (vendas) por produto. Funções puras, sem DOM.
// Regras aprovadas pelo Enzo em 23/11/2026:
// - o custo das vendas usa o custo médio ponderado das entradas até a data da venda;
// - uma saída maior que o estoque daquele momento é bloqueada, com aviso.
var lerNum = typeof lerNumero === 'function' ? lerNumero : require('./calculadora.js').lerNumero;

function nomeChave(nome) {
  return String(nome || '').trim().toLocaleLowerCase('pt-BR');
}

function dataValida(texto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  var d = new Date(texto + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === texto;
}

// Ordena por data; no mesmo dia, mantém a ordem em que foram lançados.
function ordenar(lancamentos) {
  return lancamentos
    .map(function (l, i) { return { l: l, i: i }; })
    .sort(function (a, b) { return a.l.data < b.l.data ? -1 : a.l.data > b.l.data ? 1 : a.i - b.i; })
    .map(function (x) { return x.l; });
}

// Valida um lançamento isolado e devolve { lancamento } normalizado ou { erro }.
function normalizarLancamento(entrada, produtos) {
  var produto = String(entrada.produto || '').trim();
  var existe = produtos.some(function (p) { return nomeChave(p) === nomeChave(produto); });
  if (!produto) return { erro: 'Escolha um produto.' };
  if (!existe) return { erro: 'Produto "' + produto + '" não está cadastrado.' };
  if (entrada.tipo !== 'entrada' && entrada.tipo !== 'saida') return { erro: 'Tipo deve ser entrada ou saída.' };
  var data = String(entrada.data || '').trim();
  if (!dataValida(data)) return { erro: 'Data inválida (use AAAA-MM-DD).' };
  var quantidade = lerNum(entrada.quantidade);
  if (!isFinite(quantidade) || quantidade <= 0) return { erro: 'Quantidade deve ser um número maior que zero.' };
  var valor = lerNum(entrada.valor);
  if (!isFinite(valor) || valor < 0) return { erro: 'Valor unitário deve ser um número igual ou maior que zero.' };
  var nomeOficial = produtos.filter(function (p) { return nomeChave(p) === nomeChave(produto); })[0];
  return { lancamento: { data: data, produto: nomeOficial, tipo: entrada.tipo, quantidade: quantidade, valor: valor } };
}

// Percorre os lançamentos em ordem de data e acumula por produto.
// Devolve { porProduto, totais, erro } — erro aponta a primeira saída sem estoque.
function resumir(produtos, lancamentos) {
  var mapa = {};
  produtos.forEach(function (nome) {
    mapa[nomeChave(nome)] = {
      produto: nome, qtdEntrada: 0, qtdSaida: 0, estoque: 0,
      custoEntradas: 0, custoMedio: 0, custoVendas: 0, receita: 0
    };
  });
  var erro = null, erroEm = null;
  ordenar(lancamentos).forEach(function (l) {
    if (erro) return;
    var p = mapa[nomeChave(l.produto)];
    if (!p) { erro = 'Lançamento de produto não cadastrado: ' + l.produto + '.'; erroEm = l; return; }
    if (l.tipo === 'entrada') {
      var novoEstoque = p.estoque + l.quantidade;
      p.custoMedio = (p.estoque * p.custoMedio + l.quantidade * l.valor) / novoEstoque;
      p.estoque = novoEstoque;
      p.qtdEntrada += l.quantidade;
      p.custoEntradas += l.quantidade * l.valor;
    } else {
      if (l.quantidade > p.estoque + 1e-9) {
        erro = 'Saída de ' + l.quantidade + ' de ' + p.produto + ' em ' + l.data +
          ' é maior que o estoque nessa data (' + p.estoque + ').';
        erroEm = l;
        return;
      }
      p.custoVendas += l.quantidade * p.custoMedio;
      p.receita += l.quantidade * l.valor;
      p.qtdSaida += l.quantidade;
      p.estoque = Math.abs(p.estoque - l.quantidade) < 1e-9 ? 0 : p.estoque - l.quantidade;
    }
  });

  var totais = { qtdEntrada: 0, qtdSaida: 0, custoEntradas: 0, custoVendas: 0, receita: 0, lucro: 0 };
  var porProduto = produtos.map(function (nome) {
    var p = mapa[nomeChave(nome)];
    p.lucro = p.receita - p.custoVendas;
    p.valorEstoque = p.estoque * p.custoMedio;
    p.margem = p.receita === 0
      ? { calculavel: false, mensagem: 'Não calculável (sem vendas)' }
      : { calculavel: true, valor: p.lucro / p.receita };
    ['qtdEntrada', 'qtdSaida', 'custoEntradas', 'custoVendas', 'receita', 'lucro'].forEach(function (k) { totais[k] += p[k]; });
    return p;
  });
  totais.margem = totais.receita === 0
    ? { calculavel: false, mensagem: 'Não calculável (sem vendas)' }
    : { calculavel: true, valor: totais.lucro / totais.receita };
  return { porProduto: porProduto, totais: totais, erro: erro, erroEm: erroEm };
}

// Quanto do produto ainda pode sair na posição de `novo` sem deixar
// nenhuma saída seguinte sem estoque.
function estoqueLivre(lancamentos, novo) {
  var chave = nomeChave(novo.produto), estoque = 0, livre = Infinity, depois = false;
  ordenar(lancamentos.concat([novo])).forEach(function (l) {
    if (l === novo) { depois = true; livre = estoque; return; }
    if (nomeChave(l.produto) !== chave) return;
    estoque += l.tipo === 'entrada' ? l.quantidade : -l.quantidade;
    if (depois) livre = Math.min(livre, estoque);
  });
  return Math.max(0, Math.round(livre * 1000) / 1000);
}

// Tenta incluir um lançamento; recusa se ficar estoque negativo em alguma data.
function adicionarLancamento(produtos, lancamentos, entrada) {
  var n = normalizarLancamento(entrada, produtos);
  if (n.erro) return { erro: n.erro };
  var novo = n.lancamento;
  var novos = lancamentos.concat([novo]);
  var r = resumir(produtos, novos);
  if (r.erro) {
    if (novo.tipo === 'saida' && r.erroEm && r.erroEm !== novo) {
      return {
        erro: 'Saída de ' + novo.quantidade + ' de ' + novo.produto + ' em ' + novo.data +
          ' é maior que o estoque disponível nessa data (' + estoqueLivre(lancamentos, novo) +
          '), porque deixaria sem estoque a venda de ' + r.erroEm.data + '.'
      };
    }
    return { erro: r.erro };
  }
  return { lancamentos: novos };
}

// Valida o que veio do localStorage. Devolve { estado }, { vazio: true } ou { erro }.
function validarEstado(texto) {
  if (texto === null || texto === undefined || texto === '') return { vazio: true };
  var bruto;
  try { bruto = JSON.parse(texto); } catch (e) { return { erro: 'os dados não são um JSON válido.' }; }
  if (!bruto || !Array.isArray(bruto.produtos) || !Array.isArray(bruto.lancamentos)) {
    return { erro: 'faltam as listas de produtos ou de lançamentos.' };
  }
  var produtos = [];
  for (var i = 0; i < bruto.produtos.length; i++) {
    var nome = typeof bruto.produtos[i] === 'string' ? bruto.produtos[i].trim() : '';
    if (!nome) return { erro: 'o produto nº ' + (i + 1) + ' não tem nome.' };
    if (produtos.some(function (p) { return nomeChave(p) === nomeChave(nome); })) {
      return { erro: 'o produto "' + nome + '" aparece repetido.' };
    }
    produtos.push(nome);
  }
  var lancamentos = [];
  for (var j = 0; j < bruto.lancamentos.length; j++) {
    var n = normalizarLancamento(bruto.lancamentos[j] || {}, produtos);
    if (n.erro) return { erro: 'lançamento nº ' + (j + 1) + ': ' + n.erro };
    lancamentos.push(n.lancamento);
  }
  var r = resumir(produtos, lancamentos);
  if (r.erro) return { erro: r.erro };
  return { estado: { produtos: produtos, lancamentos: lancamentos } };
}

// Remove o lançamento de índice i; recusa se uma saída posterior ficar sem estoque.
function removerLancamento(produtos, lancamentos, i) {
  var novos = lancamentos.filter(function (_, j) { return j !== i; });
  var r = resumir(produtos, novos);
  if (r.erro) return { erro: 'Não dá para remover: ' + r.erro };
  return { lancamentos: novos };
}

function adicionarProduto(produtos, nome) {
  var limpo = String(nome || '').trim();
  if (!limpo) return { erro: 'Digite o nome do produto.' };
  if (produtos.some(function (p) { return nomeChave(p) === nomeChave(limpo); })) return { erro: 'Produto já cadastrado.' };
  return { produtos: produtos.concat([limpo]) };
}

// CSV com ponto e vírgula e vírgula decimal, para abrir direto no Excel em português.
var CABECALHO = 'data;produto;tipo;quantidade;valor_unitario';

function numeroCSV(n) {
  return String(n).replace('.', ',');
}

// Nomes que começam com = + - @ viram fórmula no Excel; o apóstrofo impede isso.
// Nomes que já começam com apóstrofo também ganham um, para a volta ser exata.
function nomeParaCSV(nome) {
  var t = String(nome);
  return /^[=+\-@']/.test(t) ? "'" + t : t;
}

function nomeDoCSV(campo) {
  return campo.charAt(0) === "'" ? campo.slice(1) : campo;
}

function campoCSV(texto) {
  var t = nomeParaCSV(texto);
  return /[";\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}

function paraCSV(produtos, lancamentos) {
  var linhas = [CABECALHO];
  ordenar(lancamentos).forEach(function (l) {
    linhas.push([l.data, campoCSV(l.produto), l.tipo, numeroCSV(l.quantidade), numeroCSV(l.valor)].join(';'));
  });
  // Produtos sem lançamento também voltam na importação.
  produtos.forEach(function (p) {
    var temLancamento = lancamentos.some(function (l) { return nomeChave(l.produto) === nomeChave(p); });
    if (!temLancamento) linhas.push(';' + campoCSV(p) + ';;;');
  });
  return linhas.join('\n') + '\n';
}

function dividirLinhaCSV(linha) {
  var campos = [], atual = '', aspas = false;
  for (var i = 0; i < linha.length; i++) {
    var c = linha[i];
    if (aspas) {
      if (c === '"' && linha[i + 1] === '"') { atual += '"'; i++; }
      else if (c === '"') aspas = false;
      else atual += c;
    } else if (c === '"') aspas = true;
    else if (c === ';') { campos.push(atual); atual = ''; }
    else atual += c;
  }
  campos.push(atual);
  return campos;
}

// Lê o CSV inteiro; qualquer linha inválida recusa a importação toda (nada pela metade).
function lerCSV(texto) {
  var linhas = String(texto || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(function (l) { return l.trim() !== ''; });
  if (!linhas.length || linhas[0].trim().toLowerCase() !== CABECALHO) {
    return { erro: 'Arquivo não reconhecido: a primeira linha deve ser "' + CABECALHO + '".' };
  }
  var produtos = [], brutos = [];
  for (var i = 1; i < linhas.length; i++) {
    var c = dividirLinhaCSV(linhas[i]);
    if (c.length !== 5) return { erro: 'Linha ' + (i + 1) + ': esperava 5 colunas separadas por ";".' };
    var nome = nomeDoCSV(c[1].trim());
    if (!nome) return { erro: 'Linha ' + (i + 1) + ': produto vazio.' };
    if (!produtos.some(function (p) { return nomeChave(p) === nomeChave(nome); })) produtos.push(nome);
    if (c[0] === '' && c[2] === '' && c[3] === '' && c[4] === '') continue;
    brutos.push({ linha: i + 1, data: c[0], produto: nome, tipo: c[2].trim().toLowerCase().replace('í', 'i'), quantidade: c[3], valor: c[4] });
  }
  var lancamentos = [];
  for (var j = 0; j < brutos.length; j++) {
    var n = normalizarLancamento(brutos[j], produtos);
    if (n.erro) return { erro: 'Linha ' + brutos[j].linha + ': ' + n.erro };
    lancamentos.push(n.lancamento);
  }
  var r = resumir(produtos, lancamentos);
  if (r.erro) return { erro: r.erro };
  return { produtos: produtos, lancamentos: lancamentos };
}

if (typeof module !== 'undefined') {
  module.exports = { resumir, adicionarLancamento, removerLancamento, adicionarProduto, paraCSV, lerCSV, normalizarLancamento, validarEstado };
}
