---
name: torg-analise-critica-po13
description: "Análise Crítica de Projeto (PO-13) na aba Engenharia da OP — o que é, de onde vem cada bloco, onde está o código, decisões do Vitor (10/09/2026)"
metadata:
  type: project
---

**Análise Crítica de Projeto (PO-13)** — bloco na aba Engenharia do detalhe da OP (`app/comercial/[id]/AnaliseCriticaSection.jsx`),
um registro por OP (`AnaliseCriticaProjeto`, tabela criada por `scripts/ensure-analise-critica.mjs`, blocos em JSON), API
`app/api/comercial/op/[id]/analise-critica` (GET/PUT · `/pdf` · `/sharepoint`), regras em `lib/analise-critica.js`, PDF em
`lib/analise-critica-pdf.js` (= FORM 08 Rev.02, registrado em `lib/sgq-forms.js`). Vitor (10/09/2026): "o FORM 08 é meio raso,
precisamos de uma análise de verdade (…) na pasta da OP, na aba de Engenharia, para não ficar alguma coisa a mais" e depois
"vamos buildar da forma que vc fez na prévia, e vamos vendo como será no dia a dia".

Sete blocos e a origem de cada um (o Vitor perguntou "de onde vc tirou?" — responder sempre com isto):
1 Entradas (PO-13 §5.2 + Nota 1, campo do FORM 08) · 2 Requisitos (Nota 1, Nota 2a) · 3 Análise por área (**não está no
PO**: montada das áreas que o §5.3 chama para a reunião) · 4 Riscos (**não está no PO-13**: FORM 06 "Análise de Risco e
Ações" Rev.01 + ISO 9001 §6.1) · 5 Verificação das saídas (Nota 2, §5.5 = linhas do FORM 08; 4 verificações automáticas:
LE × contrato, LPC × LE, pintura × orçado, gabarito de transporte) · 6 Comentários do cliente/alterações (Nota 3, §5.7) ·
7 Reuniões (FORM 10) e ações (5W2H). Aprovação = Diretoria (`temAcessoDiretoria`); edição = ENGENHARIA/ADMIN; nova revisão
congela a anterior em `historico`. PDF vai para `OP/2. Engenharia/2.9 Análise Crítica` (subpasta nova; conflict replace).

**Escopo do documento (Vitor, 11/09/2026):** a análise crítica é de PROJETO — "desvio de material, cálculo, esse tipo de
informação", não "tudo que envolve a obra". Rastreabilidade (R), almoxarifado, recebimento, logística ficam FORA;
isso é PO-01/Qualidade, não PO-13. **Alimentar o registro pelos e-mails da empresa foi descartado** ("acho que vai
ser pior esse preenchimento automático, vamos deixar quieto") depois de duas prévias com os 7 e-mails da OP-118:
a IA trazia inox/certificado/almoxarifado, que não é assunto de projeto. Não propor de novo sem ele pedir.

**Why:** PO-13 R3 manda registrar "no Form. 08", que era uma folha de X; o SGQ exige o FORM identificado no documento.
Se os blocos 3 e 4 ficarem, o PO-13 precisa subir para R4 citando análise por área e FORM 06 (senão o auditor pergunta).

**How to apply:** mudanças de formato = mexer em `CAMPOS`/`registroSchema`, não em tabela; FORM 10 (ata) já sai em PDF
do bloco 7 (ver 11/09 abaixo) e está em `lib/sgq-forms.js`. Ver [[torg_carga_regras]] (prévia de carga alimenta
a verificação de transporte) e [[torg_sgq_form_identificacao]].

**11/09/2026 — bloco 7 fechou o ciclo (commit 988d0466, build 3093):** cada reunião tem "Ata FORM 10" (PDF via
`/api/comercial/op/[id]/analise-critica/ata/[reuniaoId]/pdf`, lib `analise-critica-ata-pdf.js`, FORM 10 Rev.02 em
`sgq-forms`); "Levar ao 5W2H" (POST `…/analise-critica/plano-5w2h`) cria UM PlanoAcao da Qualidade por registro
(`AnaliseCriticaProjeto.planoAcaoId`) e nas chamadas seguintes só acrescenta ações novas, casadas pelo TEXTO do
"o que" (não há id cruzado — ação renomeada vira item novo, de propósito). Os dois exigem registro SALVO (guard
`exigeSalvo` na tela). Guilherme foi autorizado a aprovar (`lib/analise-critica-acesso`, commit 5d643c9b, sessão do Vitor).
