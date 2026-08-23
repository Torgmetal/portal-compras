// Logo da Torg para o cabeçalho das planilhas, embutido em base64.
//
// ⚠ POR QUE EMBUTIDO E NÃO LIDO DE public/. O gerador de planilha nasceu client-side e pega o
// logo com fetch("/torg-logo-excel.png"). Quando a planilha passou a ser gerada NA ROTA (a LPC
// e a LE do portal do cliente, onde o corte do peso tem que acontecer no servidor), esse fetch
// deixou de existir. Ler de `public/` com fs também não serve: em serverless o arquivo estático
// é servido pela CDN e pode simplesmente não estar no sistema de arquivos da função — a falha
// seria silenciosa, e a planilha sairia sem cabeçalho, que é justamente o que a ISO 9001 nos
// obriga a ter. Embutido, funciona em qualquer runtime, sempre.
//
// Fonte: public/torg-logo-excel.png. Trocou o logo? Rode de novo o base64 deste arquivo.
export const LOGO_EXCEL_B64 =
  "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" +
  "RK5CYII=";
