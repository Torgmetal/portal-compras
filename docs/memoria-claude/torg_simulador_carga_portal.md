---
name: torg_simulador_carga_portal
description: Simulador de carga dentro do portal — botão "Simular carga" no romaneio prévio (Planejamento), motor em lib/carga, IFC medido no navegador, resultado em CargaSimulada
metadata:
  type: project
---

O simulador de carga (protótipo local de set/2026, `torg_carga_regras`) entrou no portal em 13/09/2026, na
forma que o Vitor escolheu: **a lista é o romaneio prévio** ("pode ser o romaneio prévio gerado pelo
planejamento"). O motor não sabe a lógica de prioridade de cada obra (nível, fase ou peça): recebe a lista e
monta a carga daquela lista.

- **Onde:** Planejamento › Romaneios prévios (e a aba Expedição da OP) → card do romaneio → **Simular carga**
  (`components/carga/SimularCargaModal.jsx`). Escolhe a embalagem (padrão vem da LQC da obra), roda e grava.
- **Motor:** `lib/carga/` — `premissas` (veículos, embalagens, perfis), `geometria` (caixa orientada + regra
  "perfil com a alma em pé, chapa deita"), `classificar`, `unidades` (pacotes/caixas/feixes/peças), `empacotar`
  (mapa de altura), `arranjo` (7 ordens × chão/empilhar × reserva do topo, menor veículo), `simular` (entrada:
  lista + geometria; saída: cargas com volumes, passos, romaneio, madeira). Roda num **Web Worker**
  (`components/carga/simular.worker.js`) — ⚠ tem de ser `new Worker(new URL(…, import.meta.url))` literal, senão
  o webpack não empacota (`window.Worker` quebrou o build).
- **Geometria:** `lib/carga/geometria-ifc.js` lê o IFC da obra no navegador (web-ifc, `SetWasmPath("/wasm/", true)`),
  uma instância por marca (Tag do IfcElementAssembly via IfcRelAggregates), malha + caixa orientada. O IFC vem de
  `/api/producao/modelo-3d` (SharePoint), o mais novo que não passe de 60 MB. Marca sem geometria fica listada e fora.
- **3D:** `components/carga/VisualizadorCarga.jsx` (three.js, `caminhao-3d.js`, `cena-carga.js`), passo a passo,
  vistas, rótulos; `ref.capturar(vista, camada)` devolve JPEG para o PDF do modelo (próxima entrega).
- **Gravação:** `CargaSimulada` (scripts/ensure-carga-simulada.mjs, no build) por romaneio, com `itensHash`:
  romaneio mudou → "desatualizada". Rota `…/romaneios-previos/[previoId]/simulacao` (GET lista+última; POST grava).
- **Diferença do protótipo:** sem sequência por nível nem grade separada (numa lista única, grade vai em cima
  como delicado; lista SÓ de grade sai em camadas). Novas ordens `delicadoMeio`/`pesoPuro` + tentativa com
  reserva do topo foram o que fez a carga 3 da OP-118 caber numa carreta como lista solta.
- **PDF do modelo** (`lib/carga/modelo-carga-pdf.js`, rota `…/simulacao/modelo-pdf`): pdf-lib A4 paisagem padrão Torg;
  as fotos do 3D vêm do navegador (`VisualizadorCarga.capturar` em 1200×560 JPEG, pixelRatio 1 — corpo ≤ ~3 MB).
  Páginas: carga pronta, separar por fase (3 colunas que fluem), formar volumes (cartões), uma folha por camada.
  ⚠ pdftoppm/poppler desta máquina não desenha as fontes base-14 (sai em branco): renderizar com PyMuPDF
  (`/tmp/pdfenv`) ou Quick Look para conferir.
- **Veículos configuráveis:** `ConfigCarga` (id "padrao"), tela Planejamento › Configuração da expedição
  (`ConfigCargaSection`), rota `/api/planejamento/expedicao/config-carga`; `catalogoDeVeiculos(cfg)` mescla com o
  padrão e entra em `opcoes.veiculos/frete` da simulação. Carreta e carreta 14 m nunca saem do catálogo.
- **Ajustes por marca** (14/09/2026, `lib/carga/ajustes.js`, tabela `AjusteCargaMarca` por OP, rota
  `…/op/[id]/ajustes-carga`): embalagem (solta, feixe, caixa, engradado, em pé), "junto com" (mesmo nome de grupo =
  um pacote), posição (chão, só em cima, nada em cima), orientação (deitar, alma em pé), medidas à mão (valem acima
  do IFC e da estimativa), observação. Aplicados em `expandirPecas` (medidas/orientação), `montarUnidades`
  (partição antes das famílias) e `tentaPor` (`soChao`, `nadaEmCima`). UI: clique na marca na tabela de volumes ou
  busca no painel "Ajustes por marca" → editor → "Simular de novo". Gravados com a simulação (`avisos.ajustes`) e
  listados na página 1 do PDF. Arrastar no 3D ficou de fora de propósito (revalidar apoio a cada movimento).
- **Próximas entregas combinadas:** prévia guardada no SharePoint com aprovação da Expedição; etiquetas por volume;
  import de lista de prioridades que corta em caminhões (caminho 2); comparativo de embalagem ligado à LQC.
- **Peça fora do IFC não some da carga** — Vitor (13/09/2026): "o ideal seria ignorar [o aviso dos parafusos], pois isso
  vai dar problema para o setor de carregamento". Duas famílias: **AC/parafuso sem peso** fica fora em silêncio (só a
  contagem); **peça com peso sem geometria** (escada móvel, contrapeso, batente da OP-107 — desenho do cliente, fora
  do modelo) entra com **caixa estimada pelo peso e pela família** (`caixaEstimada`), marcada `estimada`, e a tela
  pede conferência em âmbar. Nunca em vermelho: aviso vermelho na tela do carregamento vira peça deixada no pátio.
  Vitor (13/09): "só deve fazer pacote para esses itens, exemplo de caixas" → peça estimada viaja SEMPRE em caixa de
  madeira (nunca solta nem em feixe); e "essas peças que têm peso mas não têm IFC aí sim é importante avisar" → aviso
  destacado no modal, no card do romaneio ("N fora do IFC (conferir)") e na página 1 do PDF.

