# Assistente Fiscal TORG — a IA orquestra, a ferramenta determina

`Fiscal › Inteligência Fiscal › Assistente Fiscal` (primeira aba; nenhuma das 8 antigas saiu).
Código em `lib/fiscal/assistente/`, rotas em `app/api/fiscal/assistente/`, tela em
`components/fiscal/assistente/`.

⚠⚠ **A INSTRUÇÃO NÃO SEGURA NADA — QUEM SEGURA SÃO TRÊS CAMADAS** (parecer do Codex, 23/09/2026:
*"A1 ainda permite afirmações inventadas… o modelo pode aplicar o fato correto à operação errada"*):
1. **Lista fechada de ferramentas** (`ferramentas.js`) — sem SQL, sem URL, tudo de LEITURA. Nome
   fora da lista vira erro estruturado, nunca busca nova.
2. **Blocos renderizados pelo SERVIDOR** (`contrato.js`) — CFOP, alíquota e citação saem do
   resultado estruturado. O modelo **comenta** o número; ele não escreve o número.
3. **`conferirProsa`** — varre o texto do modelo atrás das quatro invenções que o briefing proíbe
   por nome (alíquota, artigo, CFOP, NCM) e acusa o que não tiver lastro nos blocos. ⚠ O NCM é
   varrido ANTES do CFOP: "5101.00.00" contém "5101", e sem isso todo NCM legítimo viraria CFOP
   inventado.

⚠⚠ **SEM EMBEDDINGS, E O ARGUMENTO NÃO É "CABE NA JANELA".** Medido na produção: o corpus jurídico
inteiro são **10 normas / 298 dispositivos / 129.434 caracteres (~37 mil tokens)**. Eu ia criar um
índice GIN em `FiscalDispositivo` — o Codex apontou que isso é ALTERAR TABELA EXISTENTE, o oposto do
que eu tinha prometido. Virou leitura cacheada (TTL 5 min) + ranking em JS (`ranking.js`), que é
função PURA e testável. `vector` e `pg_trgm` estão disponíveis no Neon e **não instalados**.

⚠⚠⚠ **O PISO DE RELEVÂNCIA É 4, E FOI MEDIDO, NÃO ARBITRADO.** Sem piso havia dois falsos positivos:
| pergunta | devolvia | p |
|---|---|---|
| "cliente comprou, fornecedor entregou na TORG" | art. 406, III ✅ | 6 |
| "jateamento e depois pintura" | art. 409 / 402 ✅ | 5 |
| "vender para o Rio Grande do Sul" | art. 52, § 2º ✅ | 4 |
| **"impressora em LOCAÇÃO, devolver"** | **art. 408, II ❌** | 3 |
| **"receita de bolo de cenoura"** | **art. 131, § 3º ❌** | 1 |
O caso da locação é o que justifica o piso: **não há uma linha sobre locação nesta base**, e a busca
devolvia um artigo de industrialização. Dispositivo errado é muito pior que nenhum — nenhum vira
"não tenho fundamento aqui"; errado vira resposta com cara de fundamentada. ⚠ E "receita" casou com
bolo porque no RICMS *receita* é faturamento; ninguém adivinharia isso sem medir.

⚠⚠ **VAZIO SIGNIFICA "NÃO HÁ FUNDAMENTO NESTA BASE", NUNCA "NÃO EXISTE PREVISÃO LEGAL".** A base é
RICMS/SP + DN CAT + 3 RCs + TIPI federal. **Não há RIPI nem RICMS de outro estado.** Cobertura
parcial responde a parte coberta e nomeia o pedaço que ficou sem — não recusa a pergunta inteira.

