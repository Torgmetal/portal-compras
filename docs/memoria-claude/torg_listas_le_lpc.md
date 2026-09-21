---
name: torg_listas_le_lpc
description: "Import de LE/LPC em Engenharia > Listas — duas \"LEs\" distintas, bug do opId órfão, itens AC, campo observação, painel de cobertura"
metadata: 
  node_type: memory
  type: project
  originSessionId: dcd073c6-4b21-46d4-b2d3-f4c7977df22a
  modified: 2026-08-05T11:40:54.769Z
---

Página **/engenharia/listas** (só ADMIN/ENGENHARIA) importa LE e LPC. Cliente parseia o xlsx e manda `rows` (evita limite 4,5MB); rotas `/api/producao/pecas/importar-{le,lpc}` fazem upsert em `PecaConjunto` (fontes `LE_IMPORT`/`LPC_IMPORT`). Ao importar, salva o arquivo no SharePoint ([[torg_status_obra]]) e, se for revisão, avisa por e-mail + embute aba "Revisao" (diff) na planilha. Import peça-a-peça é lento: `maxDuration=300` nas duas rotas (60s dava 504 → "token JSON"); LE trocou findUnique-por-peça por 1 findMany (mapa marca→id).

**LPC é por FASE, LE é unificada (decisão do Vitor 04/08, commit e794c55).** A LPC é chaveada pela **fase** (letra: `T83F`, `T83D`, `T67AT`…) no `PecaConjunto.opNumero` — cada fase é uma lista própria e coexistem na mesma OP; re-importar a mesma fase com revisão nova substitui/obsoleta **só aquela fase**; importar outra fase não mexe nas irmãs. Os imports direto do SharePoint (`importar-lpc-revisao` merge, `sync-lpc-sharepoint` sweep) já eram por fase (`opNumeroForcado=obra`). O furo corrigido: (a) **upload manual** (`importar-lpc/route.js`) quando a OP era selecionada forçava `opNumero=dígitos` (083) e colapsava as fases → agora a chave vem da **fase do nome do arquivo** (`T\d+[A-Z]*` de `arquivoNome`) > OP selecionada > marca, e o `opId` é resolvido pelos dígitos (fases da OP compartilham o opId); (b) **obsoleto de arquivo** (`sharepoint-lista.js moverAtuaisParaObsoleto`) movia TODOS os arquivos da pasta → LPC agora passa `filtro` da mesma fase. ⚠️ **Dado legado**: 6 OPs tinham LPC gravada por dígitos (060, 071, **083**, 089, 104, 106; ~592 peças) — ao re-importar por fase, as linhas antigas por dígito NÃO seriam substituídas (chave diferente) e duplicariam. **OP 083 já resolvida (04/08)**: o blob "083"(139 peças) era a **fase F mal-chaveada** (marcas T83F*, 0 overlap com A/B/C/D) — **re-chaveei "083"→"T83F"** (não apaguei; preservou 101 peças com produção). Padrão de correção: pra cada blob por dígito, olhar as marcas — se a fase da marca (`^T\d+[A-Z]*`) for única, `updateMany` opNumero→fase (preserva produção); se misturar fases, re-chavear por marca. Faltam **060, 071, 089, 104, 106**. (Nota: `sync-lpc-sharepoint` usa regex de 1 letra `/(T\d+[A-Z]?)\b/` → "T67AT"→"T67A", divergente do `/T\d+[A-Z]*/` dos outros; alinhar se fases multi-letra AT forem pelo sweep.)

**DUAS "Listas de Expedição" diferentes (não confundir):**
- **FORM21 LE → `PecaConjunto` fonte `LE_IMPORT`** — a lista mestra de marcas importada NESTA página. É o que o Vitor chama de "a LE da obra" (decisão dele 28/07).
- **`ListaExpedicao` (modelo) = "Lista Avançada Expedição.xlsm"** — controle de expedição (peso contratado/expedido/faltante, marcasJson), keyed por `frente`. Outro artefato; NÃO conta como "tem LE" no painel de cobertura. `lib/export-lista-expedicao.js` exporta desse mundo.

