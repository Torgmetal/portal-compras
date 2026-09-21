---
name: torg_desenho_rastreado
description: "Emitir desenho carimbado: rastreabilidade do material + quem emitiu/data/hora no PDF, arquivado no SharePoint e amarrado na §02 do Data Book"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1754de4f-06da-423d-8c20-70c99cbd5bad
  modified: 2026-08-19T00:20:24.678Z
---

Vitor (18/08/2026), sendo honesto sobre o processo: *"hoje basicamente pegamos o número na
planilha e preenchemos no croqui à mão; o procedimento fala que identificamos a escrita na peça,
o que pode ser verdade em partes, mas não temos a rastreabilidade marcada em cada metro da peça —
no final meio que perde isso"*. O gargalo é a **transferência de identificação** no corte.

**Três ações** em `components/DesenhoPecaModal.jsx` — abrir o desenho **não** é controle de
liberação (Vitor, 19/08):

| botão | carimba+arquiva+Data Book | GRD |
|---|---|---|
| Ver original | não | não |
| Emitir carimbado | sim | **não** |
| Imprimir (GRD) | sim | **sim** |

Reimprimir a mesma marca/arquivo/setor **soma em `impressoes`/`ultimaImpressaoEm`** da GRD
existente — não cria outra. A informação fica sem poluir o controle.

O que a emissão faz:

1. calcula o R da marca no instante da emissão ([[torg_rastreio_corrida]]);
2. **carimba o PDF** (`lib/carimbo-desenho.js`, pdf-lib): tarja **no ALTO da folha, 62% da
   largura** — no rodapé ela tapava o carimbo técnico do desenho (Vitor, 19/08); em cima ela cobre
   as tabelas `QTD. | RASTREABILIDADE MAT.` (que são exatamente o que ela preenche, hoje à mão) e
   para antes do bloco `LIBERADO P/ FABRICAÇÃO`. Traz OP · marca · formato,
   `R <nº> · corrida · cert · material · fornecedor` e rodapé `Emitido por <usuário> em <data
   hora> · setor · GRD <id> · documento controlado`. Corrida INDEFINIDA **não é inventada**:
   imprime as candidatas + campo `Corrida efetivamente usada / Nº R / Visto` — a evidência que só
   quem separa a barra tem;
3. **arquiva NA MESMA PASTA DO DESENHO ORIGINAL** (onde a Engenharia guarda os PDFs e às vezes os
   DWGs) — resolve a pasta-mãe pelo `parentReference` do Graph. Vitor (19/08): *"a pasta que você
   precisa salvar tem que ser a pasta onde temos os desenhos anexos da engenharia… você não vai
   excluir, só vai salvar lá"*. Nada é apagado; o carimbado entra ao lado do original;
4. cria/atualiza `DocumentoQualidade` (`categoria: PROJETO`, `origem: impressao_rastreada`) e
   vincula na **§02 do Data Book** — o mesmo arquivo do chão de fábrica. Um doc por marca+arquivo
   (reemitir atualiza o ponteiro; o histórico completo fica na `GrdLiberacao`);
5. abre o carimbado. "Abrir" continua mostrando o original, sem carimbo e sem registro.

`GrdLiberacao` ganhou `rastreio` (Json, snapshot = prova), `impressoItemId`, `impressoUrl`,
`documentoId`.

⚡ **Peso do painel** (Vitor, 19/08: *"está ficando pesado/demorado pra abrir"*): não era o
carimbo, era o **payload**. O painel mandava as ordens cruas do Syneco e todas as entradas do CMR
**repetidas em cada peça** — 2.073 KB na OP-097, hoje 481 KB. Detalhe vem sob demanda:
`/api/pcp/despacho/ordens?opId=&marca=` e o modal de rastreio. E o modal de desenhos fazia **uma
chamada ao Graph por arquivo** só pra descobrir a pasta-mãe (formato A1–A4) — agora resolve uma vez
por pasta. **Regra**: nada de array por-peça na listagem; detalhe é sempre sob demanda.

