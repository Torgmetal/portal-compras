---
name: torg-pecaconjunto-opnumero
description: "PecaConjunto.opNumero: código da obra na LPC — quebra joins por número, e trocá-lo entre importações DUPLICA a obra inteira (OP-097). Convenção fixada 01/09/2026: sem letra"
metadata: 
  node_type: memory
  type: reference
  originSessionId: d9c0cffd-a288-4e74-b94d-9b9291161750
  modified: 2026-09-01T21:40:00.000Z
---

`PecaConjunto.opNumero` (peças vindas da LPC, `fonte:"LPC_IMPORT"`) guarda o **código de obra do SKA/Syneco** com prefixo T e sufixo de parte — `T67`, `T67B`, `T67AT`, `T78A`, `T88A` — e **não** o `OP.numero` do portal, que é numérico com zero (`067`, `088`).

Consequência: qualquer código que cruza peça↔OP por número exato falha. Também afeta a **prontidão da Montagem** (`calcularProntidao` lê `croqui.qteProduzida`): com o corte concluído no Syneco mas `qteProduzida` parado no valor parcial, a montagem mostra "falta croqui" indevidamente.

**CORRIGIDO em 17/06/2026 (commit a4c5775)** no `importar-syneco-corte`: agora casa por **`opId`** (que o sync do MES e a importação da LPC já preenchem — confirmado), com fallback por código normalizado (`^T0*(\d+)` → pad 3). **Todas as frentes reconciliadas** (com ok explícito do Vitor): 3.512 peças atualizadas (3.021 PENDENTE→CORTE) em 060/067/078/082/088 — conjuntos prontos voltaram a aparecer (067: 707 prontos, 078: 306, 082/088: 100%). Ressalvas: a reconciliação em massa atualizou só `qteProduzida` (montagem/fila), NÃO o ProducaoSemanal/Diaria do corte (esse o botão "Importar Syneco" por OP refaz). OP 060 tinha 9 "conjuntos" **sem `ConjuntoCroqui`** — na verdade eram **terças UE150X60X20X3.00 terceirizadas** (perfil comprado/perfilado fora, chegam prontas direto pra **Jato/Pintura**, não passam pela montagem). Resolvido 17/06: reclassificadas CONJUNTO→CROQUI e marcadas como terceirizado destino JATO. (Sinal de peça avulsa mal-classificada como conjunto: `descricao` = um perfil, ex. "UE150…", e sem croqui vinculado.) O recurso de terceirizado ganhou destinos Solda/Acabamento/Jato (commit 117b044).

**Import LPC com marcação do cliente (23/06, commit ec227ac):** OPs cujo projeto é do cliente (ex.: **OP-85 Danpower** — "ENC 0325 / Precipitador Eletrostático") **não têm código SKA TXX**; as marcas seguem a nomenclatura do cliente, então o `detectOpPrefix` (prefixo comum das marcas, em `lib/parse-lpc.js`) não acha nada e a importação falhava com "não foi possível detectar a OP". O modal **Importar LPC** (telas `producao/pecas` e `producao/programacao/corte`) virou fluxo de 2 passos (lê pra memória → botão "Importar") e o antigo campo de texto "Forçar OP" virou um **seletor das OPs ativas**: ao escolher, manda `opNumero = OP.numero` (ex. `"085"`) → o route resolve a OP e força o **opId**. Ou seja, pra essas OPs o `PecaConjunto.opNumero` gravado é o **número da OP** (`085`), não um SKA — e o agrupamento/exibição no corte funciona porque a tela mostra `p.op.numero` quando há opId. "Detectar pela marca" segue o padrão pra LPC Torg (TXX).

