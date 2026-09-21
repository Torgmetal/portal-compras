# Desenho da inspeção vinha cortado: /Rotate ignorado (18/09/2026)

Matheus, na OP-105 (`T105 - Tolerâcias.pdf`, pasta `2.5.4 Montagem`): *"o desenho que o portal
busca na pasta do SharePoint está vindo só uma parte (…) ainda está cortando mesmo clicando em
AJUSTAR RECORTE"*.

## A causa: duas bibliotecas, dois sistemas de coordenadas

`lib/vista-desenho.js` lê geometria com **PDF.js** e recorta com **pdf-lib**. Medido num PDF
`842x1191` com `/Rotate 90`:

    getViewport({scale:1})  →  folha 1191 x 842   (JÁ rotacionada)
    getOperatorList()       →  traço x 0..802, y 0..1151   (NÃO rotacionada)

Os filtros "está dentro da folha?" comparavam a coordenada CRUA com a dimensão ROTACIONADA: tudo
acima de 844 em y sumia **em silêncio**. `/Rotate` não era tratado em lugar nenhum do módulo.

Isso explica os três sintomas de uma vez:
1. recorte automático escolhia faixa sem sentido (margens calculadas com dimensões trocadas);
2. a folha chegava incompleta;
3. **"ajustar recorte" não salvava** — a tela de recorte manual é alimentada pelo MESMO extrator,
   então ela já mostrava a folha cortada. Não há retângulo que enquadre o que nunca chegou.

## A correção

`lib/geometria-pagina.js`: um espaço só — folha já orientada, origem embaixo à esquerda, Y para
cima — e todos os consumidores leem nele (pontos, segmentos, textos, e `verticais`/`horizontais`
de `campos-desenho.js`).

Três coisas que eu teria errado sem o parecer do Codex:
- A matriz **não é `vp.transform`**: ele entrega Y para baixo e a tela desenha Y para cima. É
  `mul([1,0,0,-1,0,vp.height], vp.transform)` — a inversão entra DEPOIS da rotação, e em 90/270 a
  ordem muda o resultado. O transform cru viraria de cabeça para baixo o que hoje funciona.
- A caixa do recorte converte pelos **quatro cantos** ao voltar ao espaço cru: sob 90° o canto de
  baixo vira o de cima, e dois cantos devolviam caixa invertida.
- Retângulo precisa dos **quatro lados** em `verticais`/`horizontais`: sob 90° o lado vertical cru
  vira horizontal, e a moldura inteira se perdia.

## ⚠⚠ A propriedade que torna isso seguro

Com `/Rotate 0` e caixa na origem, **a matriz é a IDENTIDADE**. Medido A/B, antes × depois, na
mesma folha: `820 x 210`, os mesmos 83 segmentos, **hash de geometria idêntico**. Os arquivos
diferiam em 1 byte — carimbo de data comprimido, não desenho. Está travado em
`testes/lib/vista-desenho-rotacao.teste.js` como teste de caracterização.

⚠ Relatório de folha GIRADA que já tinha cota marcada precisa ser remarcado: a cota foi posta
sobre uma vista errada e não há como reinterpretá-la. Folha 0° não é afetada.

⚠ **Não dá para reproduzir com o desenho real nesta máquina**: `AZURE_*` e `SHAREPOINT_*` são
Secret na Vercel, `vercel env pull` devolve `[SENSITIVE]`, e as rotas `/vetor` e `/pagina` dão 502
no dev local. Por isso os testes usam folha sintética nas quatro orientações.

⚠ Não confundir com o mascaramento branco das tabelas, que é outro mecanismo e nunca roda no
recorte manual — foi a correção de 03/09/2026 para este MESMO sintoma, e tratava outra causa.

Ver [[torg_etiquetas_le_manda]].