⚠️ **Carimbo em desenho de engenharia**: respeitar o `/Rotate` do PDF (0/90/180/270 — mapear
coordenadas visuais→página e girar o texto com `rotate: degrees(ang)`), **escalar com o tamanho da
folha** (A1 = 2384 pt: 8,5 pt some) e encolher/cortar o texto pra não vazar da tarja. Os três
foram bugs reais no primeiro corte. Base-14 (Helvetica) não vai embutida — normal, mas o
`pdftoppm` do mac renderiza em branco; conferir com `qlmanage -t`.

🚨 **Helvetica só escreve CP1252 e o pdf-lib LEVANTA ERRO num caractere de fora** — um `⚠` no
texto derrubava a emissão do desenho inteiro. Nome de material vem de planilha e traz o que quiser,
então `winAnsi()` saneia tudo antes de desenhar. ⚠️ CP1252 **não** é latin-1: `…` e `—` passam;
testar com latin-1 dá falso positivo. E **aviso emendado no fim de uma linha é a primeira coisa que
o `caber()` corta** — o que precisa ser lido vai em linha própria.

Se o SharePoint falhar, a GRD ainda é registrada e a tela cai no PDF original com aviso — o
controle de liberação não pode parar por causa do carimbo. Ver [[torg_grd_desenhos]] e
[[torg_qualidade]].

## Conteúdo do carimbo por tipo de peça (19/08)

- **CROQUI → preenche a tabela `QTD. | RASTREABILIDADE MAT.` do próprio desenho.** É o campo que o
  corte preenche à mão desde sempre. A tarja antes **tapava essa tabela** e ainda oferecia "Nº R do
  material usado / Corrida / Visto" — a mesma coisa duplicada por cima do campo que já existia.
  Vitor (19/08): *"o carimbo ainda está saindo errado no croqui"*.
  O croqui traz **3 grupos lado a lado com 3 linhas cada** (9 espaços — a peça pode sair de mais de
  uma barra); preenche na ordem de leitura. Sem R no CMR não escreve nada e a tarja avisa
  `R A DEFINIR NO CORTE`.
  🚨 **A coluna QTD fica SEMPRE em branco.** Além de não dar pra ratear a quantidade entre corridas,
  **as duas fontes divergem**: no T84A-P39 o desenho diz *"QTD.: 2 · NO CONJUNTO T84A30, T84A31"* e
  a LPC diz `qte 1` no conjunto **T84A42**. Escrever nosso número por cima de documento controlado
  que diz outro é o pior dos mundos — só o R entra, que é o que falta no desenho.
  Com a tabela presente a tarja vira **uma linha** (identificação + quem emitiu), igual à do
  conjunto — a variável no código é `soEmissao`.

## Onde a tarja de uma linha fica (19/08)

**Na margem de baixo, alinhada à moldura** — Vitor: *"alinhe ele para ficar na margem correta, e
acredito ser melhor ele ficar na margem de baixo, pois em cima ficou poluído"*. No alto ela caía
sobre a legenda de simbologia e ainda **começava fora da moldura**, desalinhada de tudo.

A moldura sai do próprio PDF (`acharMoldura`). **Existem DOIS desenhos de moldura na Torg** — o
segundo só apareceu ao testar um croqui de outra exportação do Tekla:

- **DUPLA** — duas linhas próximas (≤ 40 pt) e a faixa entre elas é a margem: A3 26,5 · A2 27,5 ·
  A4 14,1 pt. A tarja entra nessa faixa, **abaixo do `FORMATO A3 - 420x297mm`** que o desenho já
  escreve lá (`yTextoMin`).
- **SIMPLES** — uma linha só (croqui 842×595, a 14 pt da borda). Aí a faixa **é a margem do papel**,
  e a tarja vai **AO LADO** do `FORMATO`, na mesma linha e **na mesma escala** (copia `hTexto`).
  ⚠ Escrever "abaixo do texto" punha a tarja a **0,5 mm da borda**, que toda impressora corta, e o
  texto ainda cruzava o filete laranja.
- Sem moldura reconhecível, volta pra tarja de cima.

⚠️ **Ignorar as linhas coladas na borda do papel** ao procurar a moldura: são o contorno da folha,
não a moldura (a primeira medição pegou "y 0→842" e não servia pra nada).

## Consumível: qual R vai no campo

