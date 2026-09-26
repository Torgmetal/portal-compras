---
paths:
  - "lib/etiqueta-*.js"
  - "app/expedicao/etiquetas/**"
  - "app/api/expedicao/etiquetas/**"
  - "lib/itens-expedicao.js"
  - "lib/linha-de-total.js"
  - "lib/parse-equivalencia-marcas.js"
  - "lib/parse-le-form21.js"
  - "lib/lista-avancada-sharepoint.js"
  - "components/FiltroColuna.jsx"
---

## Etiquetas de carregamento (Expedição)

Substitui o **BarTender**. `Expedição › Etiquetas de Carregamento` → escolher a OP,
marcar as peças, gerar. Sai uma etiqueta **por peça** (numerada `001/N`), não por marca.

| | |
|---|---|
| Impressora | **Argox OS-214 plus series PPLA**, USB, 203 dpi |
| Etiqueta | **100 × 50 mm**, BOPP permanente laranja, transferência térmica |
| Engine | `pdf-lib` (o mesmo dos outros 35 PDFs) + `qrcode` |
| Código | `lib/etiqueta-carregamento-pdf.js`, `app/api/expedicao/etiquetas/` |

**Ao imprimir**: escolher a Argox, **Tamanho do papel `Etiqueta 100x50`**, escala **Padrão** (nunca
"ajustar à área de impressão") e margens **nenhuma**. O aviso está na própria tela.

⚠⚠ **A LISTA DE TAMANHOS DO DRIVER ESTÁ EM POLEGADAS, E NENHUM DELES SERVE.** A primeira impressão
real (10/09/2026) saiu deitada e esticada por três etiquetas do rolo. O diálogo estava em **"4 x 6"**
— 4 × 6 **polegadas** (101,6 × 152,4 mm, em pé): a largura casava com o rolo, mas o comprimento era
**3 etiquetas** (152,4 ÷ 50 = 3,05 — exatamente o que saiu). O Chrome ainda girava a página deitada
para caber num papel em pé, e "ajustar à área de impressão" esticava.

Os 100 × 50 mm equivalem a **4 × 2 pol**, e a lista do driver (`2x1, 2x4, 2.25x1.25, 2.50x0.50, 4x1,
4x3, 4x4, 4x5, 4x6`) **não tem esse tamanho**. A saída é criar um **formulário do Windows** — vale
para qualquer impressora e não depende da UI da Argox:

> *Painel de Controle → Dispositivos e Impressoras* → clicar numa impressora → **Propriedades do
> servidor de impressão** → aba **Formulários** → "Criar um novo formulário" → `Etiqueta 100x50`,
> largura 10,00 cm × altura 5,00 cm, margens zero → **Salvar formulário**.

Depois disso, **recarregar a página do PDF**: o diálogo do Chrome só lê a lista de tamanhos ao abrir.

⚠ **Girar o PDF NÃO resolve, e a conta prova.** Cheguei a propor gerar a página em 50 × 100 mm para
usar o "2 x 4" da lista. Errado: `2 x 4` diz à impressora que o rolo tem **50,8 mm de largura**
(metade do real) e que cada etiqueta avança **101,6 mm** (o dobro). Erraria nos dois eixos. O
problema nunca foi a orientação do desenho, foi a **medida da mídia**.

⚠ **Conteúdo deslocado na etiqueta é calibração da impressora, não do PDF.** A moldura vai de 1,2 a
98,8 mm numa página de 100 — está centrada. Se sair encostado num lado: guias do rolo frouxas
(causa mais comum), offset do driver (a 203 dpi, **1 mm = 8 dots**), ou margem do Chrome fora de
"nenhuma". Compensar no PDF deixaria o arquivo errado para qualquer outra impressora.

O PDF declara `PrintScaling /None` e `PickTrayByPDFSize` (`pedirImpressaoSemAjuste`). São do padrão
PDF e evitam que um "ajustar à página" lembrado da última impressão volte sozinho — mas **não
sobrepõem a mídia configurada no driver**. Não são o conserto.

