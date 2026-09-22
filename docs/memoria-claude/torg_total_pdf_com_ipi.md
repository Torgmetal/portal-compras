# O total da linha do PDF vem COM IPI — e a tela comparava contra o líquido

**21/09/2026.** Assim que o casamento PDF × RM passou a funcionar (`lib/cotacao-matching.js`), as
**7 linhas casadas** da proposta da SOUFER na RM T122-002 saíram TODAS com o aviso vermelho
`⚠ PDF: R$ …` na tela do fornecedor — e as 7 estavam certas.

## A conta que o próprio rodapé entregava

```
Subtotal (preço × qtd):  R$ 152.197,90
Total com IPI:           R$ 157.144,33     ← × 1,0325, o IPI de todas as linhas
```

A tela comparava `preço × qtd` (LÍQUIDO) contra o `total` que o parser leu — que no layout SOUFER
é a última coluna da linha, **com IPI**.

⚠⚠ **NÃO ERA REGRESSÃO: era um defeito que só ficou visível quando o casamento passou a funcionar.**
Antes nada casava, então nada era comparado. É o padrão a esperar de toda correção que destrava um
fluxo morto — o que estava do outro lado nunca rodou.

## Medido, não deduzido

Os dois PDFs reais da SOUFER (T122-001 e T122-002, **17 linhas**) fecham em
`qtd × preço × (1 + IPI/100)` com erro de **0,000%** em todas. O da T122-001 tem IPI zero e cai na
identidade.

⚠⚠ **O COMENTÁRIO DO PRÓPRIO ARQUIVO QUASE ME FEZ DESCARTAR A MEDIÇÃO.** Uma das linhas de exemplo
do `SOUFER_RE` (`472 KG … 6,48 … 10,00 … 2.691,53`) não fecha em base nenhuma — 472 × 6,48 =
3.058,56. É comentário errado, não documento. O Codex levantou isso como risco e estava certo em
levantar; a saída foi **medir no PDF real**, não escolher entre dois comentários.

## A correção: quem conhece o layout declara a BASE

`lib/cotacao-total-pdf.js` — `BASE_TOTAL.LIQUIDO` / `COM_IPI`, e `divergeDoPdf`:

- base **declarada** → comparação ESTRITA contra aquela base (a checagem não foi afrouxada);
- base **desconhecida** (GERDAU hoje — sem PDF real para medir) → aceita as duas leituras. Custa um
  ponto cego do tamanho exato do IPI e mantém de pé tudo que erra mais que isso.

⚠⚠ **O NÚMERO EXIBIDO CONTINUA SENDO O IMPRESSO NO PDF.** Cheguei a projetar converter o total para
líquido (dividir por `1 + IPI`) antes de exibir — seria pior: o aviso existe para o fornecedor bater
a tela contra a folha que ele mandou, e passaria a mostrar um valor que não está em documento
nenhum. **Conserte a comparação, não o dado.**

## O risco mais caro estava no outro caminho (achado do Codex)

`sanitizeItens` (rota da IA): vendo `preço × qtd` divergir do total declarado, ela concluía que o
"preço" extraído era o TOTAL da linha e **reescrevia o unitário** para `total ÷ qtd`. Num PDF cujo
total vem com IPI, isso **sobe a proposta do fornecedor em 3,25%** sozinho — o portal inventando
dinheiro no documento de outra empresa.

`ehTotalComImposto` é a guarda: IPI declarado e positivo, total batendo com a leitura COM imposto e
NÃO batendo com a líquida → **aviso, e o preço lido fica de pé**. Ambiguidade vira aviso, nunca
reescrita (mesma regra do `mesmaPeca`: "não sei" não vira "sim").

⚠ E a base acompanha o total nesse caso (`COM_IPI`), senão o alarme falso voltava pela tela.

⚠ Fora dessa janela, a reescrita de preço **continua acontecendo** (divergência de 20% ainda vira
`total ÷ qtd`). É o comportamento de hoje, congelado em teste de caracterização — a rigor 20% não
prova que o preço estava errado, só que algo não fecha.

## Onde mora

| | |
|---|---|
| Regra | `lib/cotacao-total-pdf.js` |
| Saneamento da IA | `lib/cotacao-itens-ia.js` (saiu da rota, que passava de 410 linhas) |
| Carimbo da base | `lib/pdf-parser-server.js` (SOUFER `COM_IPI`; GERDAU sem carimbo, de propósito) |
| Tela | `app/fornecedores/c/[token]/CotacaoFornecedorForm.jsx` (`l.pdfBaseTotal`) |
| Testes | `testes/lib/cotacao-total-pdf.teste.js`, `testes/lib/cotacao-itens-ia.teste.js` |

## Como provei na tela sem escrever em produção

Playwright interceptando **só** `/api/cotacao/anexar/*` (a única rota do fluxo que grava: blob +
linha em `Anexo`), respondida com um anexo falso. O parse e o casamento rodam de verdade. Medido:
**7 de 7 vermelhos viraram cinza**, o número exibido continua o impresso, e o documento de IPI zero
segue igual. ⚠ Usei o token de um fornecedor NÃO envolvido (a página do fornecedor é só leitura ao
abrir) — o da SOUFER é o que o Matheus vai preencher à mão.

⚠ `/api/parse-cotacao-ai` dá **500 no local** por falta de `ANTHROPIC_API_KEY` no `.env.local`, e o
fluxo cai no regex. Para esta prova foi o melhor cenário: o regex é justamente o caminho que falhou
com a SOUFER. Mas significa que **o caminho da IA não é testável na tela aqui** — só por teste.
