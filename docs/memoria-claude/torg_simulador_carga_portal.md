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