### Os corpos vieram da etiqueta do BarTender, não do espaço livre

⚠⚠ **A REFERÊNCIA É A ETIQUETA ANTIGA, LADO A LADO NA MESMA FOTO.** Matheus (11/09/2026): "a parte
operacional está funcionando, agora precisamos deixar mais próximo da etiqueta da esquerda — ela é
bem mais visível, maior, sem falhas; ajuste tudo para ficar mais próximo possível da qualidade que
tínhamos". A nossa escrevia os dados em 7,5–8 pt onde o BarTender usa o dobro: sobrava célula vazia
em todo canto, e na térmica o que é pequeno sai borrado.

`CORPOS` e `BASES` (`lib/etiqueta-carregamento-pdf.js`) e `RODAPE` (`lib/etiqueta-qws-pdf.js`)
concentram os números. Resumo do que mudou: rótulos 4,2 → **5,5** (QWS 5), cliente/obra 8 → **13**,
QTDE/PESO 7,5 → **12** (QWS 6,5 → 8), TAG 15 → **16**, descrição 8 → **11**, O.P. 7,5 → **10**.

⚠ **O NÚMERO É TETO, NÃO PROMESSA** — `ajustarTexto` encolhe sozinho. É o que deixa ser generoso
aqui sem risco de o nome do cliente invadir a coluna do QR; o inverso (célula vazia) é que era o
defeito.

⚠ **O RÓTULO NÃO ACOMPANHA O VALOR.** "CLIENTE:" é legenda; quem lê no pátio procura o valor. Subir
os dois juntos devolveria a etiqueta cinzenta e sem hierarquia que a nossa era.

⚠⚠ **TRAÇO DE 0,7 pt SAÍA FALHADO — virou 1,1 (`ESPESSURA`).** A 203 dpi, 0,7 pt = 0,25 mm = **2
dots**, e 2 dots é onde a térmica falha: um ponto frio da cabeça e a linha sai picotada. Sobe junto
com as letras, nunca sozinho — moldura grossa em volta de texto miúdo faz o texto parecer menor.

⚠⚠ **AUMENTAR CORPO EM GRADE QUE NÃO MUDA QUEBRA PELO DESCENDENTE, E ISSO NÃO APARECE NO OLHO.** A
vírgula de "41,40" a 12 pt desce 0,9 mm e cruzava a moldura de baixo; a TAG a 16 pt cruzava o traço
de 41,5. Por isso as linhas de base saíram dos literais e viraram `BASES`, calculadas contra o
`heightAtSize` real do Helvetica Bold — e o teste refaz a conta, nomeando qual campo estourou.

⚠ **O ENDEREÇO VAI EM NEGRITO, e isso pesa mais que o corpo.** Era o único texto fino da etiqueta:
a haste de uma Helvetica normal a 5 pt não fecha na transferência térmica, e sai a letra esburacada
da foto. O negrito é ~5% mais largo, então o corpo calculado cai um pouco — e ainda assim imprime
melhor, porque o que borra é a espessura da haste, não a altura.

⚠ **No padrão o logo caiu de 37 para 34 mm**, e só por isso o endereço pôde crescer: é ele que
define o limite (`xMin`). No QWS quem limita é o teto de hierarquia, não o espaço.

⚠ **A impressora só imprime PRETO** — o laranja é o material do rolo. Por isso o logo da
etiqueta é o `public/torg-logo-etiqueta.png` (chapado e horizontal), e não o `torg-logo.png`
do portal, que é vertical e tem gradiente azul. Ele foi gerado a partir do
`public/torg-logo.svg` recortado em duas partes e recolorido.

⚠⚠ **QUEM DEFINE A LISTA É A LISTA DE EXPEDIÇÃO — não `PecaConjunto`.** Matheus (08/09/2026):
"não pode aparecer as posições, somente os produtos finais igual sai na Lista de Expedição" e
depois "acredito que só deve considerar a L.E e não incluir LPC junto para não duplicar". Toda a
regra mora em `lib/itens-expedicao.js` (`itensExpediveisDaOP`), usada tanto pelas etiquetas quanto
pela Conferência de Peça. Em duas etapas:

