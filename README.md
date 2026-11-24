# Calculadora de vendas e custos

Calcula custos, lucro, margem, markup, ponto de equilíbrio e preço ideal de um produto.

No ar: https://enzolmmacedo.github.io/calculadora/

## Entradas e saídas por produto

A página `pedidos.html` cadastra produtos e lança entradas (compras) e saídas (vendas). Ela mostra, por produto, o que entrou e saiu, o estoque, o custo das vendas, a receita, o lucro e a margem.

- O custo das vendas usa o custo médio ponderado das entradas até a data da venda.
- Uma saída maior que o estoque daquela data é bloqueada.
- Os dados ficam salvos só no navegador (localStorage). Use “Exportar CSV” para guardar um backup e “Importar CSV” para restaurar ou levar para outro aparelho. O CSV usa `;` e vírgula decimal: `data;produto;tipo;quantidade;valor_unitario`.

## Como abrir

Dê dois cliques em `index.html`. Abre direto no navegador, sem servidor e sem instalar nada.

## Como testar

Com o Node.js 18 ou mais recente instalado, rode na pasta do projeto:

```
node --test
```
