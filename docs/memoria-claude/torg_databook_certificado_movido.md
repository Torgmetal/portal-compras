---
name: torg_databook_certificado_movido
description: Certificado movido de pasta no SharePoint some do data book em silêncio (item 404 → "pendência" no canto da tela); OP-106 R 261162/261163 saíram do livro que o cliente aceitou. Agora há 4º degrau (busca pelo nome) e a pendência é para ser lida
metadata:
  type: project
---

**O caso (16/09/2026):** Vitor: "no data book da OP-106 temos duas mensagens de erro ao anexar o
certificado de uma chapa 12,5 e 19 mm". Não era o anexo: eram as **pendências da geração de
volumes** — os certificados R 261162 (CH 12,5) e R 261163 (CH 19), da própria OP, tinham sido
movidos pelo Almoxarifado de `01. Rastreabilidade/Certificados TMSA` para
`Certificados 2026/Certificados Digitalizados`. O `sharepointItemId` e o caminho gravados pelo
import do CMR morreram juntos (HTTP 404), o volume saiu sem os dois e **o cliente aceitou o livro
incompleto** (R01, 15/09 → aceite 16/09 13:30).

**Regras que ficaram:**
- `baixarDocumento` (lib/databook-arquivo) tem um **4º degrau**: id no drive esperado → outro
  drive → caminho → **busca pelo NOME** (`R 261163.pdf`, estável) a partir do 2º nível do caminho
  antigo; achando um só, baixa e grava o endereço novo no `DocumentoQualidade`. Dois homônimos →
  não adivinha, propaga o 404.
- **Pendência de geração é defeito, não rodapé.** Antes de mandar/aceitar, olhar
  `DataBookGeracao.pendencias` da última geração — está lá desde a R01 da OP-106 e ninguém leu.
- Os certificados dos lotes de OUTRA obra usados na OP (Conferência de Rastreabilidade:
  CH12,5→261065, CH19→261019, CH6,4→261066) só entram na §04 pelo "Puxar certificados"
  (`rsDeclarados`); anexar à mão num livro fechado dá 409 — e o 409 é a mensagem certa.
- Vitor (16/09): "pode puxar e resolver para esse, sem a necessidade de termos que mandar para
  assinatura" → vinculei direto no R01 aceito, auditado (`VINCULAR_CERTIFICADO_DATABOOK_SEM_REVISAO`),
  e regerei os volumes. Exceção pedida, não regra: [[torg_databook_revisao]] continua valendo.