1. **A Lista de Expedição (`ListaExpedicao`, a planilha importada) diz QUAIS marcas existem e
   QUANTAS peças cada uma tem.** Ela é o documento — manda na quantidade e na descrição.
2. **`PecaConjunto` só COMPLETA** o que a L.E. não trouxer (peso, id) para as marcas carimbadas
   `naLE`, e cobre obras cuja planilha nunca foi importada. **Uma linha de LPC nunca entra na lista
   por si** — é ela que trazia as posições de fábrica e, antes desta regra, a duplicação.

Motivo do redesenho: `PecaConjunto` guarda a obra INTEIRA — o conjunto que sobe no caminhão e as
posições que o compõem — vinda de importadores diferentes sob **chaves de `opNumero` diferentes**
para a mesma OP (a OP-89 tem `"89"`, `"089"`, `"T89A"`, `"T89C"`, por causa do
`@@unique([opNumero, marca])`). Usá-la como ponto de partida gerava, ao mesmo tempo: posições na
lista (croquis como `T97A-P30`), a mesma marca até três vezes (809 linhas para 284 marcas na
OP-89), o PERFIL no lugar do nome da peça (`L1.1/2''X1/8''` em vez de `CONTRAVENTAMENTO`), e 484
marcas da OP-67 **invisíveis em toda tela** por não terem nenhuma linha em `PecaConjunto`.

Conferido linha a linha contra a planilha: OP-97, 60, 67, 85 e 121 batem **exatamente** (marcas e
peças); a OP-89 soma as poucas marcas que só existem no cadastro (planilha 8705 + 204 = 8909).

⚠ **`"TOTAL.:"` era uma marca no banco**, em 4 obras (060, 067, 085, 089) — o importador da L.E.
engoliu o rodapé da planilha; a da OP-89 tinha `qte` 8705. **RESOLVIDO (17/09/2026)**: medido, o
banco está limpo — 0 linhas de rodapé em 22.517 de `PecaConjunto` e nas 60 listas de
`ListaExpedicao`. A regra agora é UMA só, em **`lib/linha-de-total.js`** (`ehLinhaDeTotal`), usada
pelo parser, pelo importador e pela leitura da expedição.

⚠⚠ **ELA ESTAVA EM TRÊS LUGARES COM TRÊS ABRANGÊNCIAS DIFERENTES, e a mais estreita era a que
importa.** O parser (`parse-le-form21.js`) pulava só o que começa com "total"; o importador e a
leitura cobriam `TOTAL|SUBTOTAL|SOMA`. Só que **quem importa pelo SharePoint
(`lib/lista-avancada-sharepoint.js`) grava `parsed.marcas` direto, sem passar pelo importador** — uma
planilha com "SUBTOTAL" entrava por ali e inflava marcas, itens e peso contratado, exatamente como o
"TOTAL.:" fazia antes. Defesa em profundidade só vale quando as camadas concordam.

⚠ **O histórico de impressão é gravado pela MARCA (`entity: "EtiquetaCarregamento"`,
`entityId: "<opNumero>|<MARCA>"`), não pelo id de `PecaConjunto`.** O id não sobrevive à
reimportação da lista — mesma lição já gravada no schema em `LiberacaoProducao.pecaMarcas` — e
agora existe item legítimo sem NENHUMA linha no cadastro. Registros antigos (`entity:
"PecaConjunto"`) continuam lidos junto, senão a coluna diria "nunca impressa" para etiqueta que
já saiu.

⚠ **A contagem sai sem zero à esquerda** ("3/3", "300/300"). O "001/1" da etiqueta antiga era
limitação do BarTender, que importava a planilha com o campo de largura fixa — aqui o número vem
do banco a cada etiqueta e a largura se ajusta sozinha.

