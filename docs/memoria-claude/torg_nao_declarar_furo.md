---
name: torg_nao_declarar_furo
description: "Documento que cliente/auditor lê nunca narra furo nosso — célula vazia, não frase"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 1754de4f-06da-423d-8c20-70c99cbd5bad
  modified: 2026-08-23T02:15:58.720Z
---

Em qualquer documento que sai da Torg para cliente ou auditor (data book, carimbo de desenho, portal do cliente, registro de qualidade), **não se escreve o motivo de uma falta nossa**. Falta dado → "—". Nunca uma frase.

Vitor (22/08/2026), duas vezes no mesmo dia:
- "não podemos em hipótese alguma mencionar que o fornecedor não entrega certificado"
- sobre o data book da OP-067: "lá tinha vários materiais que estava escrito material cortado sem recebimento, coisa do tipo, onde é melhor não informar nada do que informar isso"

**Why:** frases como "cortada antes da entrega (estoque)", "sem material no CMR", "fornecedor não fornece certificado" não são observação técnica — são a Torg declarando, por escrito, num documento que prova conformidade, que aceitou material sem rastreio. Vira não conformidade auto-declarada e prova contra a empresa. Célula vazia é dado que falta; frase é confissão.

**How to apply:** o motivo continua existindo — só muda de lugar: telas internas (data book, [[torg_qualidade]], conferência de rastreabilidade). No documento externo, ou o dado, ou "—". Quando o texto for inevitável (ex.: carimbo que o chão de fábrica precisa), escrever como INSTRUÇÃO e não como declaração: "R A ANOTAR" no lugar de "SEM MATERIAL lançado no CMR". Vocabulário de registro deve ser lista fechada e validada no servidor, inclusive barrando a frase proibida em campo livre — de nada adianta travar o select e deixar a observação aberta. Caso que exija formalizar mesmo: RNC, não campo de observação.

Ver também [[torg_rastreio_corrida]], [[torg_databook_revisao]].
