---
name: torg_rh_ponto_he
description: RH ponto — Matheus fez o importador do PDF Secullum (Ponto Offline TORG, casa por CPF); parser lê colunas do CABEÇALHO (Secullum omite faixas zeradas → X fixo quebra); ACJEF só traz marcações
metadata: 
  node_type: memory
  type: project
  originSessionId: d9c0cffd-a288-4e74-b94d-9b9291161750
---

Módulo /rh/ponto (import ACJEF). Diagnóstico do "as horas extras não vêm do arquivo":

- O **ACJEF que o RH sobe** (Secullum, Portaria 1510) carrega **só as marcações diárias** (registro tipo-3, 91 chars = entradas/saídas), **NÃO os totais de HE por faixa**. O `lib/acjef.js` zera os totais de propósito ("codificados de forma ambígua") e o RH preenche na tela.
- O exemplar `~/Downloads/cartão ponto 05.2026` é da VMI (CNPJ 33130698000119) mas é **export parcial** (38 de ~52 funcionários) e **nem inclui os montadores** (Quelson/Adailson/Antonio ausentes). Então não dá pra cruzar HE por ele.
- Os **totais confiáveis estão no PDF do cartão/espelho**: TORG usa "Secullum Ponto Offline", VMI usa "Secullum Ponto Web" — **layouts diferentes**, colunas EX50%/EX60%/EX80%/EX100%/EX150%. Confirmado que `unpdf` extrai (linha de TOTAIS recuperável, mas embaralhada — precisaria parse por posição de coluna).
- `PontoItem` só tem `horasExtras50`/`horasExtras100` e é **export-only** (rotas itens+export; NÃO alimenta cálculo de folha). Cadastro: VMI tem PIS (casa por PIS), TORG sem PIS (casar por nome).

**2026-07-06 Vitor optou por DEIXAR MANUAL** — não construir importador de PDF nem de CSV. **Why:** evitar parser frágil de 2 layouts pra um dado que é só digitação/export. **How to apply:** não reabrir o import automático sem ele pedir.

Gap aberto: a tela só tem colunas 50% e 100%; a VMI usa 60/80/150 também → manual não captura tudo. Ofereci adicionar essas colunas (mudança pequena, sem parser); aguarda decisão. Ver [[torg_rh_documentos]].

**2026-07-08 — atualização (ajudando o Matheus):** o Matheus JÁ construiu o **importador do PDF Secullum** — `lib/ponto-secullum-pdf.js` (parse por coordenada x,y) + `/api/rh/ponto/importar-pdf`, casa por **CPF**. Só lê o layout **"Ponto Offline" da TORG**; a VMI "Ponto Web" não mostra CPF → não casa. `PontoItem` ganhou `horasExtras60/80/150`, `adicionalNoturno`, `origem` (SECULLUM_PDF), `diario` (JSON), `cpfArquivo`. Reimportar substitui os itens SECULLUM_PDF da competência.
- **GOTCHA CRÍTICO (corrigido):** o Secullum **omite as colunas de faixa que estão zeradas** para todos → as posições **x mudam de um relatório/mês pro outro**. Parser de **x fixo quebra**: no cartão 06/2026 (só EX50+EX100) o **BTOTAL (banco de horas) caía no x do EX100** e virava **"HE 100%" falso** pra quem tem banco (Eduarda ganhava 04:11). **FIX:** o parser lê o x de cada faixa do **cabeçalho** de cada página (label→coluna via `chaveHeader`), ignorando colunas de banco (BTOTAL/BSALDO/BCRED/AJUSTE/BDEB/BAJUS). Sempre validar reimportando.