### O endereço da Torg — corpo calculado, não fixo

⚠⚠ **3,5 pt BORRAVA NA IMPRESSORA.** Matheus (11/09/2026): *"deixe maior também o endereço da Torg e
telefone, está saindo todo borrado por conta do tamanho"*. A 203 dpi, 3,5 pt tem **~10 pontos** de
altura — na transferência térmica isso vira mancha, não letra. É o menor texto da etiqueta e o
primeiro a sofrer.

`desenharEndereco` (`lib/etiqueta-pdf-base.js`) calcula o **maior corpo que ainda cabe** entre o fim
do logo e a borda da célula, e escreve em **negrito**: padrão vai a ~5 pt, QWS a **5,5 pt** (eram
3,5 e 3,3, em fonte normal).

⚠ **Calculado, não fixo**, porque a folga difere por modelo (32 mm no padrão, 60 no QWS) — e porque
número fixo cresceria por cima do logo sem ninguém notar. O logo tem largura **medida** contra a
etiqueta em uso (37 mm) e é ele que define o limite.

⚠ **O teto de 5,5 pt é hierarquia, não espaço.** No QWS caberiam 9 pt: o endereço ficaria do tamanho
da TAG PETROBRAS, que é o que o cliente lê de longe. Endereço é apoio e tem que parecer.

### Uma etiqueta para a caixa (coluna "Imprimir")

Cada marca tem na lista uma coluna **Imprimir** com quantas etiquetas ela vai render. Clicando,
troca para **1 · caixa**: sai UMA etiqueta, dizendo `50/50`. Matheus (11/09/2026): *"uma marca tem
50 peças mas são todas pequenas, aí montamos uma caixa com as 50 peças e colamos somente 1 etiqueta
50/50; se não tiver essa opção o portal vai imprimir as 50 etiquetas"*. Na OP-103 há uma marca com
**210 chapas de 0,23 kg** — 210 adesivos que ninguém colaria.

⚠⚠ **A TELA MANDA UM SIM/NÃO POR MARCA, NUNCA UM NÚMERO** — e é isso que mantém a regra de cima
("a quantidade vem do banco, não do navegador") de pé. Um campo livre deixaria a etiqueta dizer
"3/5" numa marca de 2 peças. `emCaixa` troca a REGRA de contagem; o N continua vindo da L.E.

⚠ **A etiqueta da caixa diz `N/N`, não `1/N`.** Dissesse "1/50", quem confere o carregamento
procuraria outras 49 caixas que não existem.

⚠ **Zera ao trocar de obra**, como a TAG. E marca de 1 peça não mostra o botão: caixa de uma peça é
a mesma etiqueta, e um controle que não muda nada só faz duvidar se mudou.

⚠ **A coluna se chama "Imprimir", não "Etiquetas"** — a última coluna já é "Etiqueta" (o histórico
de impressão). Duas colunas quase homônimas lado a lado fazem conferir a errada; chegaram a fazer
um teste apontar para a coluna errada.

### Baixar o PDF gerado

⚠⚠ **URL DE BLOB NÃO CARREGA NOME DE ARQUIVO, E É REVOGÁVEL.** O download quebrava por dois motivos
somados (11/09/2026): o blob era revogado em 60 s — e quem abre o PDF, confere as marcas e só então
clica em baixar passa fácil disso, recebendo *"verifique a conexão com a Internet"* num arquivo com
nome de UUID (não era rede: era o link revogado) — e o `Content-Disposition` que a rota manda é
ignorado por URL de blob. Agora o blob vive enquanto a tela estiver aberta (revogado ao sair: blob
de 400 etiquetas pendurado numa tela que fica aberta o dia todo é vazamento com hora marcada) e o
botão **Baixar PDF** é um `<a download="etiquetas-OP-103.pdf">`.

### Calibragem da impressora

