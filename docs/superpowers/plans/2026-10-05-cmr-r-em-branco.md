# CMR: usar os R reservados em branco na planilha — plano (v2)

> Para quem executar: um passo por vez, teste que falha antes do código (TDD). Nada de `prisma db push`;
> tabelas e índices só por `scripts/ensure-mes-tables.mjs`. A reutilização nasce DESLIGADA e só é
> ligada depois das proteções verificadas em produção (passo 12).

**Objetivo:** quando a planilha CMR tiver um R com todas as outras colunas vazias, o portal usa esse R
no próximo lançamento — sem reabrir o defeito do R 261547 (dois materiais no mesmo R).

**Pedido:** Matheus, 05/10/2026: *"se você achar um R com todas as colunas vazias devemos usar esse R"*.
Escolheu a regra completa, com as ressalvas das consultas `database` e `architecture` do Codex.

**v1 → v2:** a v1 foi revisada pelo Codex (architecture, 05/10/2026) com lacunas bloqueantes: titularidade
condicional, exclusão futura, carga consolidada, max+1 sem memória, sobrescrita pela reconciliação antes
de o conflito aparecer, escrita parcial sem prova de autoria, escritores do portal sem coordenação,
resolução sem retomada e ativação sem verificação. Esta versão responde a cada uma (marcadas [C1]…[C9]).

## O que existe hoje

- Planilha (Graph): A = R/RC, B = índice R, C..N = dados. `lerLinhasCmr` lê A5:N (só valores).
  Quem escreve: `POST /api/compras/cmr` (`appendLinhasCmr` quando `espelhar` ≠ false), `/espelhar`
  (`appendLinhasCmr`), edição `PATCH [id]` (`atualizarLinhaCmr`), exclusão `DELETE [id]`
  (`limparLinhaCmr`), reconciliação (`appendLinhasCmr`).
- Emissão (`lib/cmr-lote.js`): todos os índices da planilha contam como ocupados; próximo = max + 1.
- Reconciliação (`lib/cmr-reconciliar.js`, 350 linhas; cron 02h40/10h40 + botão): cria fora de trava,
  "a planilha manda" com `updateMany` por `importRef` (atinge duplicados), anexa o que falta.
- Exclusão (`DELETE [id]`): apaga o documento antes da auditoria, que é `.catch`.
- R repetidos no banco: 10 (8 de 2025, 2 de 2026).

## Desenho

### 1. Estado de cada R: tabela `CmrR` [C1][C3][C4]

```
CmrR (r TEXT PK, ano INT, situacao TEXT, docId TEXT NULL, versao INT DEFAULT 0,
      motivo TEXT NULL, atualizadoEm TIMESTAMP)
```

| situacao | significa | sincronização automática |
|---|---|---|
| RESERVADO | o portal emitiu, a escrita na planilha está pendente | só a escrita pendente mexe |
| USADO | portal e planilha em dia, um titular (`docId`) | sim |
| CONFLITO | a planilha diverge do que se esperava | parada nos dois sentidos |
| EXCLUIDO | material excluído; o R nunca volta | nunca importa; limpeza pendente |
| LIBERADO | liberado por ato explícito (renumeração autorizada) | pode ser emitido de novo |
| DUPLICADO | mais de um documento com este R (histórico) | parada; fora deste plano |

**Transições — todas em `lib/cmr-r/estado.js`, sob a trava `cmr-r:<ano>`, por `updateMany` com a
situação (e o `docId`/`versao`) esperados e exigência de `count === 1`; nunca upsert que troque titular:**

- (sem linha) ou LIBERADO → RESERVADO: emissão de lote, com `docId`, na transação dos documentos.
- RESERVADO → USADO: escrita pendente confirmada por releitura. RESERVADO → CONFLITO: linha divergente.
- (sem linha) → USADO: reconciliação criando a partir da planilha, na transação do documento.
- USADO → USADO (`versao + 1`): edição no portal.
- USADO → CONFLITO: escrita de edição achou a planilha diferente do esperado.
- USADO → EXCLUIDO: exclusão, na mesma transação que apaga o documento e grava a auditoria [C2].
- CONFLITO → USADO: resolução confirmada.
- USADO/EXCLUIDO → LIBERADO: só por ato administrativo explícito (renumeração), com auditoria.

**Carga inicial (`lib/cmr-r/carga.js`, rodada pelo ensure) [C3]:** consolida por R antes de inserir —
1 documento → USADO com `docId`; mais de 1 → DUPLICADO; sem documento e com `CMR_EXCLUIR` → EXCLUIDO;
sem documento e em `CMR_RENUMERAR.liberados` → LIBERADO. Insere com `ON CONFLICT DO NOTHING`: reexecutar
não muda um R que já tem estado (nunca reabre um R consumido). Documento sem linha em `CmrR` (criado entre
a carga e o deploy) é tratado como USADO por todas as regras e ganha linha na primeira passagem.

