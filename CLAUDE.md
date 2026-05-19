# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # start dev server
npm run build        # prisma generate + next build
npx prisma generate  # regenerate Prisma client after schema changes
npx prisma db push   # apply schema changes without a migration (dev only)
npx prisma migrate dev --name <name>  # create a migration
npx prisma db seed   # seed initial admin user
npx prisma studio    # open Prisma database UI
npx vercel env pull .env  # pull env vars from Vercel
```

No test suite is configured.

## Local development setup

`.env` is a symlink to `.env.local` — create it once with:

```bash
ln -sf .env.local .env
```

This is required because Prisma CLI reads `.env` while Next.js reads `.env.local`. Without the symlink, commands like `prisma db pull` and `prisma db push` fail silently or error.

Three env vars that differ between Vercel and local:

| Var | Vercel | Local `.env.local` |
|---|---|---|
| `NEXTAUTH_URL` | empty (NextAuth falls back to `VERCEL_URL`) | `http://localhost:3000` |
| `DIRECT_URL` | empty | same value as `DATABASE_URL_UNPOOLED` (the Neon connection string **without** `-pooler` in the host) — required for `prisma migrate` and `prisma db push` |
| `NEXTAUTH_SECRET` | may be empty in production | generate with `openssl rand -base64 32` |

### Branches

Two devs: Vitor (director) and Matheus. All work goes on `vitor/<feature>` or `matheus/<feature>` branches and merges to `main` via PR. Never commit directly to `main`.

## Architecture

> **Warning — no staging environment.** Local development runs against the **production Neon database** and **real integrations** (Omie ERP, Resend, Anthropic). Any test that creates data — purchase orders, vendor quote emails, OP mutations — affects real production records and may trigger real emails to suppliers.

**Fullstack SaaS** — Next.js 14 App Router (JavaScript, no TypeScript), PostgreSQL via Neon + Prisma 6, deployed on Vercel. It is an internal ERP workflow tool for Torg Metal (steel fabrication), orchestrating the flow: **Comercial → Engenharia → Compras → Produção/Almoxarifado → Expedição**.

### App Router structure

All pages are under `app/`. API endpoints are under `app/api/`. The `@/*` alias maps to the repo root.

Key domain modules:
- `app/comercial/` — Sales team: create/manage Ordens de Produção (OPs), contracts, budgets, measurements synced with Omie ERP
- `app/rm/` — Engineering: create Material Requisitions (RMs) linked to OPs
- `app/compras/` — Procurement: receive RMs, manage vendor quotes, generate Omie purchase orders
- `app/producao/` — Production tracking (weekly, inventory, piece control)
- `app/fornecedores/c/[token]/` — Public vendor portal (token-based, no auth)
- `app/financeiro/`, `app/expedicao/` — Financial KPIs and shipping manifests

### Shared library (`lib/`)

- `prisma.js` — Prisma singleton (import from here, never instantiate directly)
- `auth.js` / `session.js` — NextAuth config + `requireRole(["ROLE"])` guard used in every API route
- `omie-*.js` — Five modules wrapping the Omie ERP REST API (30-second cache + backoff retry)
- `parse-*.js` — Document parsers for Tekla XLSX, Le-Form21 CSVs, PCP-EAP spreadsheets, and PDF invoices
- `pdf-parser-server.js` — Regex fallback for PDF parsing when the Claude AI method fails
- `estoque-alocacao.js` — Inventory allocation logic
- `email.js` / `notificacoes.js` — Transactional email (Resend) and in-app notifications

### Authentication & roles

NextAuth credentials provider with JWT (12-hour session). Eight roles: `ADMIN`, `COMERCIAL`, `ENGENHARIA`, `COMPRAS`, `PRODUCAO`, `ALMOXARIFADO`, `FINANCEIRO`, `EXPEDICAO`. `middleware.js` enforces role-based routing; every mutating API endpoint calls `requireRole([...])` at the top.

### Data model (Prisma)

Core entities:
- **OP** — central entity; has items, revisions, budgets, addenda, receipts, measurements
- **RM / RMItem** — material requisitions linking Engineering to Procurement
- **Cotacao / CotacaoItem** — vendor quotes accessed via public token
- **PedidoOmie** — purchase orders synced to/from Omie
- **EstoqueItem / EstoqueReserva / EstoqueAlocacao** — inventory state
- **ProducaoSemanal / PecaConjunto** — weekly production data

Audit trail via `AuditLog` — write an entry for every critical mutation.

### External integrations

- **Omie ERP** — orders, service orders, inventory (all via `lib/omie-*.js`)
- **Anthropic Claude API** (`@anthropic-ai/sdk`) — primary PDF invoice parser; `lib/pdf-parser-server.js` is the regex fallback
- **Vercel Blob** — PDF/file storage; metadata saved in DB after upload via `/api/upload-blob`
- **Resend** — transactional email
- **SharePoint** — production planning sheet sync (optional cron at 8 AM)

### Vercel cron jobs (`vercel.json`)

- `0 6 * * *` → `/api/cron/estoque-produtos`
- `30 6 * * *` → `/api/cron/estoque-movimentacoes`
- `0 8 * * *` → `/api/producao/sync-sharepoint`

Routes that exceed the default 10-second limit declare `export const maxDuration = 60` at the module level.

### UI conventions

- Tailwind CSS 3.4 with TORG brand palette (see `tailwind.config.js`): `torg-blue`, `torg-dark`, `torg-gray`, `torg-orange` + Saira font
- Icons from `lucide-react`
- All naming (variables, comments, UI text) is in **Portuguese**
- Client components use `"use client"`; keep server-only logic in API routes or lib modules
- Zod validation on all API route inputs