Um painel recolhido na tela move a impressão inteira em mm. ⚠⚠ **É conserto de máquina, não design**:
o PDF desenha de 1,2 a 98,8 mm numa página de 100 — está centrado. Se sai cortado, a origem da Argox
está deslocada e o lugar certo é o driver; isto existe porque o driver dela nem sempre expõe o
ajuste. Guardado GLOBAL (`EtiquetaCalibragem`, chave `argox`) porque é propriedade da IMPRESSORA.

⚠⚠ **Deslocar sozinho não serve.** A página tem 100 mm e o desenho já usa 1,2–98,8: empurrar 5 mm
para a direita jogaria a coluna do QR para fora — trocaria o corte da esquerda pelo da direita. O
desenho também **encolhe** o bastante para caber (5 mm = 5%), e a tela avisa quanto.

⚠ Dois erros de geometria que só apareceram renderizando um quadro de referência, e viraram teste:
`scaleContent` ancora no canto de **baixo** (descer ingenuamente empurra o rodapé para fora), e ir
para a **esquerda não é `tx` negativo** (isso joga o desenho para fora do papel — ele encosta na
borda e encolhe).

### TAG da obra (modelo padrão)

Um campo **TAG da obra** na tela, só no modelo `padrao`, sai impresso **em todas** as etiquetas
daquele lote, na frente do nome da obra: `OBRA: TPR00870 | Torocua - Ñacunday`. Matheus
(11/09/2026): *"na OP 103 preciso colocar a tag TPR00870 na frente de todas as etiquetas"*.

⚠ **É código do CLIENTE para aquele embarque, não do cadastro.** Não existe campo de TAG na OP e
não deve existir: obrigaria a engenharia a preenchê-lo em toda obra que não usa. Ela é digitada na
impressão e gravada no `AuditLog` junto com o resto do carimbo.

⚠⚠ **VEM PREENCHIDA COM A DA ÚLTIMA IMPRESSÃO DAQUELA OBRA** (`ultimaTagDaObra`, lida do próprio
`AuditLog` — sem tabela nova). A obra sai em lotes ao longo de dias; digitada do zero a cada lote,
uma hora um lote sai sem a TAG e vai para o caminhão misturado com os certos, e ninguém confere 442
adesivos um a um. É **sugestão, não trava**: dá para apagar ou trocar.

⚠ **Zera ao trocar de obra** — ao contrário do modelo, que é mantido. A TAG é daquele embarque;
carregada para a obra seguinte sairia em centenas de adesivos de uma carga que não é dela.

⚠ **Separador ` | `, não hífen** — mesma lição da TAG/DESCRIÇÃO do QWS: hífen funde dois códigos de
origens diferentes num terceiro que não existe.

⚠ **CLIENTE e OBRA passaram a ser `encaixar` em vez de `p.campo`.** O valor era escrito CRU: obra
comprida já corria por cima da coluna do QR e ninguém tinha notado, porque as obras testadas eram
curtas. Com a TAG na frente isso deixa de ser sorte. Corte com reticência é visível; texto
invadindo a célula vizinha é silencioso.

### Modelo de etiqueta por cliente (QWS/Petrobras)

Um seletor **Modelo da etiqueta** na tela escolhe entre `padrao` e `qws` (`MODELOS` em
`lib/etiqueta-carregamento-pdf.js`, que só despacha; cada desenho mora no seu arquivo —
`etiqueta-qws-pdf.js`, com o que é comum aos dois em `etiqueta-pdf-base.js`).

⚠ **O modelo é por IMPRESSÃO, não por cliente cadastrado.** Amarrar o desenho ao nome do cliente
pareceria mais esperto, mas a mesma obra pode precisar dos dois e um cliente novo com a mesma
exigência viraria um `if` aqui.

