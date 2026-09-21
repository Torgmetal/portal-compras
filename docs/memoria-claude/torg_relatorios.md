---
name: torg_relatorios
description: Módulo Relatórios (/relatorios) — hub; v1 status com fotos no layout Data-book; envio ao cliente + aceite por token + rastreio no painel da OP; RelatorioStatus via SQL
metadata: 
  node_type: memory
  type: project
  originSessionId: d9c0cffd-a288-4e74-b94d-9b9291161750
---

Módulo **/relatorios** (07/07/2026), **hub de relatórios que vai crescer** (status é o 1º tipo). Módulo próprio no `SidebarModuleSwitcher`; acesso `MODS_RELATORIOS` (`lib/relatorios.js`) = COMERCIAL/PRODUCAO/ENGENHARIA/PCP/QUALIDADE (+ADMIN); gate no middleware.

- **v1 = Relatório de Status com fotos**. Layout **clona o Data Book** (`lib/databook-pdf.js`) via `lib/relatorio-status-pdf.js` (capa navy+logo+ID, seções, fotos em grade 2col c/ legenda, rodapé ISO).
- **Dados**: tabela `RelatorioStatus` — blocos+fotos em **JSON**, `opNumero` **texto**, sem relações Prisma. Criada + evoluída por **SQL cru** (cuidado drift no `db push`). Campos de aceite/rastreio: `token` (único), `aceitoEm/aceitoNome/aceitoIp`, `envios` (JSON `[{para,cc,porNome,em}]`).
- **Editor** `/relatorios/[id]`: identificação (seletor de OP **ativas** autofill), resumo, blocos com fotos (upload reduz via canvas → JPEG). Botões: Gerar PDF, **Enviar ao cliente**. Faixa mostra "enviado Nx · aceito por…/aguardando".
- **Enviar** (`/api/relatorios/[id]/enviar`): gera PDF, manda ao cliente (Para do contato da OP) com **cópia** (seletor de todos os e-mails da Torg — `/api/relatorios/emails` — + avulso), **PDF anexo** + **link de aceite**; registra em `envios`; marca EMITIDO.
- **Aceite público** (espelha Data Book): e-mail leva a `/relatorio/aceite/[token]` (sem login, allowlist no middleware) → cliente vê o PDF (`/api/relatorio/aceite/[token]/pdf`) e confirma (nome+cargo) → grava aceite + AuditLog. API `/api/relatorio/aceite/[token]` (GET/POST).
- **Rastreio na OP**: `components/RelatoriosOPSection.jsx` (no `OPDetailClient` do Comercial, antes do Histórico) lista os relatórios da OP (`/api/relatorios?opId=`) com para/cc, quando, nº de envios e o aceite; copiar link de aceite.

Rotas PDF (interna + pública) a 3009MB no vercel.json, maxDuration 120. Fase 2 (não feito): puxar status de produção automático. Ver [[torg_apresentacao_cliente]] (mesmo padrão de token/aceite).