## PDF do modelo é montado no navegador (14/09/2026)

Vitor: "não estou conseguindo exportar o pdf". A rota `…/simulacao/modelo-pdf` recebia as fotos do 3D
no corpo — e uma carga tem 3 + 2×camadas JPEGs de 1200×560 (a da OP-107 tem 17 camadas → 37 fotos),
muito acima dos **4,5 MB** que a função da Vercel aceita (mesmo teto do upload, [[torg_upload_4mb]]).
Além disso o `window.open` depois do `await` caía no bloqueador de pop-up.

- `lib/carga/modelo-carga-pdf.js` roda **no navegador e no servidor**: sem `fs`/`path`/`server-only`/`Buffer`;
  o logo entra por parâmetro (`logo`: bytes do PNG) e a foto entra como data URL (o pdf-lib decodifica).
- O modal importa a lib dinamicamente (pdf-lib fica num chunk à parte, ~425 KB), monta o PDF com o que
  já tem em memória (`dados.op`, `dados.previo`, a carga do resultado, estimadas, ajustes) e baixa por
  `<a download>` — nada sobe para o servidor.
- A rota continua existindo para quem quiser o PDF por API (limite de ~3 MB de fotos), mas a tela não a usa.
- Teste: `carga-simular.teste.js › roda sem Node` confere que a lib não importa fs/path e que logo e foto entram no PDF.

## IFC de antes da revisão: a peça é achada pelo NOME (14/09/2026)

OP-085 (guarda-corpos da DANPOWER, 46 marcas / 79 peças / 4,8 t, chamados de "CORRIMAO nnnnMM"): o IFC
`T85 - DANPOWER - ENC 0325.ifc` é de 02/06 e a LPC R01 (21/07) renumerou os desenhos IPPE1099/IPPE1100 —
na lista IPPE1100P7 é "CORRIMAO 840MM", no IFC a tag IPPE1100P7 é "CORRIMAO 2081MM" (o P6 da lista).
Pela tag, 19 marcas levavam a geometria da vizinha e 5 ficavam sem nada.

- `casarMarcas` (lib/carga/geometria-ifc.js): tag com o mesmo Name → é ela; tag ausente ou com outro
  nome → o conjunto cujo Name é igual à descrição da lista, só se o nome for específico (tem número)
  ou único no modelo. "VIGA" solta não casa. O modal manda `{marca, desc}` e mostra o aviso
  "Numeração do IFC diferente da lista (N)"; `porNome` vai nos avisos da simulação gravada.
- Resultado na 085: 44 de 46 medidas (faltam IPPE1090P2/P3, corrimão de escada ×5 — no IFC estão como
  IPPE1091P2/P3 "P/ ESCADA E2/E3", nome diferente; usar "medidas à mão" 4945×1096×160 se precisar).
