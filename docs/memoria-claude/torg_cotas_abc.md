---
name: torg_cotas_abc
description: Relatório dimensional — cota simples referenciada por letra (A/B/C) com espec+tolerância; a cota desenhada aponta onde medir, não mede
metadata:
  type: project
---

No relatório de inspeção dimensional da Torg, as cotas de inspeção são **poucas e
nomeadas por letra**. Modelo que o Vitor mandou em 21/08/2026 (TORG.xlsx, relatório
RID 001_26_T80 das calhas TMSA):

- o recorte do desenho leva **cota simples** — na planilha dele, só comprimento
  (2995) e altura (1090);
- as cotas de inspeção viram coluna com letra e especificação:
  `( A ) Interno · Espec. 1250mm +/- 3mm`, `( B ) Externo`, `( C ) Interno base`;
- a letra é o que amarra o desenho à linha da tabela.

**A cota desenhada APONTA, não mede.** O valor de projeto vem da especificação
(digitada ou lida do desenho), nunca da posição da linha. Por isso não é preciso
descobrir a escala do PDF — três tentativas de inferir escala falharam (voto de
distâncias é degenerado: 382 escalas "confirmam" as 27 cotas do T89A3), e essa
mecânica torna o problema irrelevante.

⚠ A ESTRUTURA do relatório da Torg NÃO muda por causa da planilha de exemplo. Vitor:
"não quero que mude a estrutura do nosso relatório, apenas entenda sobre as cotas".
A planilha dele é referência do CONCEITO de cota, não do layout.

Ver [[torg_relatorios]] e [[torg_qualidade]].

**Duas armadilhas do vínculo do desenho (24/08/2026):**

- 🚨 **`listarPasta` (lib/databook-pastas.js) devolvia `path` só na PASTA, nunca no ARQUIVO.** O "escolher na pasta da obra" mandava `arq.path` = `undefined` e a rota respondia *"Escolha um PDF."* com a lista de PDFs na tela. Corrigido na origem (o arquivo agora leva `path`). Se for consumir `arquivos` de `listarPasta`, o caminho existe — não remontar `${pasta}/${nome}` à mão.
- 🚨 **`garantirDesenhos` não era chamado por ninguém que a tela alcançasse.** O relatório nasce SEM desenho de propósito (a varredura na pasta da OP é cara e segurava o clique de criar) e deve ser resolvido na 1ª abertura. Mas só `/vetor` e `/pdf` o chamavam, e `/vetor` só é buscado pelo `MarcadorCotas`, que a tela só monta quando JÁ existe desenho — ovo e galinha. Agora quem resolve é o **GET do relatório** (`/api/qualidade/inspecoes/[id]`). Custa ~1,5 s na 1ª abertura, 0 nas seguintes; escolha manual nunca é sobrescrita (a função devolve o que já está gravado sem varrer).
