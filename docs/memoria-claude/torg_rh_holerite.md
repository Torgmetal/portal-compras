---
name: torg_rh_holerite
description: "RH — holerite (import/disparo/confirmação + comprovante de ciência) e classe de bug \"Invalid input NaN\" (Zod v4) em férias e holerite"
metadata: 
  node_type: memory
  type: project
  originSessionId: d9c0cffd-a288-4e74-b94d-9b9291161750
---

**Holerite (RH):** importar (upload PDF do lote → `preparar` extrai texto/página e sugere funcionário → tela de revisão → `confirmarImportacao` POST `/api/rh/holerite`) → `disparar` (e-mail via Resend, anexa a **página** do PDF completo via pdf-lib, `Holerite.pagina`) → funcionário confirma em `/meu-rh` (`POST /api/meu-rh/holerite/[id]/confirmar` grava `visualizadoEm`/`confirmadoEm`/`confirmadoIp`). Modelo `Holerite`: status PENDENTE/ENVIADO/VISUALIZADO/CONFIRMADO. Matheus refez o import (não sobe página por página; guarda o PDF completo no Blob + nº da página) em 10/07.

**Comprovante de ciência (feito 10/07):** botão **"Comprovante"** na aba Holerites → `GET /api/rh/holerite/comprovante?competencia=AAAA-MM` → PDF (`lib/holerite-comprovante-pdf.js`, pdf-lib A4 paisagem) com 1 linha por funcionário: status + **visualizado em + confirmado em + IP**. Serve como prova da assinatura/ciência eletrônica. Campos já existiam.

**⚠️ Classe de bug "Invalid input: expected number, received NaN" (Zod v4):** `z.number()` REJEITA `NaN`. Cuidado com `Number(x)`/`parseFloat(x)` que viram NaN e com `NaN ?? null` (o `??` NÃO pega NaN, só null/undefined). Corrigidos em 10/07:
- **Férias retroativas** não salvavam (`app/api/rh/ferias/route.js`): `salarioBase`/dias vinham NaN. Fix: schema com `z.preprocess` → NaN/vazio/fora-de-faixa vira default seguro (diasGozo→30, vendidos/descontos→0, salarioBase inválido→null) + `.default()` p/ chave ausente (Zod v4 NÃO roda preprocess em chave ausente!).
- **Holerite VMI** não lançava após importar (`lib/holerite-pdf.js` + `app/api/rh/holerite/route.js`): `parseHolerite` fazia `valorLiquido = parseFloat(...)` = NaN no layout do PDF da VMI. Fix: guardar NaN→null na fonte + `z.preprocess` no `valorLiquido` do itemSchema.

**INSS patronal (item resolvido pelo Matheus, `lib/folha-calc.js`):** `semInssPatronal(empresa) = /vmi/i.test(empresa)` zera os 20% de INSS patronal p/ VMI (Simples, está no DAS); TORG mantém; FGTS nos dois. Confirmado: empresas em Funcionario = "TORG"(19), "VMI"(50), "VMi"(1), "VMI MONTAGENS INDUSTRIAIS LTDA"(1) casam certo. **8 funcionários com `empresa` = null** calculam patronal por padrão — se algum for VMI, falta preencher a empresa no cadastro. Ver [[torg_custo_hora]] (Torg+VMI = 1 empresa, 8 setores).

Relacionado: [[torg_rh_documentos]], [[torg_rh_ponto_he]].