**Bug do opId órfão na LE:** a FORM21 traz o número sem zero à esquerda ("78") mas a OP é "078" → `findUnique({numero})` falhava → peças de LE ficavam com `opId=null`. Corrigido: import agora casa a OP por número normalizado (`parseInt`, match único) e liga o opId. Backfill JÁ RODADO (28/07): 250 peças da OP 078 ligadas; as 167 de "106" ficaram órfãs de propósito (não existe OP 106 — é dado de teste do Vitor).

**Painel "Obras sem lista"** (`/api/engenharia/listas/cobertura` + `CoberturaListas.jsx`, topo da página): por OP ativa (ABERTA/EM_EXECUCAO/ATRASADA) mostra se tem LPC e LE, faltantes primeiro. LPC casa por `opId` (12.996 peças, 100%); LE casa por `opId` OU número normalizado (pega as órfãs). Retrato 28/07: 9 sem LPC, 22 sem a FORM21 LE (só a 078 tem).

**Itens AC** (aço comercial/a comprar — parafusos, acessórios): marca no padrão `T<nº OP>AC` (ex.: T82AC). `lib/marca-ac.js` (`marcaEhAC` + `ordenarACNoFim`, sort estável) joga esses itens pro FIM das planilhas exportadas pelo portal. Já aplicado em `export-lista-expedicao.js`; estender aos outros exports conforme aparecerem.

**Campo observação** (`PecaConjunto.observacao`, já existia): galvanização, terceirização, "pintado pronto"; nos parafusos, a área. Parsers detectam a coluna pelo cabeçalho ("OBSERV"/"OBS") — LE via findColIdx, LPC posicional (varre o header). Grava só quando a coluna existe (`observacao ?? undefined` no LPC preserva no update; não apaga). Exibição (decisão do Vitor 28/07): **nos exports xlsx**, não na tela. Já saiu na coluna "Observação" do export "Controle de Peças" (produção/peças). Outros exports de peças (corte, montagem, OP-detail) NÃO têm ainda — estender sob demanda.

## 🚨 A linha "TOTAL.:" entrou como peça

A LE termina com uma linha de total e o import trouxe ela como peça, **com o peso somado da lista
inteira**: 4 no banco, **187.548 kg de peça fantasma** — OP-060 (153.647 kg!), 085 (16.940), 089
(11.376), 067 (5.584). Vitor pegou pela 089: *"não temos um único conjunto com esse peso total"*.
Filtro em `ehLinhaLixo` (`lib/pecas-producao.js`), aplicado no painel de Liberar, no motor da TV
(`prioridades-setor-data`) e em `/api/producao/prioridades` — **o guard existia só no painel**, e
por isso a TV e os levantamentos mostravam o fantasma. Script de análise ad-hoc também precisa
aplicar, senão a conta sai errada. Ver [[torg_prioridades_setor]].

## ⚠⚠ LE = EXPEDIÇÃO · LPC = FABRICAÇÃO (Vitor, 29/08/2026)

"A LPC e a LE são a mesma lista praticamente, a única diferença é que a LE mostra todos os itens que
precisamos enviar, até acessórios; já a LPC é para a produção. **Você sempre deve respeitar isso.**"

**Nunca somar as duas** — é a MESMA estrutura de aço. Usar `SO_FABRICACAO` / `SO_EXPEDICAO` de
[[torg_libs_compartilhadas]] (`lib/lista-pecas.js`) na consulta, e `pesoRealPecas` (lib/peso-op.js)
para o peso de uma OP.

**NÃO incluir a fonte na chave `@@unique([opNumero, marca])`.** Vitor vetou: criaria duas linhas
para a mesma peça física e todo lugar que soma teria de saber escolher. A separação é na CONSULTA.
Consequência aceita: quando as duas listas usam o mesmo `opNumero`, a marca repetida não gera linha
da LE (caso da OP-106, 7 marcas) — o import agora avisa em vez de engolir.

**O que já tinha estragado** (medido em 29/08/2026, tudo corrigido):
- PCP "aguardando liberação" → **95 dias de carga** onde o real era **4,4** (543 t de LE na fila de corte)
- painel da Produção: 828 t de 2.473 t eram repetição (33%)
- painel de corte: denominador do "% já cortado" somava as duas
- **218 marcas da LE receberam máquina de corte atribuída** — a LE não se corta

⚠ A LE nunca chega a CORTE/MONTAGEM/SOLDA/PINTURA (0 peças), mas fica em **PENDENTE** (2.181) — é
por aí que ela entrava nas telas de fabricação.