**max + 1 considera portal, planilha E `CmrR`** [C4]. R e ano normalizados antes de comparar.

### 2. Escritas na planilha como operações pendentes: tabela `CmrEscrita` [C5][C6][C7][C8]

```
CmrEscrita (id TEXT PK, r TEXT, ano INT, tipo TEXT /* PREENCHER | EDITAR | LIMPAR | RESOLVER */,
            esperado JSONB /* conteúdo A,C..N que a linha deve ter ANTES */, desejado JSONB,
            versao INT /* CmrR.versao quando a operação nasceu */, situacao TEXT /* PENDENTE |
            CONCLUIDA | SUPERADA | CONFLITO */, tentativas INT, criadoEm, concluidoEm)
```

- Toda escrita nasce **na transação do banco** que a motivou (emissão, edição, exclusão, resolução).
  Assim, uma resposta perdida não perde a escrita: ela fica PENDENTE e é retomada.
- Uma operação nova para o mesmo R marca as PENDENTES anteriores como SUPERADA: um reenvio antigo nunca
  desfaz uma edição recente [C7].
- **Processador (`lib/cmr-r/escritas.js`)**, chamado logo após a gravação (o `/espelhar` passa a ser
  "processar as pendentes destes R") e no começo da reconciliação. Ele adquire a **trava de lease**
  `CmrTrava('planilha:<ano>')` (linha com dono e validade, por update condicional; sem trava de sessão com
  pooler), lê A..N **com valores e fórmulas** e decide por segmento (A e C..N separados):

  | Cada segmento está… | Ação |
  |---|---|
  | igual ao `desejado` | nada |
  | igual ao `esperado` (casca vazia, conteúdo anterior) | escreve o `desejado` |
  | outra coisa | CONFLITO |

  Como a operação guarda `esperado` e `desejado`, uma escrita interrompida (A já gravado, C..N não)
  é reconhecida pela própria operação — não por adivinhação [C6]. Depois de escrever, relê e só então
  conclui e passa o R para USADO.
- R repetido na planilha (duas linhas com o mesmo B) é CONFLITO em qualquer escrita.
- O próprio Graph não tem transação: entre a releitura e a escrita, uma digitação humana pode ser
  sobrescrita sem gerar conflito. **Limitação documentada**, não resolvida [C7].

### 3. "100% vazia"

Valores **e** fórmulas de A e C..N vazios (`""`). Fórmula que mostra vazio, `0` e `false` não contam.
Classificação e comparação canônica (datas como ISO, números normalizados) em funções puras
(`lib/cmr-r/comparar.js`), fora do transporte Graph (`lib/cmr-sharepoint.js` fica só com HTTP).

### 4. Emissão

- `livresDaPlanilha(linhas, estados)` (pura): casca 100% vazia, R não repetido na planilha, e sem linha
  em `CmrR` ou LIBERADO. Ordem crescente.
- `gravarLoteCmr`, sob as travas atuais: relê os estados dos livres, atribui livres e depois max + 1,
  cria os documentos, faz as transições → RESERVADO e cria as `CmrEscrita` PREENCHER (`esperado` =
  vazio) ou, para R novos, PREENCHER com "sem linha → anexar". Tudo numa transação com o `CmrLote` e a
  auditoria. O replay do `CmrLote` continua devolvendo os mesmos R.
- **Chave `CMR_REUSAR_CASCAS`** (variável de ambiente, desligada): com ela desligada a emissão continua
  max + 1, mas TODO o resto (estados, escritas pendentes) já roda [C9].

### 5. Reconciliação (extraída para `lib/cmr-r/sincronizar.js`)

1. Processa as escritas pendentes primeiro.
2. planilha→portal **só para R em USADO e sem escrita pendente** [C5]; atualização pelo `docId` (nunca
   por `importRef`), conferindo `versao` dentro da transação; R RESERVADO, CONFLITO, EXCLUIDO ou
   DUPLICADO não são tocados.
3. Criação a partir da planilha: só para R sem linha em `CmrR`, sob `cmr-r:<ano>`, com a transição para
   USADO na mesma transação.
4. EXCLUIDO nunca é importado, mesmo com a linha ainda preenchida (a LIMPAR pendente cuida dela) [C2].

### 6. Conflitos

