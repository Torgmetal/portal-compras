---
name: torg_ambiente_demo
description: Ambiente de DEMONSTRAÇÃO do portal (Vitor, 21/09/2026) — Postgres local `torg_demo` (cópia da produção via pg_dump), `MODO_DEMO=1` desliga e-mail e Omie e desvia gravações do SharePoint para `DEMO/`; worktree ~/dev/portal-compras-demo na porta 3002
metadata:
  type: project
---

**Vitor (21/09/2026):** *"precisamos fazer um localhost para simular essa OP, desde a geração da OP
até a expedição, para mostrarmos ao cliente — uma OP fake só para eu passar tudo com eles e ir
ajustando"*. A OP é a 122 (Vale/TMSA, TPR00751).

⚠⚠ **O `npm run dev` GRAVA NA PRODUÇÃO.** Não há staging. Uma OP fake ali se mistura com as reais,
manda cotação a fornecedor e abre pedido no ERP. Por isso a demo tem banco e travas próprios:

| Peça | Onde | O que faz |
|---|---|---|
| Banco | Postgres 17 do Homebrew, base **`torg_demo`** | cópia integral da produção: `sh scripts/demo-banco.sh` (pg_dump do Neon → restore local, ~15 s; 220 tabelas). Refazer quando quiser "zerar" a demo. |
| Env | `.env.demo` (ignorado pelo git; modelo em `docs/env-demo.exemplo`) | `MODO_DEMO=1`, `DATABASE_URL=postgresql://localhost:5432/torg_demo`, `NEXTAUTH_URL=http://localhost:3002`, Omie e Resend **em branco** (segunda trava) |
| Servidor | worktree **`~/dev/portal-compras-demo`** (main), `npm run demo` → porta **3002** | launch.json "Next.js Demo (3002, banco torg_demo)". As variáveis do `.env.demo` vencem as do `.env.local`. |
| Travas | `lib/modo-demo.js` | e-mail devolve `ok, demo:true` sem enviar; `omieCall` recusa com mensagem; `criarPedidoOmie` devolve pedido `DEMO-…`; `ensureFolder`/`uploadFileToFolder` gravam em `DEMO/…` (criando os pais). Leitura do SharePoint continua normal — os desenhos aparecem. |
| Sinal | `components/FaixaDemo.jsx` | faixa laranja fixa no topo de toda tela enquanto `MODO_DEMO=1` |

⚠ **Os logins são os mesmos da produção** (é uma cópia) — inclusive o do Renato (TMSA). Blob é o
real: anexo subido na demo vai para o store de produção (harmless, mas existe).
⚠ **Escolha do banco**: Neon branch precisaria do painel (sem `NEON_API_KEY`) e esbarra no limite
de branches dos previews; Postgres local resolveu em minutos e fica todo no Mac.
⚠ **Postgres local precisa estar de pé**: `brew services start postgresql@17`.

Ver [[torg_tekla_tmsa_vale]] (o que a TMSA exige na OP-122) e [[torg_vercel_neon_deploy]].
