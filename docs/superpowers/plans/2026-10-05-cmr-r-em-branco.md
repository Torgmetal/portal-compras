# CMR: usar os R reservados em branco na planilha — plano

> Para quem executar: um passo por vez, teste que falha antes do código (TDD). Nada de `prisma db push`;
> tabela e índice só por `scripts/ensure-mes-tables.mjs`.

**Objetivo:** quando a planilha CMR tiver um R com todas as outras colunas vazias, o portal usa esse R
no próximo lançamento, em vez de pular para o maior + 1. E faz isso sem reabrir o defeito do R 261547
(dois materiais no mesmo R).

**Pedido:** Matheus, 05/10/2026: *"o usuário costuma deixar alguns R já pré-preenchidos em branco… se
você achar um R com todas as colunas vazias devemos usar esse R"*. Escopo completo aprovado por ele,
com as ressalvas da consulta `database` do Codex (05/10/2026).

## O que existe hoje

- Planilha (Graph): A = R/RC, B = índice R, C..N = dados. `lerLinhasCmr` lê A5:N (só valores).
  `appendLinhasCmr` escreve depois do fim; `atualizarLinhaCmr` acha a linha pelo B e reescreve A e
  C..N (ou anexa); `limparLinhaCmr` esvazia A e C..N mantendo B (é o que a EXCLUSÃO faz).
- Emissão (`lib/cmr-lote.js`, no ar desde 05/10): todos os índices da planilha contam como ocupados;
  próximo = max(portal, planilha) + 1. Travas `cmr-lote:<id>` → `cmr-r:<ano>`.
- Reconciliação (`lib/cmr-reconciliar.js`, cron 02h40/10h40 + botão): cria no portal os R da planilha
  com descrição e sem par (`create` fora de qualquer trava); "a planilha manda" (sobrescreve o portal);
  anexa à planilha os R do portal que ela não tem. Casca não vira registro.
- R repetidos no banco hoje: 10 (11 registros a mais) — 8 de 2025 (a planilha de 2025 tinha o mesmo R
  em materiais diferentes) e 2 de 2026 (261392 três vezes, com o mesmo nome; mais um).

## Desenho

### 1. Registro permanente dos R: tabela `CmrR`

Um R livre não é "um R que não está no portal agora": renumeração e exclusão fazem o R sumir do portal
sem ele ficar livre. Precisa de memória.

```
CmrR (r TEXT PK, ano INT, situacao TEXT, docId TEXT NULL, origem TEXT, motivo TEXT NULL,
      atualizadoEm TIMESTAMP)
situacao: USADO (emitido pelo portal ou importado da planilha) | EXCLUIDO | LIBERADO | CONFLITO
```

- **Carga inicial (no ensure, idempotente, `ON CONFLICT DO NOTHING`):**
  - todo `importRef` de MATERIAL vira USADO;
  - todo `diff.importRef` de AuditLog `CMR_EXCLUIR` vira EXCLUIDO;
  - os 43 R antigos da renumeração (`CMR_RENUMERAR.diff.liberados`) viram LIBERADO.
- **Regra do R livre:** a linha da planilha está 100% vazia (ver 3) **e** o R não está em `CmrR`, ou
  está como LIBERADO.
- A PK de `CmrR` é a garantia final: dois caminhos que tentem marcar o mesmo R como USADO, um deles cai.

### 2. Emissão usa os R livres primeiro

- `lerLinhasCmr` passa a devolver também as cascas, com `vazia: true` (ver 3), e as linhas com o R
  repetido na própria planilha marcadas `repetido: true` (nunca livres).
- `gravarLoteCmr` recebe `livres` (os R de cascas vazias, em ordem crescente). Dentro das travas:
  1. relê `CmrR` para esses R e descarta os que não estão livres;
  2. atribui os livres primeiro, depois max + 1 (o max continua considerando todos os índices da
     planilha);
  3. grava os documentos, **insere/atualiza `CmrR` como USADO** (o insert da PK é a última defesa),
     o `CmrLote` e a auditoria, na mesma transação.
- Uma casca usada é **preenchida** na planilha, em vez de receber uma linha nova no fim (ver 4).

### 3. O que é "100% vazia"

- Ler `values` **e** `formulas` de A5:N. Uma linha é casca vazia quando B tem o R e, em A e C..N, o
  valor é `""` **e** a fórmula também é `""` (fórmula que mostra vazio não conta como vazia). `0` e
  `false` não são vazios.
- R repetido na planilha (duas linhas com o mesmo B) nunca é livre, mesmo que uma delas esteja vazia.

### 4. Escrita na planilha: `gravarLinhasCmr(ano, linhas, { esperado })`

Uma sessão só. Lê A..N (valores e fórmulas) das linhas dos R pedidos e decide caso a caso:

| Estado da linha do R na planilha | Ação |
|---|---|
| já igual ao que o portal quer escrever | nada (sucesso idempotente — reenvio e retry) |
| casca 100% vazia | preenche A e C..N |
| igual ao `esperado` (o conteúdo antes da edição no portal) | reescreve A e C..N (edição legítima) |
| sem linha para o R | anexa no fim |
| qualquer outra coisa | **não escreve**; devolve conflito |

- Conflito → `CmrR.situacao = CONFLITO` + AuditLog `CMR_CONFLITO_PLANILHA` (conteúdo dos dois lados)
  + aviso ao Almoxarifado e à Qualidade no sino.
