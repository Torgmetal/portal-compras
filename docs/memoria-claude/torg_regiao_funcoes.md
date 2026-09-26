---
name: torg_regiao_funcoes
description: As funções da Vercel rodam em WASHINGTON (iad1) e o banco Neon em SÃO PAULO — ~120 ms por consulta; laço que grava linha a linha estoura o tempo (LPC da T118B, 25/09/2026). Gravar em lote.
metadata:
  type: project
---

**Medido em 25/09/2026:** o cabeçalho de qualquer rota do portal devolve `x-vercel-id: gru1::iad1::…` —
a borda é São Paulo (gru1), mas a FUNÇÃO roda em Washington (iad1). O Neon ("neon-cyclamen-candle") está
em São Paulo (sa-east-1). Cada consulta ao banco é uma ida e volta de ~120 ms. Não há `regions` no
`vercel.json`: é o padrão do projeto na Vercel.

⚠⚠ **LAÇO COM `await prisma…` DENTRO É O QUE ESTOURA.** A importação da LPC fazia busca + gravação por
peça (~240 ms cada): a T118B (1.240 peças, OP-118) levou os 300 s inteiros e foi cortada no passo das
ligações conjunto → croqui (22 gravadas) — lista pela metade, sem registro na auditoria. Mike viu "HTTP 504".
Corrigido com `lib/lpc-gravar.js`: uma leitura das existentes, `createManyAndReturn` para as novas,
`update` em paralelo com teto 12 (`emParalelo`) e `createMany` para as ligações. Mesmos campos de antes.

**Regra para código novo:** nada de consulta por item em laço numa rota. Ler tudo de uma vez, gravar em
lote (ou em paralelo com teto — o Neon é pequeno, ver CLAUDE.md "Neon compute pequena").

**Pendente (decisão do Vitor):** mudar a região das funções para São Paulo (gru1) na Vercel
(Settings → Functions → Function Region). Derruba a ida e volta de ~120 ms para poucos ms em TODAS as
rotas; o Omie também é no Brasil. É configuração da conta — não mudar sem aprovação.