- `ehGC` passou a reconhecer CORRIM(ÃO): sem isso os 46 painéis viajariam como peça solta.
- ⚠ O mesmo desencontro está no SYNECO: as ordens foram criadas em 05/06 com a numeração R00
  (IPPE1099P8 ×11 = o P7 ×11 da lista; IPPE1100P7 = o P6…). O jato apontou em 14/09 nos números
  velhos, e o portal casa Syneco × peça pela marca — as quantidades de jato/pintura dessas marcas
  saem trocadas até o programador renumerar as ordens no Syneco (ou apontar nos números novos).

## O botão do PDF nunca tinha funcionado: `next/dynamic` engole o `ref` (14/09/2026)

Segunda vez que o Vitor disse "não estou conseguindo gerar o pdf" — desta vez com o PDF já montado no
navegador. Reproduzido num harness local (esbuild + Browser pane, scratch `harness/`): `viz.current`
era **null** — o `VisualizadorCarga` é carregado com `next/dynamic`, e o wrapper do dynamic não
repassa `ref` ao componente de dentro. `gerarPdf` começava com `if (!v …) return;` e saía calado.
- A API (capturar/enquadrar) agora chega por um prop comum, `apiRef`, e o botão explica quando o 3D
  não está pronto em vez de não fazer nada. Teste: `testes/components/simular-carga-modal.teste.js`.
- ⚠ Regra: componente de `dynamic()` nunca recebe `ref` — passe a API por prop.
- ⚠ Lição de método: o PDF foi validado por node (rota/lib) sem nunca clicar no botão num navegador.
  Fluxo de tela se prova NO NAVEGADOR — o harness (`entrada.jsx` + fetch falso servindo JSON do banco
  e os IFCs baixados) faz isso sem login e reproduziu o defeito no primeiro clique.
- Conferido: OP-107 romaneio 02, 33 volumes, 17 camadas → PDF de 22 páginas, 2,4 MB, em 3 s.

## PDF v2: modelos de embalagem + um cartão por volume com a foto 3D (14/09/2026)

Vitor: "o pdf está bem ruim, mal formatado, e o ideal seria um desenho do modelo das embalagens para
usarmos como referência para montagem". A v1 tinha 22 páginas (17 delas com 1–3 volumes e o resto em
branco), a lista por fase estourava a coluna e a legenda invadia a foto. Estrutura nova:
1. A carga pronta (como era, com a legenda quebrando dentro da coluna).
2. **Modelos de embalagem** (`lib/carga/modelo-embalagem-desenho.js`): desenho esquemático em vetor
   (vista de frente + de ponta, cotas, madeira, cintas) + regras, por TIPO usado na carga; números vêm
   das premissas. É o padrão, igual para toda obra.
3. **Volumes**: 6 cartões por folha, cada um com a **foto 3D do volume sozinho** (`capturarVolume` no
   VisualizadorCarga: cena própria, fundo branco, isométrica), peças, madeira, cintas e "na carga: x a
   y m da frente · lado · camada · sobre …".
4. Montar a carga: 4 camadas por folha (foto 1200×560 na proporção certa) + lista de volumes.
5. Anexo: separação por fase em 4 colunas; fase "?" vira "Sem fase (marca do cliente)".
- ⚠ WinAnsi não tem "→" nem "≤" (saía "?"): usar "·", "até".
- OP-107: 14 páginas (eram 22), 1,9 MB, 5 s no navegador.

## Empilhar pelo AÇO real (24/09/2026)

Vitor: *"hoje ele está separando demais as cargas (…) volte a lógica que fizemos nos testes"* — a OP-118 saía
em 20 carretas de 3 a 7 peças. A regra de 18/09 (`topoVazado`: nada sobe em topo que não seja ≥ 80% plano pela
malha) barrava **91% das marcas** da obra. Antes dela, a caixa envolvente deixava volume "voando" (medido:
50 volumes na OP-118 com a lógica do protótipo). As duas coisas que o Vitor disse valem juntas: *"elas podem ser
colocadas uma em cima da outra, o que não pode é ficar voando as coisas"*.

- **O motor recebe a malha** (`simularCarga({ …, malhas })`, o modal passa `geo.malhas` ao worker) e tira, por
  peça, o topo e o fundo do aço numa grade de 5 cm (`lib/carga/perfil-apoio.js`).
