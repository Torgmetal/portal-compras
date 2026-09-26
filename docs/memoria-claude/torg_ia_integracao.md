---
name: torg_ia_integracao
description: "Portal de Compras já tem integração de IA (Claude) — model string, SDK e padrão de libs de extração"
metadata: 
  node_type: memory
  type: reference
  originSessionId: d9c0cffd-a288-4e74-b94d-9b9291161750
  modified: 2026-07-24T13:51:31.701Z
---

O Portal de Compras (Torg) **já tem integração de IA com o Claude** — reaproveitar em vez de reinventar quando pedirem features de "IA/organizar/extrair/analisar".

- SDK: `@anthropic-ai/sdk` (v0.30.1). Key em `process.env.ANTHROPIC_API_KEY` (já no `.env`, funcionando — NÃO imprimir o valor).
- **Model string em uso no portal: `claude-sonnet-4-6`** (confirmado funcionando com essa key/SDK). Usar o mesmo por consistência.
- Padrão de lib de extração (system prompt pedindo JSON, `extractJson` com fence + fatia `{`…`}`, `norm` p/ acento/upper, validação/whitelist no map): `lib/extrair-tarefas.js`, `lib/extrair-doc-qualidade.js`, `lib/auditoria-sugestao.js`, `lib/extrair-atividades-ata.js` ([[torg_reunioes]]).
- Rotas que usam: `app/api/planejamento/analise-critica`, `app/api/producao/importar`, `app/api/qualidade/documentos/extrair`, `app/api/comercial/op/[id]/kickoff/extrair`, `app/api/comercial/estudo/[id]/analisar*`, `app/api/assistente/chat`, `app/api/reunioes/parse-rascunho`.
- Aceita `content` com `{type:"document", source:{type:"base64", media_type:"application/pdf"}}` p/ ler PDF direto (ver extrair-tarefas).
- Rota que chama IA: `export const runtime="nodejs"` + `export const maxDuration=60`.

**Cotação do fornecedor (portal público `/fornecedores/c/[token]`, `CotacaoFornecedorForm.jsx`):** o fornecedor sobe o PDF da proposta → `parse-cotacao-ai` (Sonnet, lê preço unit × total em notação BR) devolve itens com `rmIndex` (qual linha da RM) → o form preenche. Fallback regex: `parse-pdf-cotacao` + `scoreMatchTokens`. ⚠️ **Bug corrigido 23/07 (commit 84914d6):** RMs de **consumíveis = `tipoRM:"INTERNA"`** (disco, eletrodo, EPI, tinta; opId sempre NULO) NÃO puxavam preço — a IA e o matching eram 100% de AÇO, ela lia o preço mas devolvia `rmIndex null` e o form descartava. Sem preço o fornecedor não enviava (form exige preço>0) → sem cotação RECEBIDA → o **mapa de cotação não abria** (é inline no RM detail, gate `rm.cotacoes.some(RECEBIDA)`). Fix: (1) `aplicarItensIA` casa por descrição os itens sem rmIndex; (2) `scoreMatchTokens` virou BIDIRECIONAL (max PDF→RM e RM→PDF, senão marca/embalagem extra do fornecedor derruba o score); (3) prompt da IA passou a cobrir consumíveis. Mapa de cotação da RM sem OP funciona: `apiBaseMapa=/api/rm/{id}` (com OP = `/api/op/{opId}`).

⚠️ **Bug corrigido 24/07 (cotação Gerdau RM-T102-001, 43 itens): TIMEOUT, não matching.** "PDF lido mas não casou os itens / casou 0" era a IA lendo o PDF como **documento (visão)** e estourando o timeout de 60s (`FUNCTION_INVOCATION_TIMEOUT` aos 60,7s) → o form (linha ~248, `if (resIA.ok)`) cai **silenciosamente** no regex fraco `parse-pdf-cotacao`+`scoreMatchTokens`, que não casa perfil de aço → 0. Fix na rota `parse-cotacao-ai`: (1) **extrai o texto do PDF com `unpdf` e manda TEXTO** pra IA (~30s vs >60s); só cai na visão se texto <150 chars (PDF escaneado); `maxDuration` 60→120. (2) prompt aprendeu **nomenclatura de usina** (Gerdau/CSN: "PF H/I/U", "CANT", "BARRED", "FX…T"=fardo ignore) e **conversão mm↔polegada** (76,2mm=3", 101,6=4", 152,4=6", 203,2=8", 254=10") — usina cota U/cantoneira/barra em MM, RM em POLEGADA. Validado: IA casa **29/29** (Gerdau consolida linhas repetidas da RM). Lição: PDF grande/RM grande → mandar TEXTO, não documento.

Para testar lib de IA fora do Next: o projeto NÃO é `type:module`, então `.js` do repo é CommonJS — copiar o código pra um `_test.mjs` self-contained dentro do repo (resolve node_modules) e rodar `node --env-file=.env _test.mjs`; apagar depois. Pra reproduzir cotação: baixar o PDF do `Anexo.blobUrl` (público), extrair texto com `unpdf`, chamar o SDK Anthropic direto com os itens da RM.

## Resposta no formato estruturado da API (26/09/2026)

Os extratores de `lib/` e as rotas do estudo, do Kick Off e do retorno de terceiros pedem a resposta pelo
**formato estruturado da API** (`output_config.format`), e não mais por "responda SOMENTE com JSON". É o padrão
para código novo:

- `pedirJson(cliente, { model, max_tokens, system, messages, formato })` e `Esquema` em `lib/ia-json.js`. Os schemas
  das rotas ficam em `lib/ia-esquemas.js` (rota do Next só exporta handler); os das libs, ao lado do prompt.
- ⚠⚠ **A API limita cada requisição a 16 campos "ou null" e 24 opcionais**; passou disso, é 400. `Esquema.objeto`
  fecha o objeto (tudo obrigatório). Schema com muitos campos ausentáveis usa **texto vazio** (`""`) como ausente —
  boletim, calibração, PLP e Kick Off já fazem assim. `testes/lib/ia-esquemas.teste.js` faz a conta.
- ⚠ O schema não garante maiúscula/minúscula de valor de `enum`: compare sem caixa.
- ⚠ `max_tokens` ainda corta no meio: `pedirJson` devolve `dados: null` e o texto cru. Recusa também não segue o schema.
- A primeira chamada com um schema novo demora um pouco mais (a API compila o formato e guarda por 24 h).
- O SDK 0.30.1 passa `output_config` adiante sem reclamar — testado de ponta a ponta, não precisa atualizar.
- ⚠⚠ **A leitura da cotação do fornecedor (`app/api/parse-cotacao-ai`) ficou no jeito antigo por decisão do Vitor
  (26/09): o que toca cotação/RM só muda depois de o Compras decidir.** A proposta pronta (avisos de imposto que
  a rota descarta; a regra do prompt que zera o preço que `lib/cotacao-itens-ia.js` sabe corrigir) está na
  auditoria de prompts registrada em `docs/revisao-codex-claude.md` (26/09).

⚠⚠ **MODELO APOSENTADO VIRA 404, NÃO AVISO.** `claude-sonnet-4-20250514` saiu do ar em 15/06/2026 e as análises de
parafusos e acessórios do estudo ficaram quebradas até 26/09 sem ninguém notar. Para conferir se um id ainda
existe, sem gastar nada: `GET https://api.anthropic.com/v1/models/<id>` com a chave (404 = aposentado).