- Escrita parcial (A gravado, C..N não): a mesma função reconhece a própria escrita incompleta (A igual
  ao desejado e C..N vazio ou igual) e completa, em vez de chamar de conflito.
- Quem passa a usar: `/espelhar` (sem `esperado`), a edição `PATCH /api/compras/cmr/[id]` (com
  `esperado` = linha antes da edição) e a reconciliação portal→planilha.
  `appendLinhasCmr` e `atualizarLinhaCmr` deixam de ser chamados de fora do módulo.

### 5. Reconciliação

- **Criação planilha→portal sob a mesma trava `cmr-r:<ano>`**, numa transação por R: confere `CmrR`;
  se o R está USADO por outro documento, é conflito (não cria). Se cria, marca USADO na mesma
  transação.
- **R em CONFLITO fica parado nos dois sentidos:** a planilha não sobrescreve o portal e o portal não
  escreve na planilha até a resolução.
- portal→planilha passa a incluir os R do portal cuja linha na planilha é casca vazia (o espelhamento
  falhou ou foi interrompido): preenche via `gravarLinhasCmr`.

### 6. Resolver conflito

- Lista "R em conflito" na tela do CMR (aba Conciliar), com os dois conteúdos lado a lado.
- Ação (ADMIN, QUALIDADE, COMPRAS): **"Vale a planilha"** (o portal recebe o conteúdo dela) ou **"Vale o
  portal"** (a planilha é reescrita). Volta a USADO; AuditLog `CMR_CONFLITO_RESOLVIDO`.

### 7. R único no banco

- Índice único parcial:
  `CREATE UNIQUE INDEX IF NOT EXISTS "DocQualidade_material_R_unico" ON "DocumentoQualidade"
   ("importRef") WHERE "categoria" = 'MATERIAL' AND "importRef" IS NOT NULL AND "importRef" NOT IN
   (<os 10 R repetidos de hoje>)`.
- No ensure, dentro de try/catch: se falhar (apareceu outra duplicata), **loga e segue** — o build não
  pode cair por isso; a `CmrR` continua protegendo.
- Os 2 R repetidos de 2026 (261392 e o outro) são decisão do Matheus (excluir as cópias?), fora deste
  plano. Os de 2025 ficam como estão.

## Ordem de implementação (cada passo com teste que falha antes)

1. `CmrR` no schema + ensure + carga inicial. Teste: a carga marca USADO, EXCLUIDO e LIBERADO.
2. Leitura: `lerLinhasCmr` com `formulas`, `vazia` e `repetido`. Teste com linhas: vazia, fórmula que
   mostra vazio, `0`, A preenchido, R repetido.
3. `livresDaPlanilha(linhas, cmrR)` (função pura). Testes da regra do R livre.
4. `gravarLoteCmr` usa os livres + marca `CmrR`. Testes: usa 261816 antes de 261875; descarta livre que
   virou USADO entre a leitura e a trava; PK duplicada derruba o lote inteiro.
5. `gravarLinhasCmr` com os cinco estados + escrita parcial. Testes por estado.
6. `/espelhar`, edição e reconciliação passam a usá-la. Testes de que nenhuma rota chama
   `appendLinhasCmr` direto.
7. Reconciliação: criação sob trava + `CmrR`; CONFLITO parado nos dois sentidos; preencher casca.
8. Tela de conflitos + rota de resolução (Zod, requireRole, AuditLog).
9. Índice único parcial no ensure (try/catch).
10. Validação: `npm test`, `npm run checar`, `validar-tela` no CMR. O SharePoint não é acessível do
    ambiente local; a primeira emissão real com uma casca é conferida em produção junto com o Matheus.

## Riscos que continuam

- Alguém digitando na planilha no mesmo minuto em que o portal grava: nenhuma transação tranca um
  editor de Excel. O desenho **detecta** (CONFLITO) e **para** os dois lados; não evita.
- O índice único não cobre os 10 R antigos repetidos.

## Revisão do Codex (consulta `architecture`, 05/10/2026): revisar antes de implementar

Lacunas bloqueantes apontadas — o plano NÃO deve ser executado como está:
1. Titularidade condicional em `CmrR` (LIBERADO→USADO por update condicional, um titular por R; nada de upsert).
2. Exclusão futura no protocolo, atômica com documento e auditoria; reconciliação respeitando EXCLUIDO.
3. Carga inicial consolidada por R (sobreposições, duplicados, reexecução sem reabrir R consumido).
4. "max + 1" consultando também `CmrR`.
5. Estado pendente de sincronização: a reconciliação não pode importar sobre um R recém-reservado.
6. Escrita parcial só reconhecida com operação pendente persistida (conteúdo esperado e desejado).
7. Coordenação/versionamento entre edição, espelhamento e reconciliação; reenvio antigo não desfaz edição.
8. Resolução de conflito com retomada (banco e Excel sem transação comum).
9. Ativação da reutilização só depois das proteções verificadas; falha do índice não pode ficar silenciosa.
Arquivos a mais: `app/api/compras/cmr/route.js` (espelha direto), exclusão em `[id]/route.js`,
`lib/cmr-reconciliar.js` (350 linhas — extrair a coordenação), `lib/cmr-sharepoint.js` (separar regra pura).
