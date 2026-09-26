# Inteligência Fiscal mais simples — Simulador pela obra, IBS/CBS das NFs, Auditoria por parcela

Pedido de Matheus (26/09/2026): *"a aba Inteligência está muito complexa com muitas funções,
precisamos deixar algo mais simples e usual usando nosso banco de dados ainda. Simulador pode trazer
a porcentagem dos impostos quando eu seleciono a obra — o comercial já cadastra o imposto estimado do
cliente —, também puxar as regras IBS/CBS que já temos em nossa NF no Omie. E na tela auditoria ser
possível selecionar as medições/medições parciais para ver como deveria ser cada imposto seguindo a
regra do NCM da medição e o CFOP."*

## Decisões já tomadas com o Matheus

| Pergunta | Decisão |
|---|---|
| Abas visíveis | Simulador, Auditoria de medição, Consulta NCM/CFOP, Assistente |
| "Medição parcial" | Parte de uma medição: escolher a medição e marcar itens/quantidades daquela parcela |
| Fonte do IBS/CBS | **A** — aprender com as NF-e de saída do Omie e guardar no portal |
| Parte 1 (tela + base IBS/CBS) | Aprovada em 26/09/2026 |

## Fatos medidos (26/09/2026)

- **Imposto estimado da obra = `OPReceita`**: linhas de receita que o Comercial cadastra, cada uma com
  `cfop` e `icmsPct, ipiPct, pisPct, cofinsPct, issPct, irrfPct, csllPct`. 104 linhas em **41 das 50
  OPs**. (`PropostaEstudo` tem alíquotas, mas **0** OPs ligadas; `OP.estudoDados` só em 1.)
  ⚠ Muitas linhas têm `cfop` nulo e o NCM só no texto (`[NCM: 84313900]`).
- **IBS/CBS no Omie**: `produtos/nfconsultar` `ListarNF` devolve por item `prod.pAliqCbs` (0,9),
  `prod.pAliqIBSUf` (0,1), `prod.vBCIbsCbs`, `prod.vCbs`, `prod.vIBS`, `prod.vIbsUf`, e totais
  `IBSTot`/`CBSTot` (conferido na NF 943). NCM e CFOP vêm no mesmo item. Nada disso é gravado hoje.
- **Pedido da medição** (`lib/fiscal/pedido-omie.js` `lerPedidoOmie`): por item `ncm`, `cfop`,
  `quantidade`, valor, `ipi` {cst, cEnq, aliquota, valor, base} e `icms` {cst, aliquota, valor, base}.
- Já existem: motor `auditar` (`lib/fiscal/auditoria.js`), simulador (`lib/fiscal/simulador.js`
  `simular`, `ipiDaTipi`, `daEscolhaDoCfop`), rota `/api/fiscal/inteligencia/medicoes`.

## Parte 1 — A tela e a base de IBS/CBS (aprovada)

**Abas**: `Simulador · Auditoria de medição · Consulta NCM/CFOP · Assistente` (+ `Administração`, só
ADMIN, com Classificação de produtos, Cadeia de documentos, Validação de regras e Atualizações
tributárias — nada é apagado). A tela abre no **Simulador**. Consulta NCM e Consulta CFOP viram uma
aba, com um campo que aceita os dois. O upload de XML sai da Auditoria (continua no Assistente).

**Tabela `FiscalRegraIbsCbs`** (DDL em `scripts/ensure-fiscal-tables.mjs`, idempotente — nunca
`db push`): chave única `(ncm, cfop, ufDestino, pCbs, pIbsUf, pIbsMun)` — uma linha por combinação
de ALÍQUOTAS observadas, para que divergência apareça como duas linhas e não como uma sobrescrita.
Campos: `cstIbsCbs?`, `cClassTrib?` (se o Omie mandar), `qtdNotas`, `primeiraNf`, `primeiraEm`,
`ultimaNf`, `ultimaEm`, `atualizadoEm`.

**Coleta** (`lib/fiscal/regras-ibs-cbs.js`): lê `ListarNF` (saída, `tpAmb 1`) numa janela, extrai por
item (NCM, CFOP, UF do destinatário, alíquotas) e faz upsert com `prismaDirect` e SQL constante (regra
de bulk write do CLAUDE.md). Cron diário (últimos 7 dias, com `aquecerBanco` e `registrarExecucao`)
+ botão "Atualizar regras das NFs" (ADMIN/FISCAL). Primeira carga: 2026 inteiro, mês a mês.
⚠ Item sem alíquota de IBS/CBS (nota antiga, remessa) não gera regra — ausência não é "0%".

