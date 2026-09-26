---
paths:
  - "app/engenharia/listas/**"
  - "app/api/engenharia/listas/**"
  - "app/api/producao/pecas/importar-le/**"
---

## Import de lista (LE/LPC) — o recibo tem que ser recibo

`Engenharia › Listas` importa a planilha, grava as peças e **arquiva o arquivo no SharePoint** com
uma aba `Revisao` embutida (`app/engenharia/listas/revisao-lista.js`).

⚠⚠ **ESSA ABA JÁ MENTIU, E O PAPEL CIRCULOU COMO VERDADE.** A LE R01 da OP-102, importada em
**13/08/2026**, foi arquivada dizendo "18 incluídas" — e **nenhuma das 18 entrou no banco**. O
`diff` da rota é calculado **ANTES** da gravação: ele responde "quais marcas do arquivo ainda não
existem", que é uma **previsão**, não um recibo. Quem abriu o arquivo depois leu 18 incluídas e
seguiu a vida; a divergência só apareceu **quatro semanas depois**, quando a tela de etiquetas
mostrou 71 marcas numa lista de 77 e Matheus perguntou por quê (10/09/2026).

O defeito que engoliu as 18 era do importador e já estava corrigido (`67fea4eb48`, 27/08 — a busca
da marca existente não filtrava por fonte, então a linha que a LPC já tinha virava UPDATE e a da LE
nunca nascia). O que deixou passar quatro semanas foi **não existir onde ver a diferença entre o
previsto e o gravado**. Agora:

- A aba tem duas linhas com nomes diferentes — **Previsto (antes de gravar)** e **Gravado (o que
  foi ao banco)**, esta última vinda de `criados`/`atualizados`/`ignorados`, que são o que a rota de
  fato escreveu — e uma linha `⚠ ATENÇÃO` que **só existe quando os dois discordam**.
- A coluna por marca se chama **"Situação (previsão)"**, não "Situação".
- A tela mostra o mesmo aviso em tarja âmbar logo abaixo do "Importado", antes de alguém tratar a
  lista como vigente.

⚠⚠ **O ESPERADO DEPENDE DO MODO, E ERRAR ISSO É PIOR QUE NÃO AVISAR.** Com **sobrescrever** a rota
apaga a lista anterior e recria tudo, então o certo é `criados == totalNoArquivo`. Comparar isso com
a previsão (calculada contra as linhas que a própria rota ia apagar em seguida) acusaria "gravou
mais do que o esperado" num import perfeito — e alarme falso em ferramenta de alarme ensina a
ignorar a tarja. A aba diz em qual **Modo** rodou, e o cálculo do aviso muda junto.

⚠ **Remoção não entra na comparação.** Sem marcar "sobrescrever" o import **não apaga** — a lista de
removidas é aviso de que aquelas marcas saíram do arquivo, não promessa de exclusão. Cobrar isso
marcaria o comportamento normal como defeito.

⚠ **"Importado" nunca quis dizer "entrou".** Salvar o arquivo no servidor
(`/api/engenharia/listas/servidor`) e gravar as peças (`/api/producao/pecas/importar-le`) são duas
chamadas separadas: o arquivo pode estar na pasta da obra sem que uma linha tenha chegado ao banco.
