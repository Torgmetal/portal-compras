---
name: torg_databook_pdf_arquivo_unico
description: "Baixar PDF" do data book — anexos descem 8 por vez (lib/fila-downloads); orçamento 150 s/120 MB vira aviso de volumes; PDF em partes (teto de 4,5 MB da resposta); Vercel roda nos EUA, banco e SharePoint no Brasil
metadata:
  type: project
---

Geraldo (30/09/2026, chamado #3 da EV): o PDF do data book da OP-112 não abria —
`504 FUNCTION_INVOCATION_TIMEOUT`. Vitor aprovou a correção em 01/10 (`a2253a97`).

- ⚠⚠ **O TEMPO ERA REDE, NÃO PDF.** Medido no Mac com a OP-112 (264 anexos, 366 páginas, 86 MB):
  download em sequência 55 s · com 6 no ar 12 s · com 10 no ar 9 s · abrir e copiar as páginas 0,8 s ·
  `save` 0,4 s · o livro sem anexos 1,6 s. Otimizar o pdf-lib não teria ganhado nada.
- ⚠⚠ **A VERCEL RODA NOS EUA** (iad1 — o `vercel.json` não tem `regions`), e o banco (Neon `sa-east-1`)
  e o SharePoint estão no Brasil. Toda consulta e todo download atravessam o continente: o que leva 72 s
  no Mac estourava 120 s lá. Daqui, uma ida e volta ao banco leva 16 ms.
- **A correção:** `lib/fila-downloads.js` — `filaDeDownloads` (janela 8, entrega NA ORDEM do livro) e
  `comNovaTentativa` (429/5xx/queda de rede, sem dormir além do prazo). `gerarDataBookPDF` começa a
  baixar enquanto ainda desenha o sumário. Conferido com o livro real: 406 páginas e o mesmo tamanho no
  código antigo e no novo, 0 pendência, de 59,6 s para 16,8 s no Mac.
- ⚠ **A fila e o laço usam a MESMA lista** (`anexaveisDaSecao`). Se divergirem, a fila deixa de
  antecipar e cada anexo é baixado na hora — fica lento, mas nunca entra o arquivo de outro anexo.
- ⚠⚠ **RESPOSTA DE FUNÇÃO TEM TETO DE 4,5 MB; só streaming escapa** (docs "Vercel Functions Limits").
  A rota manda o PDF em partes de 1 MB (`emPartes`). Não deu para confirmar na produção se o teto já
  mordia antes: os logs da Vercel dão 403 pelo MCP.
- **O `orcamento` só vale na rota interna** (150 s / 120 MB → 409 "Gerar volumes"; página HTML na aba
  aberta pelo botão, JSON para código). Aceite e assinatura do cliente seguem sem orçamento: PDF pela
  metade com pendência escrita seria declarar furo num documento do cliente ([[torg_nao_declarar_furo]]).
- `maxDuration` da rota foi de 120 para **300** (padrão da plataforma com fluid compute).
- **Ainda não feito:** os VOLUMES (`lib/databook-volumes`, fase A) baixam um por vez. A mesma fila
  serviria.
- Em risco antes da correção, por nº de anexos: OP-113 (244), 103 (198), 085 (193), 089 (187).

Ver [[torg_databook_revisao]], [[torg_databook_certificado_movido]], [[torg_upload_4mb]].
