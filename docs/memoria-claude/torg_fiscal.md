---
name: torg_fiscal
description: Módulo Fiscal (/fiscal) — romaneio emitido aguardando NF; dept informa número + tipo (venda/serviço/remessa) e finaliza
metadata: 
  node_type: memory
  type: project
  originSessionId: dcd073c6-4b21-46d4-b2d3-f4c7977df22a
  modified: 2026-07-30T18:58:01.235Z
---

Módulo NOVO `/fiscal` (criado 30/07, commit bbcf574). Fila do departamento fiscal: quando um romaneio é **emitido** ele cai aqui aguardando a emissão da NF; o dept informa o **número** e o **tipo** (VENDA/SERVICO/REMESSA) e o romaneio vira **FINALIZADO**. Acesso `ADMIN/FISCAL/FINANCEIRO` (FISCAL é módulo de usuário novo).

**Fonte = `RomaneioPrevio.emitidoEm`** (o "Emitir" do wizard da página da OP — [[torg_romaneio_carga]]), NÃO o modelo `Romaneio` (fluxo Montar Romaneio/carga, que tem `nfStatus/nfNumero/nfSerie/nfChave` próprios e continua fora do Fiscal por ora). Se um dia quiser unificar, os dois precisam entrar na fila.

**Campos novos no `RomaneioPrevio`** (SQL no Neon + schema): `nfNumero`, `nfTipo` (VENDA|SERVICO|REMESSA), `nfEmitidaEm` (= quando finalizou), `nfObservacao`, `nfRegistradoPorId`, e `arquivoUrl` (webUrl do FORM 22 no SharePoint, gravado na emissão em `lotes-expedicao/[loteId]/romaneio` quando o save dá certo → o Fiscal linka o Excel). **Finalizado é DERIVADO** (`nfNumero && nfTipo`), não tem coluna de status; registrar seta `nfEmitidaEm`+`nfRegistradoPorId`, limpar o número/tipo reabre (zera esses dois). Validado round-trip no banco.

**API:** `GET /api/fiscal/romaneios?status=aguardando|finalizado|todos` (lista os `emitidoEm != null`, inclui op + lote/transportador) e `PATCH /api/fiscal/romaneios/[id]` (nfNumero/nfTipo/nfObservacao). **UI:** `/fiscal` (`FiscalClient.jsx`, abas Aguardando NF × Finalizados + busca + resumo + link do FORM 22 + modal Registrar NF), `SidebarFiscal.jsx`, layout/page. Fila começou VAZIA (0 emitidos na prod em 30/07) — só aparece depois que alguém emitir um R00 pelo wizard.

**Pendente/futuro:** por hora o registro da NF é MANUAL (o dept digita); o gancho pra puxar NF do Omie automático fica pra depois (é o "portal fiscal pra emissão de NF" que o Vitor mencionou). Romaneios do fluxo de carga (`Romaneio`) ainda não entram no Fiscal.

**PADRÃO — registrar um módulo novo no portal (5 lugares, verificado 30/07):** (1) nav: array `MODULOS` em `components/SidebarModuleSwitcher.jsx` (`{href,label,desc,icon,cor,modulos:[...]}`); (2)+(3) whitelist server-side `MODULOS_VALIDOS` (zod enum) em `app/api/admin/usuarios/route.js` E `app/api/admin/usuarios/[id]/route.js` (duplicado); (4)+(5) `MODULOS_OPCOES` (label do checkbox) em `app/admin/usuarios/novo/_form.jsx` E `app/admin/usuarios/[id]/page.js` (duplicado). Acesso é por `requireRole([...])`/`requireAcesso({modulos})` (ADMIN sempre passa) — [[torg_acesso_notificacoes]]. Criar a página: `app/<mod>/layout.js` (Sidebar próprio) + `page.js` (gate) + client; espelhar `/reunioes` ou `/expedicao`.