**Parte/fase (A/B/C) na Programação de Corte vem da MARCA, não do opNumero (30/07, commit 09b003b):** na tela `producao/programacao/corte` o `parteDe()` agrupa/filtra por "Parte" (as fases A/B/C que o pessoal usa). Lia do `opNumero`, mas nas peças LPC ele vem só com o número (ex.: "104") → tudo caía em "Parte —" (não separava). A letra da fase está na **marca** (T104**A**1→A, T104B3→B, T104-AC1→AC — padrão Tekla). Agora `parteDe` deriva da marca (`replace(/^T?\s*\d+\s*[-_.]?\s*/,'')` + `^[A-Z]+`), com fallback pro opNumero. Vitor: "usamos A, B, C pra separar as fases do projeto".

**Baixa automática (17/06, commit 85c0e95):** antes a baixa do corte (qteProduzida/status das peças) só acontecia rodando o "Importar Syneco" à mão por OP — os cortes do dia ficavam em aberto até alguém reconciliar. Agora um cron (`/api/cron/reconciliar-syneco-corte`, `vercel.json` `15 6-20 * * *`) roda a reconciliação em lote (`lib/reconciliar-syneco-corte.js` — casa por opId+marca, idempotente) sozinho. Carimbo "Baixa automática do corte · última: HH:MM" no painel do PCP (bloco Syneco), via AuditLog `RECONCILIAR_SYNECO_AUTO` exposto em `painel-corte`. O botão Importar Syneco por OP segue existindo pra forçar. Ver [[torg_fila_corte]] e [[torg_mes_syneco]].

**⚠⚠ TROCAR O `opNumero` ENTRE DUAS IMPORTAÇÕES DUPLICA A OBRA INTEIRA (01/09/2026, caso OP-097).** A importação da LPC casa por **`opNumero` + `marca`** (`where: { opNumero_marca: … }`), e o `opNumero` sai de dentro do arquivo. A 097 entrou em 18/08 como `T97A` e em 01/09 como `097`: chave diferente = **linha nova**, e o "sobrescrever" (que também filtra por `opNumero`) limpou o lote `097` — vazio — sem encostar no `T97A`. Resultado: 1.388 linhas para 898 peças, cada marca duas vezes, com peso e contagem dobrados na tela (216 conjuntos / 16.516 kg em vez de 187 / 15.064 kg).

**Sintoma de leitura rápida: croqui órfão.** Em obra sadia **todo croqui está pendurado num conjunto** — 067, 105 e 112 têm **zero** órfãos. A 097 tinha 681 de 756. Croqui órfão em massa = estrutura veio pela metade ou o lote está duplicado.

**⚠ Não "consertar" fazendo a importação apagar por `opId`:** a OP-067 tem **12 sub-obras legítimas** (T67B, T67C, T67D…) convivendo no mesmo `opId` — apagar por OP mataria as irmãs. O portal não consegue distinguir sozinho "mesma obra com código trocado" de "sub-obra nova"; só quem opera sabe.

**CONVENÇÃO FIXADA (Vitor, 01/09/2026): "ela não vai mais trocar, de agora em diante deixamos claro que será SEM LETRA".** O `opNumero` da LPC passa a ser o número puro da OP (`097`), sem o prefixo T nem a letra da parte. A fase A/B/C continua saindo da **marca**, como já estava (ver parágrafo do commit 09b003b) — não é o `opNumero` que carrega isso.

**Como foi resolvido na 097:** as 490 linhas do lote `T97A` eram 490/490 duplicatas (zero marca exclusiva), sem carga, romaneio ou entrega penduradas. A produção presa nelas (442 peças, 1.296 un) voltou sozinha ao lote novo rodando `reconciliarSynecoCorte()` — 571 peças preenchidas a partir do Syneco, que é a fonte de verdade. Só depois disso o lote velho foi apagado. **A ordem importa: reconciliar ANTES de apagar**, senão a prontidão do lote novo fica zerada e a montagem some.

⚠ O `deleteMany` em produção é barrado pelo classificador do modo automático — o comando fica para o Vitor rodar, com a conferência de marcas exclusivas embutida (aborta em vez de apagar).
