---
name: torg-mes-syneco
description: "Portal Compras Torg — arquitetura do sync MES/Syneco (agente na fábrica, 2 datasets) e o incidente de 01/06/2026"
metadata: 
  node_type: memory
  type: project
  originSessionId: f0eb7362-df04-4e12-8b97-4a78c7f30111
---

**Arquitetura do sync Syneco/MES:** um agente local (`scripts/mes-sync-agent.js`) roda numa máquina **na fábrica** (`C:\MesSync`, Task Scheduler de hora em hora) porque o SKA/Syneco (`http://192.168.0.190:1000`) só existe na LAN — inalcançável do Vercel e do Mac do Vitor. O agente autentica no SKA, busca datasets e POSTa no portal com Bearer `MES_SYNC_API_KEY` (não-NextAuth; rotas `/api/mes/*` liberadas no middleware).

**Dois fluxos no MESMO agente (desde 340fe1c, 2026-06):**
- **Apontamentos** — dataset **242** → `POST /api/mes/sync` → `MesApontamento` (eventos com ProductionID; alimenta Controle de Produção/Syneco). Janela `SYNC_DIAS_ATRAS` (padrão 2 dias).
- **Ordens** — dataset **150** → `POST /api/mes/sync-ordens` → `MesOrdem` (snapshot planejado×produzido). Janela 3 anos, dividida contra o teto de ~100k linhas do SKA.
- Backfill: `node mes-sync-agent.js --so-apontamentos --apont-start YYYY-MM-DD`.

**Incidente 01/06/2026:** a reescrita "Fase 1 dataset 150" (11c05de, Matheus) substituiu o agente inteiro e **perdeu o fluxo de apontamentos** — produção parou de atualizar às 15:21 de 01/06 e ninguém notou por 9 dias (o MesSyncLog mostrava milhares de syncs "OK"... só de ordens). Diagnóstico: último `MesApontamento.createdAt` = minuto do deploy. Lição: ao mexer no agente, conferir que **os dois** fluxos continuam; mudança no script exige atualização manual na máquina da fábrica (quem faz: Matheus).

**ProductionID NÃO é único por evento (30/06/2026, commit 662b52c).** O SKA (dataset 242) **reaproveita** o ProductionID — o mesmo número vira outro apontamento em horário diferente (ex.: corte T95 1.176kg às 02:11 virou 420kg às 09:02 no mesmo pid). O upsert de `MesApontamento` era por `productionId` → cada reuso **sobrescrevia** o apontamento anterior e a peça sumia (Corte caiu 1.651→895; 895+1.176=2.071 do Syneco). Sinal nos logs: todo sync de 10min dava **criados=0 / atualizados=tudo**. FIX: unique de `MesApontamento` virou **`[productionId, dataInicio]`** (chave por evento) + upsert pela chave composta; como o agente reenvia a janela de 2 dias a cada 10min, eventos sobrescritos são recriados. **CONFIRMADO NA ORIGEM (30/06/2026):** acessei o SKA direto (ver abaixo) e o dataset 242 **carrega os dois eventos** do pid reusado (113846 = 1176kg@02:11 + 420kg@09:02, ambos T95A5) e o **SQL do 242 não tem `GROUP BY`** ("linhas = eventos") → o SKA NÃO colapsa na origem, o bug era 100% do portal e a chave composta é **suficiente** (não precisa Matheus mexer no agente/dataset). Verificado: índice `MesApontamento_productionId_dataInicio_key` aplicado no Neon, syncs `ok=true` a cada 10min, e Corte do portal voltou a **2.071 kg** (= Syneco). Ver [[torg_syneco_apontamento_fonte]].

**Acesso direto ao SKA p/ debug (read-only):** o SKA é alcançável da **máquina do Vitor na LAN** (não do sandbox padrão — precisa rodar Bash com a rede liberada). Login `POST http://192.168.0.190:1000/v1/auth/login` `{user,password}` (cred do agente, no `.env` de C:\MesSync) → `token`. Header `token` (não `Authorization`). `GET /v1/dataset` lista o **SQL de TODOS os ~242 datasets** (acha id por SQL: 242="04.4 Rastreabilidade OP e Item"=`...FROM TORG_Production_Traceability_V01_Eventos(...)`; 241/150/241 são variações por setor/ordem). `GET /v1/dataset/{id}/run?interval=0&%23StartDate=ISO&%23EndDate=ISO&%23OP=Todos&...&pageSize=99999` roda o relatório. Campos do 242: ProductionID, Peso(kg), Obra(=OP), Setor(descritivooperacao), Data de Início/Fim, Produzido(un). NUNCA escrever no SKA — só login + GET.

**Pendência de segurança:** o header antigo do agente (histórico do git) tinha a `PORTAL_API_KEY` literal — rotacionar `MES_SYNC_API_KEY` (Vercel + .env da máquina da fábrica).

Diagnóstico rápido: `MesSyncLog` (criadoEm/sucesso/erro) + `MesApontamento` máx `createdAt` vs `dataInicio`. Ver [[torg-acesso-notificacoes]].
