---
name: torg_expedicao_cronograma
description: "Cronograma dá baixa na linha \"Expedição\" pelo expedido das listas (romaneios); % da ESTRUTURA em kg, itens fora editáveis"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1754de4f-06da-423d-8c20-70c99cbd5bad
  modified: 2026-08-13T12:04:06.083Z
---

O cronograma **não dava baixa na expedição** (Vitor 09/08): só a FABRICAÇÃO avança auto
(Syneco); expedição era 100% manual. Agora a linha-resumo **"Expedição"** do cronograma é
alinhada com o expedido das listas.

**Como o expedido chega ao portal:** os envios são **romaneios FORM-22 no SharePoint**
(`{OP}/4. Expedição/4.2 Romaneios`, parseados por `lib/parse-romaneio.js`). A OP-85 tinha
**0 romaneios no PORTAL** (models Romaneio/RomaneioPrevio vazios) mas 3 arquivos no SharePoint
(14.899 kg). O import da lista (`importarListasOP` em `lib/lista-avancada-sharepoint.js`) casa
cada marca com os romaneios e marca `expedidoRomaneio`/`romaneio` no `marcasJson`. `ListaExpedicao`
tem `pesoExpedido`/`pesoFaltante`/`marcasJson` (cada marca: `pesoTotal`, `descricao`,
`expedidoRomaneio`, `expedidoArquivo`).

**% de expedição = ESTRUTURA em kg** (`lib/expedicao-estrutura.js` → `progressoEstrutura`):
kg embarcado ÷ kg total, considerando só itens COM peso e que NÃO estão na exclusão. **Ficam de
fora:** grade de piso (tem kg mas linha própria), telha/cobertura, parafuso/fixação, **lanternim,
steel deck** — medidos por unidade, não kg (regra do Vitor: "estruturas em kg, telhas/parafusos por
unidade"). Termos **editáveis** na tabela `ExpedicaoItemExcluido` (SQL) via `/planejamento/config-expedicao`
(link no cabeçalho de Cronogramas); fallback = `TERMOS_NAO_ESTRUTURAL_PADRAO`.

**`lib/expedicao-cronograma.js` → `alinharCronogramaExpedicao(opId)`:** dá baixa em TODAS as
tarefas `departamento=EXPEDICAO` (não-summary), **por linha** (Vitor pediu 09/08): a linha geral
"Expedição" pela ESTRUTURA (kg); as demais (Guarda corpo, Telhas, Grade, Fixadores, "Estrutura
suporte, acessos e cobertura"…) pela `completudeMarcas` do seu grupo — **kg se as peças têm peso,
senão por unidade**. Mapeamento por palavra-chave: `grupoMarca(descricao)` × `gruposDaTarefa(nome)`
(grupos: guarda-corpo/grade/cobertura/fixacao/estrutura; corrimão→guarda-corpo). **Avança só —
nunca abaixo do manual**; a linha geral também grava `qtdePlanejada`/`qtdeRealizada` em kg. Nome
que não mapeia p/ grupo não é tocado. Chamada no fim do import; `alinharTodosCronogramas()` em massa.
Corrigiu OP-85 "Estrutura suporte, acessos e cobertura" 0→97% (estava atrasada indevida).

**Guarda-corpo vem como "G.C." (fix 13/08, commit 5e0b608):** as marcas de guarda-corpo são descritas
"G.C." / "G.C EL. +xxxx" / "G.C. INCLINADO", não "guarda". `grupoMarca`/`gruposDaTarefa` só olhavam
`guarda|corrim` → caíam em "estrutura" e as linhas "Expedição Guarda Corpo Reto/Inclinado" ficavam SEM
marcas (0% sempre). Agora reconhecem `g\.\s*c|\bgc\b` e **separam reto × inclinado** (sem sufixo = reto,
que é sempre a maioria). OP-067 (ENC 326): Reto 498 marcas, Inclinado 77 (antes 0). **PORÉM:** se as
marcas G.C. não têm romaneio/expedido no `marcasJson` da ListaExpedicao, o % fica 0% mesmo — o portal só
conta o que está na lista importada (ou casado com romaneio do portal). Guarda-corpo embarcado por
romaneio FORA do portal E não lançado na Lista Avançada (SharePoint) = invisível; precisa lançar na lista
e reimportar ("Buscar lista"). `foiExpedida` NÃO usa o campo `romaneio`/`dataExpedicao` cru — só
`expedidoRomaneio`/`expedidoArquivo` (este vem da coluna "expedido" do arquivo).

**Bug do faltante da lista (corrigido):** era `contratado − expedido`, que subestima quando o
contrato registrado (16.940 na OP-85) < soma real das peças (20.058, sem duplicatas). Passou a ser
`pesoFaltanteReal` = soma das marcas não embarcadas. **OP-85: cronograma 50%→71%, faltante
2.041→5.159 kg** (guarda-corpo/corrimão, que é o que realmente falta — os acessos foram embarcados).
Alinhados tbm T082 (50%), T086/T087 (100%).

**Romaneios do SharePoint na aba da OP** (Vitor 09/08, d1bc164): quando o FORM 22 é feito fora do
portal (só arquivo no SharePoint, sem lote/RomaneioPrevio), o painel "Romaneios" da OP
(`AbaExpedicao.jsx`, aba Expedição de `/comercial/[id]`) ficava vazio. Novo endpoint
`GET /api/comercial/op/[id]/romaneios-sharepoint` acha a pasta `4.2 Romaneios` (em "01. OP" ou
"Finalizadas"), parseia cada arquivo (`parseRomaneio` → número/`dataSaida`/peso/marcas) e o card
"Romaneios emitidos (arquivos no SharePoint)" lista como registro. Só leitura.

Nuance: a OP-85 tem "ACESSOS - CORRIMÃO" que é **corrimão** (família guarda-corpo, NÃO embarcado),
≠ acessos/escadas estruturais (embarcados). Ver [[torg_romaneio_carga]], [[torg_status_obra]],
[[torg_cronograma_syneco]].
