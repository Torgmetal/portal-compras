---
paths:
  - "lib/vista-desenho.js"
  - "lib/geometria-pagina.js"
  - "lib/campos-desenho.js"
---

## O desenho da inspeção vinha cortado — PDF.js e pdf-lib não falam a mesma língua

`Qualidade › Inspeções` monta a vista do desenho a partir do PDF que está no SharePoint
(`lib/vista-desenho.js`). Matheus (18/09/2026), na OP-105: *"o desenho que o portal busca na pasta
do SharePoint está vindo só uma parte (…) ainda está cortando mesmo clicando em AJUSTAR RECORTE"*.

⚠⚠ **O `/Rotate` DA PÁGINA NÃO ERA TRATADO EM LUGAR NENHUM**, e o módulo mistura duas bibliotecas
que discordam sobre isso. Medido num PDF `842x1191` com `/Rotate 90`:

```
getViewport({scale:1}) diz que a folha é  1191 x 842   (JÁ rotacionada)
getOperatorList()      devolve traço em   x 0..802, y 0..1151   (NÃO rotacionada)
```

Os filtros "está dentro da folha?" comparavam a coordenada CRUA com a dimensão ROTACIONADA: tudo
que passasse de 844 em y era **descartado em silêncio**. Daí os três sintomas de uma vez — o
recorte automático escolhia uma faixa sem sentido (as margens saíam de dimensões trocadas), a
folha chegava incompleta, e **"ajustar recorte" não salvava**, porque a tela de recorte manual é
alimentada pelo mesmo extrator: não há retângulo que enquadre o que nunca chegou.

⚠ Vale também para `/Rotate 270` e para folha com **CropBox deslocada** — o viewport normaliza a
origem, a operator list não.

**A correção** mora em `lib/geometria-pagina.js`: um espaço só, **folha já orientada, origem no
canto inferior esquerdo, Y para cima**, e todo mundo passa a ler nele (pontos, segmentos, textos e
os detectores de linha de `campos-desenho.js`).

⚠⚠ **A MATRIZ NÃO É `vp.transform` SOZINHO** — ele entrega Y para BAIXO (sistema do canvas) e esta
tela desenha com Y para CIMA. É `mul([1,0,0,-1,0,vp.height], vp.transform)`: a inversão vertical
entra **depois** da rotação, e em 90/270 a ordem muda o resultado. Usar o transform cru viraria de
cabeça para baixo todo desenho que hoje sai certo (achado do Codex).

⚠⚠ **COM `/Rotate 0` E CAIXA NA ORIGEM A MATRIZ É A IDENTIDADE.** É essa propriedade que torna a
correção segura: a esmagadora maioria das folhas é 0°, e elas seguem saindo exatamente como saíam.

⚠⚠ **A CAIXA DO RECORTE CONVERTE PELOS QUATRO CANTOS** ao voltar para o espaço cru do `embedPage`
(achado do Codex): sob 90° o canto inferior-esquerdo vira o superior-esquerdo, e converter só
`(left,bottom)` e `(right,top)` devolvia caixa invertida — recorte vazio ou no lugar errado.

⚠ **A página de saída sai com `/Rotate 0`** e com as dimensões do espaço orientado, com a rotação
assada no desenho (matriz `D`, dentro de save/restore). A tela carimba as cotas sobre
`largura`/`altura` que a MESMA função devolve, e o PDF final usa as mesmas coordenadas; deixar a
rotação na página manteria o conteúdo cru e a divergência de pé. ⚠ Por isso `vetoresDaVista` NÃO
aplica matriz nenhuma: ela lê a vista já recortada, e aplicar de novo giraria duas vezes.

⚠⚠ **RETÂNGULO PRECISA DOS QUATRO LADOS** em `verticais`/`horizontais` (achado do Codex): sob 90°
o lado vertical do retângulo cru vira horizontal na folha orientada, e filtrar pelos lados crus
perdia a moldura inteira — justamente o que `regioes` usa para achar carimbo e lista.

⚠⚠ **`closePath` NÃO ERA TRATADO, E ISSO VALIA EM FOLHA `0°` TAMBÉM** (achado 18/09/2026, ao
escrever o teste do retângulo). O pdf-lib e vários CADs escrevem um retângulo como
`moveTo lineTo lineTo lineTo closePath`, **sem** usar o operador `rectangle`. Sem tratar `closePath`:
1. o lado de FECHAMENTO sumia — medido, 3 retângulos davam **9 segmentos em vez de 12**;
2. o `else ai += 2` consumia dois argumentos que `closePath` não tem, **dessincronizando as
   coordenadas de tudo que viesse depois no mesmo traçado** (`m l l h m l l h` → lixo do segundo
   subcaminho em diante), e o filtro "está dentro da folha?" descartava esse lixo em silêncio.

É outro caminho para "o desenho vem incompleto", independente de rotação. Corrigido nos quatro
percorredores de path (`pontosDaPagina`, `segsDoConteudo`, `verticais`, `horizontais`).

⚠⚠ **A `/Matrix` PRÓPRIA DO FORM XOBJECT NÃO VEM COMO `transform`.** O pdf.js emite a COLOCAÇÃO do
form como `transform` (que todo percorredor já tratava) e a matriz INTERNA à parte. Só
`segsDoConteudo` tratava a segunda: o vetor na tela via a peça no lugar certo enquanto o recorte
automático e a detecção de moldura/carimbo a procuravam em coordenadas cruas — as duas metades do
módulo discordando sobre onde está a peça. Medido com `/Matrix [2 0 0 2 50 30]`: vertical em x=10
no lugar de x=70 (achado do Codex, 18/09/2026).

⚠⚠ **RECORTE GRAVADO ANTES DE 18/09/2026 NÃO É REAPLICADO ÀS CEGAS.** Ele foi escolhido sob outro
contrato de coordenadas, sobre uma folha que podia estar truncada. O recorte salvo leva
`espaco: ESPACO_ATUAL`; sem carimbo, ele só vale onde a matriz da página é a IDENTIDADE (os dois
contratos coincidem). Em folha girada é **ignorado**, a vista volta ao automático e a tela diz por
quê — sumir calado faria parecer que o portal perdeu o recorte (achado do Codex).

⚠ **A decisão é POR DESENHO, na hora de ler — não por migração.** Não há como saber quais folhas
são giradas sem abrir cada PDF, e as credenciais do SharePoint não saem da Vercel.

⚠⚠ **RELATÓRIO DE FOLHA GIRADA QUE JÁ TINHA COTA MARCADA PRECISA SER REMARCADO.** A cota foi
marcada sobre uma vista que estava errada; não há como reinterpretá-la. ⚠ E o corte NÃO é
"`/Rotate 0` está a salvo": é **matriz identidade** — `/Rotate 0` com **CropBox deslocada** também
é afetado, e **180° preserva as dimensões** (podia ter recorte e cota válidos antes). Foi por isso
que a tela passou a avisar em vez de eu confiar numa linha de documentação.

⚠ **Não confundir com o mascaramento branco**, que é outro mecanismo: as tabelas que caem dentro do
recorte são cobertas de branco, e isso **nunca** roda no recorte manual (Vitor, 03/09/2026 — ele
relatou este mesmo sintoma de "cortado" e a correção da época foi essa, que tratava outra causa).