**Leitura**: `regraIbsCbs({ ncm, cfop, uf })` devolve `{ situacao: "UNICA" | "DIVERGENTE" | "SEM_NF",
linhas }`. A tela nunca escolhe entre divergentes; mostra as duas com as notas.

## Parte 2 — Simulador pela obra

Fluxo: **escolher a obra** → a tela lista as **linhas de receita** dela (descrição, CFOP, valor) →
escolher uma linha preenche **CFOP, NCM** (do campo ou do `[NCM: …]` da descrição) e **UF** da obra
→ informar o valor (vem o da linha, editável) → **Simular**.

Resultado, uma linha por tributo, em três colunas:

| Tributo | Cadastrado pelo Comercial (`OPReceita`) | Regra (portal) | Valor sobre a base |
|---|---|---|---|
| ICMS | `icmsPct` | `lib/fiscal/icms.js` pelo CFOP/UF | R$ |
| IPI | `ipiPct` | TIPI pelo NCM (`ipiDaTipi`) | R$ |
| PIS / COFINS | `pisPct` / `cofinsPct` | — (o cadastrado) | R$ |
| ISS / IRRF / CSLL | os `%` cadastrados | — | R$ |
| CBS / IBS | — | `FiscalRegraIbsCbs` + NF de origem | R$ |

- ⚠ Quando **Comercial e regra divergem** (ex.: IPI 0% cadastrado e TIPI 5%), a linha fica em âmbar
  com os dois números — é o aviso que o módulo existe para dar. Não corrige o cadastro.
- ⚠ Obra sem `OPReceita` (9 de 50): o simulador funciona só pela regra, e diz "sem imposto
  cadastrado pelo Comercial nesta obra".
- ⚠ Linha sem CFOP: o seletor de CFOP fica vazio e obrigatório — não se adivinha CFOP.
- O formulário atual (NCM/CFOP/UF manuais) continua para simulação **sem** obra.

## Parte 3 — Auditoria de medição por parcela

Fluxo: **escolher a medição** (lista atual, não faturadas primeiro) → a tela mostra os **itens do
pedido** (descrição, NCM, CFOP, quantidade, valor unitário) com **caixa de seleção** e **quantidade
editável** (0 < qtd ≤ quantidade do pedido; padrão = tudo marcado, quantidade cheia) → **Auditar
parcela**.

Por item marcado, base = `quantidade da parcela × valor unitário`:

| Tributo | Como deveria ser (regra) | Como está no pedido do Omie | Situação |
|---|---|---|---|
| IPI | TIPI pelo NCM (motor `auditar` atual) | `ipi.aliquota` / CST / cEnq | OK / DIVERGENTE / NÃO AVALIÁVEL |
| ICMS | `icms.js` por CFOP + UF da obra | `icms.aliquota` / CST | idem |
| PIS / COFINS | `%` da `OPReceita` da obra casada pelo CFOP | — | informativo |
| CBS / IBS | `FiscalRegraIbsCbs` (NCM, CFOP, UF) | — (o pedido não traz) | UNICA / DIVERGENTE / SEM_NF |

Rodapé: **total da parcela** por tributo (valores esperados) e contagem de divergências.

- ⚠ A parcela é **simulação de leitura**: nada é gravado, nenhuma NF é emitida (mesma regra da
  auditoria atual).
- ⚠ Não há controle de "saldo já faturado" por item nesta versão — o limite é a quantidade do pedido.
  (Registrar como pendência, não inventar saldo.)
- ⚠ O motor `auditar` continua sendo o único juiz de IPI — a parcela só troca a base.

## Fora do escopo

Emitir NF; gravar apontamento de auditoria; corrigir `OPReceita`; saldo faturado por item; PDF
(fases seguintes do briefing do Assistente).

## Testes

- `regras-ibs-cbs`: extração de um `ListarNF` real reduzido (fixture da NF 943); divergência vira
  duas linhas; item sem alíquota não gera regra; leitura UNICA/DIVERGENTE/SEM_NF.
- Simulador pela obra: linha com `[NCM: …]` na descrição; linha sem CFOP; obra sem receita;
  divergência Comercial × TIPI em âmbar.
- Parcela: base proporcional; quantidade acima do pedido recusada (servidor); item desmarcado fora do
  total; IPI julgado pelo mesmo `auditar`.
- Tela: 4 abas para não-ADMIN, 5 para ADMIN; abre no Simulador. Validação logada no localhost.
