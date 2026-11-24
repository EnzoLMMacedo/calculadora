var CAMPOS = [
  { chave: 'preco', nome: 'Preço de venda unitário' },
  { chave: 'custo', nome: 'Custo do produto unitário' },
  { chave: 'outros', nome: 'Outros custos variáveis unitários' },
  { chave: 'impostos', nome: 'Impostos' },
  { chave: 'comissoes', nome: 'Comissões/taxas' },
  { chave: 'quantidade', nome: 'Quantidade vendida' },
  { chave: 'fixos', nome: 'Custos fixos do período' },
  { chave: 'margem', nome: 'Margem de lucro desejada' }
];

// Aceita número ou texto no formato brasileiro: vírgula é decimal e ponto é milhar
// ("1.234,56", "2.000", "6,5"). Ponto sem grupos de 3 dígitos ("6.5") vale como decimal.
// Ponto de milhar mal formado ("1.23,4") é recusado, para não calcular errado em silêncio.
function lerNumero(valor) {
  if (typeof valor === 'number') return valor;
  if (typeof valor !== 'string') return NaN;
  var texto = valor.trim();
  if (texto === '') return NaN;
  var milhar = /^-?\d{1,3}(\.\d{3})+$/;
  if (texto.indexOf(',') !== -1) {
    if (!/^-?(\d{1,3}(\.\d{3})+|\d+),\d+$/.test(texto)) return NaN;
    texto = texto.replace(/\./g, '').replace(',', '.');
  } else if (milhar.test(texto)) {
    texto = texto.replace(/\./g, '');
  }
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(texto)) return NaN;
  return Number(texto);
}

// Zera ruído de ponto flutuante (ex.: 1 - 0,06 - 0,10 - 0,84 = 1e-17).
function limpar(valor) {
  return Math.abs(valor) < 1e-9 ? 0 : valor;
}

function ok(valor) {
  return { calculavel: true, valor: valor };
}

function naoCalculavel(mensagem) {
  return { calculavel: false, mensagem: mensagem };
}

function calcular(entradas) {
  var erros = [];
  var n = {};
  CAMPOS.forEach(function (campo) {
    var bruto = entradas ? entradas[campo.chave] : undefined;
    var vazio = bruto === undefined || bruto === null || (typeof bruto === 'string' && bruto.trim() === '');
    var valor = lerNumero(bruto);
    var problema = vazio ? 'preencha este campo.'
      : !isFinite(valor) ? 'digite um número válido.'
      : valor < 0 ? 'não pode ser negativo.'
      : null;
    if (problema) erros.push({ campo: campo.chave, mensagem: campo.nome + ': ' + problema });
    n[campo.chave] = valor;
  });
  if (erros.length) return { valido: false, erros: erros };

  var b2 = n.preco, b3 = n.custo, b4 = n.outros, b7 = n.quantidade, b8 = n.fixos;
  var b5 = n.impostos / 100, b6 = n.comissoes / 100, b9 = n.margem / 100;

  var impostos = b2 * b5;
  var comissoes = b2 * b6;
  var custoTotal = b3 + b4 + b2 * b5 + b2 * b6;
  var lucro = limpar(b2 - b3 - b4 - b2 * b5 - b2 * b6);

  var margemLiquida = b2 === 0
    ? naoCalculavel('Margem líquida não calculável: o preço de venda é zero.')
    : ok(lucro / b2);
  var markup = b3 + b4 === 0
    ? naoCalculavel('Markup indefinido: custo do produto + outros custos é zero.')
    : ok((b2 - b3 - b4) / (b3 + b4));

  var peUnidades, peReais;
  if (lucro <= 0) {
    peUnidades = naoCalculavel('Ponto de equilíbrio não existe: a margem de contribuição por unidade é zero ou negativa.');
  } else {
    // Arredonda ruído de ponto flutuante (ex.: 3,0000000000000004) antes do teto.
    peUnidades = ok(Math.ceil(Math.round((b8 / lucro) * 1e9) / 1e9));
  }
  if (b2 === 0) {
    peReais = naoCalculavel('Ponto de equilíbrio em R$ não calculável: o preço de venda é zero.');
  } else if (lucro <= 0) {
    peReais = naoCalculavel('Ponto de equilíbrio não existe: a margem de contribuição por unidade é zero ou negativa.');
  } else {
    peReais = ok(b8 / (lucro / b2));
  }

  var divisor = limpar(1 - b5 - b6 - b9);
  var precoIdeal = divisor <= 0
    ? naoCalculavel('Preço ideal impossível: impostos + comissões + margem desejada somam 100% ou mais.')
    : ok((b3 + b4) / divisor);
  // Igual ao preço ideal, mas somando ao custo a parte dos custos fixos de cada unidade.
  var precoIdealComFixos = !precoIdeal.calculavel
    ? naoCalculavel(precoIdeal.mensagem)
    : b7 === 0
      ? naoCalculavel('Preço ideal cobrindo custos fixos não calculável: a quantidade vendida é zero.')
      : ok((b3 + b4 + b8 / b7) / divisor);

  var receita = b2 * b7;
  var lucroTotal = limpar(receita - custoTotal * b7 - b8);
  var margemPeriodo = receita === 0
    ? naoCalculavel('Margem de lucro do período não calculável: a receita é zero.')
    : ok(lucroTotal / receita);
  var lucroNoPrecoIdeal = precoIdeal.calculavel
    ? ok(precoIdeal.valor * b9)
    : naoCalculavel(precoIdeal.mensagem);

  return {
    valido: true,
    porUnidade: {
      impostos: impostos,
      comissoes: comissoes,
      custoTotal: custoTotal,
      lucro: lucro,
      margemLiquida: margemLiquida,
      markup: markup
    },
    periodo: {
      receita: receita,
      custosVariaveis: custoTotal * b7,
      lucroTotal: lucroTotal,
      margemPeriodo: margemPeriodo,
      peUnidades: peUnidades,
      peReais: peReais
    },
    precoIdeal: precoIdeal,
    precoIdealComFixos: precoIdealComFixos,
    lucroNoPrecoIdeal: lucroNoPrecoIdeal
  };
}

if (typeof module !== 'undefined') module.exports = { calcular, lerNumero };
