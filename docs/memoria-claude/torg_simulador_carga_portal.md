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
- **Próximas entregas combinadas:** PDF do modelo (separar por fase, volumes, camadas) e etiquetas por volume;
  tela de configuração de veículos/frete/embalagem; import de lista de prioridades que corta em caminhões.