- **Altura pelo aço**: o volume desce até ficar um caibro acima do aço de baixo, coluna a coluna. As caixas
  envolventes podem se cruzar no vão — é assim que coluna com chapa de base desencontra e assenta corpo sobre
  corpo. No assoalho, não: o retângulo tem de estar livre.
- **Apoio = caibro sobre aço** (`caibrosApoiados`): um a cada ~1,5 m, correndo até 75 cm; encosta no aço do
  volume; aço de OUTRO volume embaixo a até 15 cm de calço (CALCO); as duas pontas + 60% (80% na carga de
  grades); o assoalho não é apoio; o ponto de carga cai entre os apoios (senão é gangorra); nada de baixo fura
  a faixa do caibro, que vai de folga a folga (largura + 3 cm de cada lado).
- **O 3D desenha os caibros do motor** (`u.caibros`: x, `y0`, `z0..z1`, calços) — `cena-carga.montarCaibros`.
  O editor manual confia neles enquanto ninguém mexe (`lib/carga/apoio-motor.js`); mexeu → regra da caixa.
- `versaoMontagem` 7. A 6 (18–24/09) segue aceita para PDF, com aviso azul de "simule de novo".
- Medido com um medidor independente (malha em 5 cm, fora do motor): OP-102 2 carretas (eram 5), OP-118 5
  (eram 19–20), OP-107 1 (3), OP-085 1 (2) — **zero voando** nas quatro. OP-118 leva ~57 s.
- ⚠ Resolução importa: a célula do motor é 10 cm, e a célula arredondada passa da borda da peça — o aço do
  VIZINHO caía nela e contava como apoio (achado pelo medidor). Por isso o caibro só olha `celulasDoCaibro`.
- ⚠ Pendente: virar a peça 180° (coluna com chapa empilharia com as chapas em pontas opostas).

## Pacotes de até 1,14 m e aço sempre sobre caibro (24/09/2026, tarde)

Vitor: *"precisamos fazer pacotes das peças com no máximo 1,2 de largura para facilitar o carregamento, travar com
madeiras no meio, cintas, e nunca podemos colocar as peças diretamente no assoalho, sempre com madeira para conseguir
retirar com facilidade"*. O desenho de referência do PDF (`embalagem-isometrica.js`) já mostrava caibro embaixo e
entre as fileiras — quem estava fora do padrão era o motor (feixe com 12 mm de folga, aço com y = 0).

- **Largura = `larguraDoPacote()` = 1,14 m**, não 1,20: é o que deixa DOIS pacotes lado a lado na carreta de 2,45 m com a
  folga de 3 cm de cada um na grade de 10 cm. Pacote de 1,2 m cheio ia um por fileira.
- **Toda peça estrutural que cabe na largura vai em pacote** (`unidades.js › pacotesPlanosEFeixes`), não só a "barra"
  de seção até 50 cm. 1º agrupa por descrição + faixa de 2 m (a descrição traz o nível, "VIGAT EL. +14880"); o que
  ficou sozinho junta pela FAMÍLIA (1ª palavra: VIGA, COLUNA, SE…). Solta só: mais larga que o pacote, longarina em V,
  a que passa da carreta (coluna de 12,5–14 m nunca em feixe) e quadro vazado sem par do mesmo tamanho.
- ⚠⚠ **Pacote em FILEIRAS** (`empacotarGrupo`): cada fileira enche até a largura com as peças que couberem, a seguinte
  vai em cima com caibro de 5 cm (`PAC.madeira`), até 60 cm de altura e 2,5 t. A grade de passo único (a MAIOR peça do
  grupo ditando o espaço de todas) deixava um grupo de vigas de 26 cm inteiro solto por causa de uma de 60 cm.
- **Aço no assoalho = sobre caibro (y = 10 cm)**; caixa, engradado e palete assentam direto (base própria:
  `temBaseDeMadeira`). "No chão" deixou de ser `y === 0`: é `nivelPilha === 0`, e a camada é `nivelPilha`.
- ⚠⚠ **Dois retratos do aço na grade** (`perfilNaGrade`): `topo/fundo` pelo CENTRO da coluna (apoio — 2 cm de borda não
  seguram caibro) e `topoMax/fundoMin` por toda célula tocada (colisão, `c.alto`). E o volume cheio é preenchido
  célula a célula, exato: amostrando de 25 em 25 a partir de +5, a última faixa ficava fora e duas caixas sobre palete
  (OP-107, perfil Vale) ficaram 30 mm uma dentro da outra.