⚠⚠ **A RESERVA DE ORÇAMENTO É ATÔMICA E VEM ANTES DA CHAMADA.** Conferir saldo e incrementar depois
deixa duas simultâneas passarem. É um `INSERT … ON CONFLICT DO UPDATE … WHERE custoMicros + $3 <=
teto`: quem decide é o Postgres, no mesmo comando que grava. **Provado contra a produção: 12
reservas simultâneas com teto de 4 → passaram exatamente 4.** ⚠ Reserva de execução interrompida
**não volta sozinha** — o custo real é desconhecido, e devolver transformaria queda de rota em jeito
de furar o teto.

⚠⚠ **A ROTA TRANSMITE PROGRESSO, NUNCA TEXTO FISCAL NÃO CONFERIDO.** SSE com `etapa`/`pronta`/`erro`.
Ordem inegociável: **reserva → execução EM_ANDAMENTO (transação curta) → chamada FORA de transação →
conclusão + conciliação**. Transação aberta durante 30 s de rede externa é o caminho do OOM 53200
deste Neon. ⚠ Execução abandonada é detectada por **expiração na leitura**, não por `finally` —
`finally` não roda quando a Vercel mata a função.

⚠ **Chave de idempotência por tentativa**: reenvio do POST devolve a execução existente. Cada
tentativa aqui é dinheiro.

⚠ **Conversa se ARQUIVA, não se apaga** — a rastreabilidade do §22 mora nas mensagens. E a evidência
guarda o **trecho**, não o ponteiro: `FiscalNormaVersao` tem exclusão em cascata, e hash identifica
sem preservar.

⚠⚠ **O TORGUINHO SAIU DESTA TELA, por dois motivos.** O balão `fixed bottom-4 right-4` cobria o
botão de enviar (visto em 1440×900, não lendo código) — e **dois assistentes na mesma tela** fazem
perguntar de fiscal para o errado: o Torguinho não consulta TIPI nem legislação.

⚠⚠ **A CHAVE DA ANTHROPIC NÃO VEM PELO `vercel env pull`**: variável do tipo *Secret* volta como o
literal `[SENSITIVE]`. Ela existe em **Preview e Production**, não em Development — então local o
assistente aparece **desligado**, com tarja explicando, e as outras abas seguem funcionando.
Para testar local é preciso colar a chave à mão no `.env.local`.

⚠ **Provedor**: `@anthropic-ai/sdk` 0.30.1, já em produção com 12 outros usos. Tem tool use,
streaming e prompt caching (beta header). **NÃO tem leitura nativa de PDF** — entrou em versão
posterior, e é por isso que o upload de PDF do §17 ficou para a segunda etapa.

## XML anexado (§16) — 24/09/2026

⚠⚠⚠ **O CÓDIGO DA NOTA NÃO É RECOMENDAÇÃO.** Todo bloco carrega `lastro` tipado com ORIGEM
(`REGRA | LEI | TIPI | DOCUMENTO`). O CFOP da remessa anexada respalda "a nota declara 5.915", nunca
"use 5.915 no retorno" — `conferirProsa` avisa `soDocumento` em âmbar. ⚠ O lastro NÃO sai mais de
`JSON.stringify(blocos)`: número dentro do texto de um artigo (o 406 cita o 407) virava "comprovado".

⚠⚠ **`req.formData()` materializa o corpo antes de conferir o tamanho** — o teto real está em
`multipart.js`, que conta bytes enquanto chegam. ⚠ **4 MB, não 8**: função da Vercel para em 4,5 MB.
Parse DOM é síncrono e nenhum timeout o interrompe: 990 itens = 3 MB = 74 ms, e o teto de bytes é o
único controle real de CPU.

⚠ O XML **é guardado** (`FiscalAnexo`, Postgres, privado) — ao contrário da aba Auditoria, porque o
briefing pede (§21/§23). Blob não serve: é público para quem tiver o link.

⚠ `lerNfe` NÃO mudou: a validação de arquivo de terceiro mora em `anexo-nfe.js` (recusa DTD, notas
múltiplas, XML fundo/largo; coleta erros de parse em vez de silenciar).

Ver [[torg_codex_aceito_sempre]], [[torg_portao_modulos]].
