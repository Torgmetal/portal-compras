---
name: torg_engenharia_ia_portao
description: Portão de IA da Engenharia (F1 do app Torg Engenharia) — pareamento de PC com aprovação do ADMIN, teto mensal em R$, só Opus/Sonnet 5.5, chave só no portal
metadata:
  type: project
---

App Torg Engenharia (spec `docs/superpowers/specs/2026-10-14-torg-engenharia-app-design.md`): o Claude roda no PC do
projetista e lê o Tekla pelo conector MCP `torg-tekla` (repo **Torgmetal/torg-engenharia**, F0); a conta com a
Anthropic passa pelo **portão do portal** (F1, no ar desde 16/10/2026).

**Decisões do Vitor (16/10/2026):** teto MENSAL por projetista em R$; **só ADMIN aprova** PC novo; modelos **Opus 5.5 +
Sonnet 5.5** e mais nenhum; grava o consumo E o **pedido do projetista** (não a resposta). Ele chegou a cogitar
assinatura por projetista e voltou ao portão ("qualquer coisa mudamos isso depois").

**How to apply:**
- Código: `lib/ia-engenharia.js` (preços, custo, código de pareamento, leitura do `usage` no SSE), `lib/ia-portao.js`,
  rotas em `app/api/engenharia-ia/` e `app/api/admin/engenharia-ia/`. Tabelas `IaAparelho`/`IaUso`/`IaLimite` por SQL
  (`scripts/ensure-ia-engenharia.mjs`).
- Env na Vercel: `ANTHROPIC_API_KEY_ENGENHARIA` (chave SEPARADA da dos PDFs) e `IA_COTACAO_USD_BRL` (padrão 5,5).
- O app usa `ANTHROPIC_BASE_URL=https://workspace.torg.com.br/api/engenharia-ia` + o token do aparelho; o Claude Code
  usa modelo pequeno em tarefa de fundo → configurar o Sonnet como modelo pequeno, senão o portão recusa.
- ⚠ O token só aparece uma vez (consulta de status depois da aprovação); perdeu → revoga e pareia de novo.
- ⚠ Localmente o Prisma client da pasta compartilhada é o da main: rota nova que usa model novo dá
  `Cannot read properties of undefined` no dev até a main ter o schema — não é bug da rota.
- Preço (US$/MTok, 06/10/2026): Opus 5.5 4/20 (cache lido 0,20); Sonnet 5.5 2/10 (cache lido 0,20); cache gravado 1,25×.
