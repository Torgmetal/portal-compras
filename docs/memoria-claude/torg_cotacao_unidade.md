# Cotação — converter a unidade em que o fornecedor cotou

**22/09/2026.** Matheus: *"orçamos em unidades, tipo 2500 parafusos, e os fornecedores mandam a
cotação em CT — nesse caso seriam 25 CT"*. Decisões dele: a conversão mora **na cotação**, quem
declara é **o comprador** (o fornecedor continua respondendo como hoje), e nas telhas o documento
traz ML **e** UN, então o comprador tem os dois números na mão.

| | |
|---|---|
| Regra | `lib/unidades.js` |
| Colunas | `CotacaoItem.unidadeCotada`, `CotacaoItem.fatorParaRM` (`scripts/ensure-cotacao-unidade.mjs`) |
| Tela | `app/compras/rm/[id]/_componentes/ConversaoUnidade.jsx` (coluna **Un.**) |
| Conversão | `aplicarConversao`, em `app/api/cotacao/[id]/lancar-manual/route.js` |

⚠⚠ **A INVARIANTE É O TOTAL.** `2500 × R$ 0,50` e `25 × R$ 50,00` são o mesmo dinheiro. Converter a
quantidade **sem** o preço é o defeito que `lib/pedido-itens.js` documenta ter custado 136 de 578
itens vencedores divergentes — por isso a quantidade e o preço saem **juntos** da mesma função, e o
total é conferido ao centavo. Não fechando, a gravação é **recusada**.

⚠⚠ **O QUE FICA GRAVADO É O CANÔNICO** — quantidade e preço na unidade da RM. Medido: **25 arquivos**
leem `qtdCotada`, e todos tratam como quantidade na base da RM (o `saude-financeira-op.js` chega a
misturar com `rmItem.qtd`). Guardando "25 CT", o primeiro que esquecesse da conversão erraria por
**100×**, em silêncio. As duas colunas novas são só a **trilha do documento**.

⚠⚠ **O PREÇO CONVERTIDO NÃO É ARREDONDADO A DUAS CASAS.** `round2` no unitário quebra a invariante
com fator que não divide redondo: R$ 49,99 o cento vira R$ 0,4999 por unidade, e arredondar para
R$ 0,50 leva o total de R$ 1.249,75 para R$ 1.250,00. Quem fecha no centavo é o **total**.

⚠⚠ **QUEM CONVERTE É O SERVIDOR.** A tela mostra a conta para o comprador conferir contra o papel;
fazer a conversão no navegador deixaria o número gravado na mão de aba velha e arredondamento de JS.

⚠ **Metade das conversões não cabe em tabela.** CT=100, MI=1000, DZ=12 são fixos; **ML↔UN** (telha)
depende do comprimento e **KG↔UN** do peso da peça — ali `fatorFixo` devolve `null` e quem tem o
documento informa. Devolver 1 seria inventar equivalência.

⚠ **Unidade desconhecida devolve `null`, nunca um chute.** O `normalizeUnidade` do pedido faz
`substring(0, 6)` no que não reconhece — foi assim que `"LATA 2,80L"` virou `"LATA280"` no Omie.
`"LATA 18L"` e afins são **embalagem**, com o volume no nome; não entram no dicionário.

⚠ **63 grafias para ~12 unidades** na `RMItem` ("PEÇA" em 7 formas, "barra" em 4) — por isso a
conversão normaliza antes de qualquer conta.

⚠ **O crachá da escolha de vencedor melhora de graça:** com tudo na mesma base, `sugerir-vencedores`
para de comparar R$ 0,50/UN com R$ 48,00/CT e escolher o mais caro.