- Lista na aba Conciliar com os dois conteúdos. Notificação no sino com `chaveEvento`
  `CMR_CONFLITO:<R>:<versao>` (sem repetir), fora da transação e não fatal.
- Resolução (ADMIN, QUALIDADE, COMPRAS), guardada antes de agir para poder retomar [C8]:
  - **Vale a planilha:** confere que a planilha ainda tem o conteúdo mostrado (hash); atualiza o
    documento pelo `docId`; → USADO.
  - **Vale o portal:** cria `CmrEscrita` RESOLVER com `esperado` = conteúdo mostrado; o R fica em
    CONFLITO até a escrita concluir; → USADO.
- DUPLICADO não tem resolução nesta tela (escolher conteúdo não escolhe documento). Fica listado.

### 7. R único no banco [C9]

Índice único parcial em `DocumentoQualidade("importRef")` para MATERIAL, exceto os 10 R repetidos de
hoje (que ficam DUPLICADO e bloqueados pelos serviços). No ensure com try/catch (o build não cai), mas a
verificação de ativação (passo 12) exige o índice presente.

## Ordem (desenvolvimento e ativação)

1. Tabelas `CmrR`, `CmrEscrita`, `CmrTrava` + carga consolidada. Testes: sobreposição de eventos,
   duplicados, reexecução sem reabrir.
2. `comparar.js` e `livresDaPlanilha` (puras). Testes: vazia, fórmula vazia, `0`, A preenchido,
   R repetido, datas.
3. `estado.js`. Testes de cada transição permitida e de que as proibidas falham (`count !== 1`),
   inclusive disputa por um LIBERADO.
4. Leitura com fórmulas em `cmr-sharepoint.js`.
5. `escritas.js` + lease. Testes: os três estados por segmento, escrita interrompida retomada,
   superada não escreve, R repetido.
6. Exclusão atômica + LIMPAR pendente. Teste: falha no Excel não ressuscita o material.
7. Emissão com estados e escritas (chave desligada). Testes: replay, max+1 com `CmrR`.
8. Edição com `EDITAR` (`esperado` = linha antes). Teste: reenvio antigo após edição não desfaz.
9. Reconciliação extraída. Testes: não importa sobre RESERVADO; não toca CONFLITO/EXCLUIDO/DUPLICADO;
   atualiza por `docId` com versão.
10. Conflitos: tela + rota (Zod, requireRole, AuditLog). Testes de resolução interrompida.
11. Índice único parcial.
12. **Ativação:** deploy com a chave desligada; conferir em produção (sem pendências presas, índice
    presente, nenhum conflito novo) por uns dias; ligar `CMR_REUSAR_CASCAS`; acompanhar o primeiro
    lançamento que use uma casca junto com o Matheus.

Validação de cada passo: `npm test`, `npm run checar`, e `validar-tela` para as telas. Os testes usam
Prisma mockado: não provam a exclusividade real do banco nem o Graph — limitação registrada.

## Riscos que continuam

- Digitação humana entre a releitura e a escrita do Graph pode ser sobrescrita sem conflito.
- Os 10 R DUPLICADO ficam fora da sincronização automática até alguém decidir o que fazer com eles.

## Revisão do Codex da v2 (architecture, 05/10/2026): direção aprovada, implementação NÃO aprovada

Bloqueios que restam (2º ciclo — parado para decisão do Matheus):
- [C2/C8] LIMPAR concluída não pode levar o R a USADO; conflito de limpeza mantém EXCLUIDO, com
  resolução própria; LIBERADO proibido com limpeza pendente ou em execução.
- [C5] Reconciliação: capturar a versão ANTES de ler a planilha e validar versão + estado + ausência de
  operação ativa atomicamente ao aplicar; toda importação incrementa a versão.
- [C7] Lease não dá exclusividade sobre o Graph (chamada em andamento após a lease expirar; SUPERADA
  marcada durante a escrita): definir renovação, perda e recuperação.
- [C6/C7] Cadeia de operações: de onde vem `esperado`; encadear/consolidar edições pendentes; separar
  "versão desejada" de "último conteúdo confirmado na planilha".
- [C8] "Vale a planilha": decisão persistida (hash, versão), conclusão idempotente, invalidar pendências.
- [C9] Barreira também para a primeira ativação (chave desligada já troca os fluxos): verificar tabelas,
  índice, carga e drenagem dos escritores antigos antes de ligar os caminhos novos.
Também: precedência cronológica exclusão × liberação na carga; criação de estado por INSERT protegido;
regras para editar/excluir R em RESERVADO/CONFLITO; semântica de `espelhar=false`; R repetido na
planilha bloqueia importação e atualização; resolução de conflitos separada do processador.