- `versaoMontagem` 8; 6 e 7 mostram o aviso azul de "simule de novo".
- Medido (IFC real, medidor independente, zero voando e zero aço no piso): OP-118 5 (4 carretas + toco com as 10
  caixas de miúdos) · OP-102 2 · OP-107 1 · OP-085 1.
- ⚠ **Duas alavancas pendentes de decisão do Vitor**: (a) caixa só vai no assoalho ou sobre caixa (regra do Codex em
  15/09, resposta a "caixas sem os devidos apoios"); liberando caixa sobre pacote com caibro conferido no aço, a OP-118
  cai para 4 carretas. (b) Pacote de 1 m de altura (hoje 60 cm, premissa do protótipo): mesmas viagens nas quatro
  obras medidas, e menos peça solta (OP-102 de 28 para 17; OP-118 de 7 para 6) — fica 60 cm até o Vitor decidir.

## Carga encostada na cabeceira — o vão para "correr" (24/09/2026)

Vitor, vendo o 3D: *"esse vão pode ser um problema no transporte? por conta das peças terem um espaço para correr?"*.
Sim: numa frenagem a carga é empurrada para a frente com até 0,8 g, aço escorrega em caibro, e o vão vira impacto.
Medido na OP-118 (regras do portal): de 82 volumes, só 3 a até 10 cm de algo à frente na mesma altura; 30 com mais de
1 m livre.

- ⚠⚠ **O motor mandava a carga para o FIM da carroceria.** O x cresce da cabine para trás (`caminhao-3d.js`, cavalo em
  x < 0), e o custo tinha `- ix * 2` — preferia x MAIOR. O comentário dizia "depois para o fundo": a intenção era a
  cabeceira. Agora `+ ix * 2`: cada volume encosta no da frente, a carga vai da cabine para trás.
- Resultado: OP-118 **5 → 4 carretas**, vãos de 30 cm–1 m 20 → 3, acima de 1 m 30 → 21; OP-102/107/085 mesmas viagens.
- ⚠ **O que sobra de vão grande é DEGRAU** (13 de 21 na OP-118): a pilha de trás mais alta que a da frente — o volume
  de cima não tem nada na altura dele até a cabine. O travamento por volume (seção abaixo) foi adotado; carga "em
  escada" (alta na frente, descendo) segue como proposta, sem decisão.
- Teste: `carga-pacotes › carga encostada na cabeceira` (só a carreta no catálogo: numa HR só existe um lugar e o
  teste passava com o defeito).

## Travamento por volume — escorar ou amarrar (24/09/2026)

Vitor aprovou a regra proposta para o vão à frente: *"concordo com sua regra, podemos adotar"*. `lib/carga/travamento.js`
(`travamentoDaCarga`), função pura sobre as posições — roda no motor (`simular.js`, antes da madeira) e na montagem
editada à mão (`recalcularMontagem` refaz a cada edição). Mede o vão livre à FRENTE (−x) na mesma faixa de altura e de
largura (sobreposição > 30% das duas):

- **até 30 cm**: nada (folga entre volumes + calço);
- **até 1,5 m contra outro volume**, ou contra a cabeceira quando está NO ASSOALHO: **escorar** — 2 caibros do tamanho
  do vão, que entram na conta de madeira (`madeiraDaUnidade`) e aparecem no 3D (`montarEscoras`);
- **acima disso, ou sem nada na altura dele até a cabine** (o degrau): **amarrar para a frente com cinta e catraca**.
  O 3D não desenha a amarração (não há onde ancorar sem inventar); fica no texto.

Aparece no romaneio (`travamento`), na tabela de volumes (etiqueta âmbar/vermelha + contagem no rodapé) e no PDF
(linha na página de cada volume). ⚠ **"No assoalho" é `noAssoalho(u)`**: aço sobre o caibro do piso tem y = 10 cm; o PDF
dizia "Apoio não identificado" para todo aço no chão desde a versão 8, porque testava `u.y > 0`.

⚠ **Cinta é fita, não placa.** Desenhada como caixa de 5 cm × altura × largura em `0x222222`, virava uma placa preta
atravessando o pacote, e o Vitor leu como madeira: *"essas madeiras pretas que vc coloca (…) não vejo a forma de
conseguirmos fazer aqui"*. Agora `cintar()` (cena-carga) faz um laço de fita de 32 mm × 8 mm em volta do volume, verde
das cintas do PDF, e o contorno do pacote ficou claro e translúcido.

