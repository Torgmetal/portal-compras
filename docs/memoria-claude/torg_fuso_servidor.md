---
name: torg_fuso_servidor
description: "Servidor (Vercel) roda em UTC — toda data/hora que o portal escreve precisa de dataHoraBR()/dataBR() de lib/data-br.js, senão sai 3h adiantada"
metadata:
  type: project
---

⚠️ **`toLocaleString("pt-BR")` define o IDIOMA, não o FUSO.** O Vercel roda em **UTC**, então
qualquer data/hora formatada pelo servidor sai **3h adiantada**: um desenho emitido às 21:48 de
18/08 saía carimbado `19/08/2026 00:48`. Vitor pegou no carimbo do desenho (19/08/2026).

**Não aparece em dev**: minha máquina (e a do Vitor) está em `America/Sao_Paulo`, então local
fica certo e só quebra em produção. Testar com `TZ=UTC node ...`.

Use **sempre** `dataHoraBR(d)` / `dataBR(d)` de `lib/data-br.js` (Intl com
`timeZone: "America/Sao_Paulo"`) em tudo que o **servidor** escreve pro usuário — PDF, e-mail,
Excel, nome de arquivo, observação gravada no banco.

🚫 **NÃO aplicar em campo `@db.Date`** (`corteDataMetaInicio`, datas de cronograma…): o Prisma
devolve date-only como **meia-noite UTC** e converter pra BRT **volta um dia**. Ali a data crua é
que está certa. Por isso o `fmtData` de `lib/utils.js` ficou como estava.

Corrigidos em 19/08/2026 (commit f16096d): carimbo do desenho [[torg_desenho_rastreado]],
observação do DocumentoQualidade, nome do arquivo no SharePoint, PDFs de Organograma, Plano de
Treinamento, Avaliação de Calibração, Cronograma de Auditoria, Indicadores ISO e Kick Off,
e-mail de cobrança de atraso e observação de OP encerrada/cancelada.

Para o dia-calendário (não exibição) continua valendo `diaBRT()`/`hojeBRT()`; para datas **do
Syneco**, que são UTC-naïve, use `diaSyneco()` — ver [[torg_syneco_apontamento_fonte]].
