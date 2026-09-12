---
name: torg_custo_hora
description: Custo-hora por setor (Comercial) — modelo de preço/hora das propostas de serviço e importador da auditoria CET
metadata: 
  node_type: memory
  type: project
  originSessionId: d9c0cffd-a288-4e74-b94d-9b9291161750
---

Config singleton `ConfigCustoHora`, API `/api/comercial/custo-hora` (+ `/importar`). É a base do "valor por hora" das propostas de serviço (corte/furação, jato, pintura, solda) — ver [[torg_faturamento_direto]].

⚠️ **Moveu para o Portal da Diretoria** (14/07/2026, commit 28244b5): a UI (`CustoHoraClient`) saiu de `app/comercial/orcamentos/custo-hora` → **`components/CustoHoraClient.jsx`** e virou uma **aba em `/diretoria`** (`DiretoriaClient`, `aba === "custo-hora"`). A antiga rota comercial redireciona pra `/diretoria`; saiu do menu do Comercial. A **API continua em `/api/comercial/custo-hora`** e o Comercial ainda a LÊ (o detalhe do serviço puxa o valor/hora pra proposta) — por isso o gate virou `gateCustoHora()`: ADMIN/COMERCIAL **OU** `temAcessoDiretoria(email)` (allowlist da [[torg_modulo_diretoria]]), no GET/PUT/importar. O cálculo (`lib/custo-hora-calc.js`) não mudou.

**Modelo (Lucro Real):**
- MOD = **CET real** (quando importado da auditoria) OU salários × fator de encargos (manual). Fator real médio ≈ **2,02** (varia 1,62–2,56 por setor) — bem acima da estimativa 1,8.
- **Flag `faturaHora` por setor** (add 07/07): fábrica + montagem externa **faturam**; ADM/apoio = **overhead** (não fatura). Rateado (MOD/headcount/horas) **só nos que faturam** → a hora vendida carrega a empresa inteira; custo total 100% recuperado nas horas faturáveis (não fica preso no ADM).
- **Overhead vem da DRE, NÃO do "1,5 mi chapado"** (07/07): o 1,5 mi inflava (embutia aço/folha/capex → overhead ≈4× MOD → preço-hora R$183–475). Agora: **Overhead a ratear = folha dos setores que não faturam (ADM) + `outrosCustos`** (lista editável na tela, coluna JSON `ConfigCustoHora.outrosCustos`). "Custo total mensal" deixou de ser input → derivado (MOD+CIF+outros). Botão **"Sugerir da DRE"** preenche os custos operacionais NÃO-folha da [[dre_alvo_torg]] (material auxiliar 30k, gás 25k, energia fábrica 35k, aluguéis, manutenção… ≈**R$306k/mês**). Resultado: preço-hora **R$87–227** (realista p/ serviço, cliente fornece o aço).
- **DRE Alvo — classificação (Vitor 07/07)**: EXCLUIR do overhead de serviço: matéria-prima (aço, cliente fornece), folha produção (já na CET), empreita terceirizada, impostos s/ venda + comissões (já em impostos/margem), **hospedagem** (40k), capex/depreciação (por ora), financeiro. INCLUIR: só custos operacionais correntes não-folha.
- Pendente: ligar a **preço-hora** no campo "valor/hora" do orçamento de serviço (corte/furação→PREPARAÇÃO, jato→JATO, pintura→PINTURA, solda→SOLDAGEM) — hoje é digitado à mão.
- custo-hora = (MOD + CIF + overhead) ÷ horas do setor.
- **preço-hora = custo-hora × (1 + margem de lucro) ÷ (1 − impostos de venda)**. Margem de lucro é separada dos impostos porque **o custo total de 1,5 mi já inclui salários e impostos** — misturar quebraria a margem (feedback do Vitor).
- Horas/pessoa = horas/dia × dias úteis × (1 − absenteísmo). Parâmetros: jornada **8,75h**, **22** dias, absenteísmo **8%** → ~177 h/pessoa.
- 🚨 **A armadilha do absenteísmo (24/08/2026)**: o campo se chama `ocupacaoPct` no banco mas a tela diz **"Absenteísmo (%)"** e a conta é `(1 − x)`. O banco estava com **80** → 38,5 h/pessoa/mês → **custo-hora 4,6× alto em todos os setores** (SOLDAGEM R$ 889/h em vez de R$ 193/h) e isso ia direto pro preço da proposta de serviço. Origem: fallback `num(ocupacao) || 80` no formulário (campo limpo → 0 → 80). Hoje: Zod recusa acima de `ABSENTEISMO_MAX` (40%), a tela avisa, e **`precoHoraDoServico` devolve `null`** com config incoerente em vez de devolver número errado. `scripts/corrigir-absenteismo-custo-hora.mjs` corrigiu a linha do banco (**rodado 24/08/2026**): absenteísmo de volta a 8%, preço-hora R$ 104–193/h.
- ⚠️ O `horasMes` lançado por setor também ficou congelado na base velha (192 h para 5 soldadores = menos de um mês de UMA pessoa; batem `headcount × 38,5`). Zerado, a conta volta a usar `headcount × horas/pessoa` e acompanha a jornada. Quando importado, usa horas efetivas da auditoria (Previstas − Ausência).

**Importar auditoria CET** (`lib/cet-auditoria.js` + `/api/comercial/custo-hora/importar`): lê a aba "Custo Efetivo" da planilha CET (SheetJS), agrega por SETOR (headcount, salário, CET). Não salva — revisa e Salva.
- **Agrupamento (definido pelo Vitor 07/07)**: Torg + VMI = **uma empresa só** (junta setores de mesmo nome). **Montagem externa = setor à parte** (não é fábrica). Todo o apoio (qualidade, RH, engenharia, portaria, adm, orçamento, PCP, financeiro, projetos, almoxarifado, jardinagem, comercial, expedição, produção, incluir) colapsa num único **ADM**. Sobram 6 setores de fábrica (PREPARAÇÃO, SOLDAGEM, MONTAGEM, JATO, PINTURA, ACABAMENTO) + Montagem externa + ADM = **8 setores**. CET total R$ 408.520 (ADM ≈110k/18p, Montagem externa ≈94k/13p).
- **Horas NÃO vêm da planilha** — lançamento **manual** por setor (coluna Horas/mês editável). Vazio usa a estimativa pessoas × jornada (8,75h × 22 × (1−8%)) como sugestão/placeholder. Coluna da tela é "Tipo" (Fábrica/Externa/ADM).
- Nuance em aberto: Montagem externa recebe rateio de overhead da planta junto (não é fábrica) — pode não ser desejado; sem toggle de exclusão ainda.

Pendente/oferecido: conectar o preço-hora daqui no "valor por hora" do orçamento de serviço (hoje digitado à mão no corte/furação).
