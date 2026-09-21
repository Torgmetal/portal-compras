# `include` sem `select` mandou o token da cotação para o navegador

**17/09/2026.** Encontrado ao liberar o Painel de OPs para o Almoxarifado — o defeito era **anterior**
e valia para ADMIN e COMPRAS.

## O que acontecia

`app/compras/painel-ops/[opId]/page.js` busca as cotações da OP com `cotacoes: { include: {...} }`
— **sem `select`**. O Prisma então traz **todos os escalares** de `Cotacao`, incluindo:

```prisma
token String? @unique   // prisma/schema.prisma
```

Esse token é a chave do portal **público** do fornecedor, `app/fornecedores/c/[token]/page.js`, que
abre **sem login**: o fornecedor lê a RM, vê razão social, CNPJ, IE e endereço do cliente, e **envia
a proposta**.

O objeto ia inteiro para o Client Component (`rms: op.rms` → `<MapaCotacaoClient op={data} />`).

⚠⚠ **Conferido no HTML renderizado, não só no código**: abri a OP-097 logado e procurei o token da
cotação da VITOR na página — estava lá. **Quem abria a tela de uma OP recebia o link privado de
cotação de todos os fornecedores dela.**

⚠ As **cotações externas** (consolidadas de outra OP, anexadas em `op.rms[0].cotacoes`) usam outro
`findMany`, também com `include` sem `select` — mesma exposição, segunda origem.

## A correção

Tirado na **serialização**, não na consulta:

```js
const semToken = (rms) => rms.map((rm) => ({
  ...rm,
  cotacoes: (rm.cotacoes || []).map(({ token, ...resto }) => resto),
}));
```

⚠ **Na serialização de propósito**: o `include` alimenta cálculos do servidor mais acima (verba
comprometida, contagem de cotações por RM), e recortá-lo na consulta arriscaria quebrá-los em
silêncio. Aqui a regra é uma linha e cobre as duas origens.

## A lição

⚠⚠ **`include` num model que tem segredo é um vazamento esperando um Client Component.** O mapa de
cotação usa só 7 campos de `Cotacao` (`id, fornecedorNome, cnpj, nCodOmie, status, totalProposta,
itens`) — o `include` mandava dezenas. Em model com `token`, `password`, `secret` ou qualquer chave
de acesso público, **`select` explícito não é preciosismo**.

⚠ E o teste que vale é **procurar o segredo no HTML**, não ler o código: o payload RSC escapa as
aspas, então um `grep '"token":"..."'` não acha. Busca pela string crua do token, sim.

## Onde mais olhar (não verificado)

Qualquer outra tela que faça `include` de `Cotacao` e passe o resultado a um Client Component. Não
varri o portal inteiro — foi encontrado por acaso, ao auditar esta tela para um público novo.
