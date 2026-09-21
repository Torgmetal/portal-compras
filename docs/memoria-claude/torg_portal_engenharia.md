---
name: torg_portal_engenharia
description: Portal de Engenharia (/engenharia) — módulo novo sobre PecaConjunto (Tekla/LPC); Fase 1 no ar; Vitor quer o PORTAL antes dos indicadores
metadata:
  node_type: memory
  type: project
  originSessionId: d9c0cffd-a288-4e74-b94d-9b9291161750
  modified: 2026-07-28T19:30:43.684Z
---

Módulo **`/engenharia`** iniciado 03/07/2026 (commit 0e0b9d4). Objetivo do Vitor: **controlar a engenharia junto ao Tekla e analisar bem os dados**. ⚠️ Ele foi explícito: **construir o PORTAL primeiro, indicadores depois** ("precisamos criar o portal mesmo não os indicadores primeiro").

**Ideia central:** Tekla = fonte da verdade do modelo; o portal é a camada de controle/análise por cima, alimentada pelos dados que **já entram** (relatório XLSX do Tekla → `parse-tekla`/LPC → **`PecaConjunto`**). Não muda o fluxo do Tekla.

**Fase 1 no ar** (sobre `PecaConjunto`, sem indicadores):
- **Visão Geral** `/engenharia` (`EngenhariaCarteiraClient` + `/api/engenharia/carteira`): carteira por **FRENTE** = `PecaConjunto.opNumero` (código Tekla/SKA, ex. **T64T/T78B**), com OP real + cliente/obra. Peso modelado (Σ `pesoTotalKg`) + produzido (Σ `pesoProduzido`, Syneco) + progresso. Validado: 31 frentes, 1.082 t.
- **Detalhamento por OP** `/engenharia/[opNumero]` (`DetalheOPClient` + `/api/engenharia/op/[opNumero]`): marcas/conjuntos (perfil, grade, qte, peso, status), resumo (modelado×produzido, área pintura, **qualidade do dado** = marcas sem grade/perfil), filtro por status + busca.
- Gate `ENGENHARIA` no `middleware.js`; módulo no `SidebarModuleSwitcher` (ícone PencilRuler) + `SidebarEngenharia`.

⚠️ **JOIN correto (repetir em toda tela nova):** `PecaConjunto.opNumero` é o **código Tekla/SKA (T64T)**, NÃO o `OP.numero` (064). A OP real (cliente/obra) resolve por **`opId`** (relação `op`) — usei `findMany({ distinct:["opNumero"], select:{ op:{...} } })`. Ver [[torg_pecaconjunto_opnumero]]. Uma OP tem várias frentes (T78A/T78B → OP 078). **Peso sempre em kg** ([[torg_peso_kg]]).

**Abas OP + Listas** (commits 9a022db + e537101, 27/07): lateral (`SidebarEngenharia`) ganhou **"OPs"** (→ `/comercial`, reusa a tela que blinda Resumo/Financeiro pra não-Comercial/Financeiro) e **"Listas (LE/LPC)"** (`/engenharia/listas`). Listas importa o xlsx do Tekla reaproveitando os imports de Produção (`/api/producao/pecas/importar-lpc` — liberou ENGENHARIA no papel — e `/importar-le`; front lê o xlsx → rows). **Salvamento automático no servidor** (SharePoint, drive SERVIDOR): ao importar, o arquivo sobe pra pasta REAL da OP (resolvida por `listarPastasOp` pelo número) na pasta padrão de cada tipo — **LE** `2. Engenharia/2.6 Lista de Expedição`, **LPC** `2. Engenharia/2.5 Projetos/2.5.2 Fabricação/2.5.2.1 Lista de Liberação` (subcaminhos da OP-000 PADRÃO que o Vitor mandou). `lib/sharepoint-lista.js` (`salvarListaNoServidor`) + endpoint `/api/engenharia/listas/servidor` (arquivo em base64, guard 4MB). Graph PARAMETRIZADO pelo drive SERVIDOR (`resolveServidorDriveId`), não o `SHAREPOINT_DRIVE_ID`. ⚠️ NÃO testei o upload real (não crio arquivo no SharePoint de prod) — Vitor valida. **E-mail de revisão** (commit ddbaad3): quando o import é revisão (itens atualizados>0), aparece um SELETOR com todos os usuários da Torg (`GET /api/engenharia/listas/destinatarios`, mesmo critério do CC dos relatórios: ativos, tipo≠FUNCIONARIO), já todos marcados, e a pessoa desmarca quem quiser + envia (`POST /api/engenharia/listas/avisar-revisao`, sendEmail/Resend). Decisão do Vitor: "deixe todos, porém deixar pra selecionar" (NÃO lista fixa). Não testei o envio real (não mando e-mail pra equipe num teste) — Vitor valida. **Revisão por nome do arquivo** (commit d2b62db): lê o nº da revisão do NOME (R1/R01/R2/R02/R10, regex `/(?:^|[\s._-])r0*(\d{1,3}).../i`) e mostra; reenviar a MESMA revisão (mesmo nome) SUBSTITUI o arquivo no servidor (`conflictBehavior=replace`), revisão nova = nome novo convive na pasta; quem importa descreve "o que mudou" (opcional) → vai no e-mail (nº da revisão no assunto+corpo). Vitor recusou merge inteligente — quis só isso. OP virou dropdown (`GET /api/engenharia/listas/ops`), NÃO texto livre; mantida opcional c/ "detectar automaticamente" porque forçar opForcado no LPC sobrescreveria o opNumero Tekla. "sobrescrever" (LE+LPC) = deleteMany+recria (perde progresso); padrão = upsert.

**Roadmap (menu "em breve"), na ordem sugerida:** (1) Importar do Tekla — snapshot versionado por OP+revisão (XLSX→depois NC/IFC); (2) Revisões & Retrabalho — diff entre snapshots, cruzar com o já cortado/produzido; (3) **Reconciliação de Peso** — funil modelo→detalhado→comprado(Omie)→cortado(Syneco)→produzido→expedido, flagra sobrepeso de compra/nesting; (4) Indicadores mensais (reusar o motor do Compras: kg/projetista, prazo de liberação vs início de corte [[torg_inicio_producao]], índice de revisão, aproveitamento). Fase 5: API Tekla/EPM.

**Desenho navegável (mockup) publicado como Artifact** (as 6 telas) — usar pra alinhar com o Vitor antes de construir cada fase. Base já existe: `PecaConjunto` (rico), `RM/RMItem` (takeoff), `Revisao`, pedido Omie (peso comprado).