⚠⚠ **O modelo QWS identifica a peça pela TAG PETROBRAS**, não pela marca da Torg — é por esse
código que o recebimento do cliente confere. TAG, referência de desenho e posição ("SE-001") **não
existem no cadastro**: vêm da planilha "Lista Equivalência de Marcas" do cliente, importada na
própria tela (`lib/parse-equivalencia-marcas.js` → tabela `EtiquetaCampoExtra`). Quantidade e peso
continuam vindo da L.E., pra etiqueta nunca discordar da tela. Peça sem esses campos imprime "—":
a etiqueta sai e o buraco aparece na hora de colar, não depois que o caminhão saiu.

⚠ **O QR continua codificando a MARCA da Torg** nos dois modelos. Quem lê o código no pátio é a
Torg (conferência, carregamento) e a leitura tem que cair na mesma chave que o portal usa.

⚠⚠ **MARCA REPETIDA NA PLANILHA DO CLIENTE É UNIDADE, NÃO LINHA DUPLICADA.** Matheus (10/09/2026):
"a T102A15 são 3 unidades aí repetiu 3 linhas dela apenas porque cada unidade tem uma referência e
tag da QWS". Por isso `EtiquetaCampoExtra` é única por **(opNumero, marca, unidade)** e a etiqueta
`2/3` leva a TAG da segunda linha (`unidadeDaEtiqueta`) — guardar por marca fazia as 3 saírem com a
TAG da primeira.

⚠ **A L.E. (FORM 21) NÃO repete marca** — lá a T102A15 é UMA linha com `QTD. 3`. Quem repete é só a
lista de equivalência do cliente, que precisa de uma linha por TAG. Cheguei a somar marcas repetidas
no import da L.E. achando que ela também repetia; conferido no arquivo real (T102-LE-R01), não
repete, e a mudança foi desfeita. As duas planilhas são complementares: a L.E. manda em marca,
quantidade e peso; a de equivalência, só em TAG/referência/posição.

⚠ **A marca e a posição saem separadas por `  /  `**, não coladas por hífen. Matheus (10/09/2026):
"ficou T102A1-SE-001, parece um negócio só". São códigos de sistemas diferentes — o hífen os funde
num terceiro código, que não existe em lugar nenhum.

⚠⚠ **MEXEU NO `schema.prisma`? REINICIE O `npm run dev`.** O client do Prisma é gerado em disco por
`npx prisma generate`, mas o Next segura o módulo já carregado: o servidor que subiu antes continua
com o client velho e devolve `Unknown argument` numa chave que existe no banco e no client novo
(10/09/2026 — custou dois erros que pareciam bug de código: um 500 na geração das etiquetas e uma
falha no upsert de `EtiquetaCampoExtra`).

⚠ **Etiqueta além das unidades importadas cai na primeira**, não em branco — acontece quando a L.E.
do portal está numa revisão e a lista do cliente em outra.

O cabeçalho da lista tem os **funis tipo Excel** do `components/FiltroColuna` (Marca, Descrição e
Etiqueta). Peças e Peso ficam sem funil de propósito — número contínuo vira menu de 200 valores.

**Quais já foram impressas** aparece numa coluna da própria lista, com data e "×N" na reimpressão.
O histórico mora no `AuditLog` (`action: "IMPRIMIR_ETIQUETA_CARREGAMENTO"`, ver acima), não numa
coluna de `PecaConjunto`: é a pergunta que a tabela de auditoria já existe para responder,
o registro é obrigatório de qualquer jeito, e assim ficam TODAS as impressões, não só a última.
O carimbo é gravado **depois** de o PDF existir — e uma falha ao gravar não segura o PDF.

⚠ **Não existe importação de planilha, de propósito.** Marca, descrição, quantidade e peso
vivem em `PecaConjunto`; a planilha só existia porque o BarTender não enxerga o banco.
Tirar esse pulo tira junto a chance de imprimir com dado velho.

> **Se a qualidade de impressão decepcionar**, o caminho de upgrade é gerar **PPLA cru** em vez
> de PDF — o layout e os dados se aproveitam, troca só o renderizador. Isso exige um agente
> local no PC da expedição para mandar os bytes à USB, que é a razão de não ter começado por aí.