- **Conjunto já soldado** → o lote vigente na data do apontamento ([[torg_syneco_apontamento_fonte]]).
- **Ainda não soldado** → o lote vigente na **DATA DA EMISSÃO**. Vitor (19/08): *"se eu emiti a
  primeira hoje, você precisa já vincular o R que será usado nessa data"*. Não é chute — o desenho
  está indo pro chão de fábrica agora e o arame na máquina agora é esse. O que ele vetou antes foi
  o **rótulo "(PREVISTO)"**, não a informação.
- **CONJUNTO → preenche o campo `CONSUMÍVEL` do próprio desenho.** Vitor (19/08): *"vamos tirar a
  ideia de colocarmos as rastreabilidades de todos os croquis no conjunto; no próprio canto do
  conjunto temos um espaço para informar a rastreabilidade do consumível, ali já basta — só fazer o
  controle da emissão e impressão dos conjuntos... as demais informações dos demais carimbos não
  precisa"*.

  A doutrina que sobrou é mais limpa: **o R do MATERIAL é do croqui** (é lá que a barra é cortada) e
  já sai no carimbo dele; **o R do ARAME é do conjunto**, e o desenho já tem campo próprio
  (`MONTADOR | DIMENSIONAL | SOLDADOR | SINETE | CONSUMÍVEL` no carimbo técnico). A emissão
  **escreve no campo** em vez de carimbar por cima do projeto.

  `lib/campos-desenho.js` acha a célula **sem chutar posição**: o texto "CONSUMÍVEL" sai do pdf.js
  (via `unpdf`) com posição e largura, e as **linhas da tabela** saem dos operadores de path da
  página (`getOperatorList`, aplicando a CTM) — horizontais dão as linhas, verticais dão as bordas
  de coluna (o croqui precisa das duas pra separar QTD de RASTREABILIDADE). A 1ª linha em branco é a faixa entre as duas
  horizontais logo abaixo do cabeçalho — no T89A53 (A2) dá header 279,1→265,3 e linha 265,3→251,6,
  13,7 pt. **Sem as duas horizontais não escreve às cegas**; e se o desenho não tiver o campo, o R
  volta pra tarja pra informação não sumir.

  No conjunto a tarja virou **uma linha só** (identificação + quem emitiu + GRD), rente ao topo.
  Antes de chegar aqui passou por: tabela por posição na folha (comia 1/3 do A1 — *"está cobrindo
  informações importantes do projeto"*) e folha A4 anexa. **Nenhuma das duas rodou em produção.**

## Emissão em LOTE (`lib/desenhos-lote.js`, `/api/producao/desenhos/lote`)

Botões "Desenhos em lote" / "Imprimir lote (GRD)" no painel de Liberar, sobre a seleção.
⚠ **Agrupa por FORMATO** (um PDF por A1/A2/A3/A4) — cada um vai numa bandeja diferente; PDF único
misturado é inimprimível. Uma listagem recursiva da pasta de Fabricação (não uma busca por marca).
Revisão: pega o nome maior (`_R02` > `_R01`). Teto de 80 marcas. GRD **linha por linha** por marca.

### Baixar o lote: ZIP com uma pasta por IMPRESSORA

`/api/producao/desenhos/lote/zip` (pizzip). Vitor (19/08): *"salva em pastas separadas na pasta
download do usuário, assim ele consegue já imprimir em duas impressoras ao mesmo tempo — a folha A2
vamos fazer na plotter, já a A3 e A4 são na outra impressora"*. Então as pastas são por **máquina**,
não por formato: `PLOTTER (A1-A2)` e `IMPRESSORA (A3-A4)`; o formato fica no nome do arquivo.
Formato desconhecido cai na plotter (errar pro lado da folha grande estraga uma folha; pro outro
corta o desenho). O ZIP baixa sozinho ao fim da emissão — antes o painel abria **uma aba por
arquivo**, que o navegador bloqueia. Arquivo que falhar vira `FALTOU BAIXAR.txt` dentro do zip.

O conjunto imprime em **duas máquinas, em paralelo** (desenho na plotter, anexo A4 na impressora),
não duas vezes na mesma — foi a dúvida do Vitor sobre tempo.
