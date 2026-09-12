---
name: torg_portal_estrutura_3d
description: Portal do cliente/auditor — aba Estrutura mostra a planta dos galpões em 3D (iframe self-contained) + toggle 2D
metadata: 
  node_type: memory
  type: project
  originSessionId: 1754de4f-06da-423d-8c20-70c99cbd5bad
  modified: 2026-08-15T20:45:11.038Z
---

Portal do cliente/auditor (`/portal-cliente/[token]`, `PortalClienteClient`) tem abas Documentos / **Estrutura** / Máquinas / Equipe / Data Book modelo. A aba Estrutura = componente GLOBAL `components/PlantaFabril.jsx` (sem props — a fábrica é a mesma em todo portal).

**15/08:** a aba Estrutura mostra o **modelo 3D dos galpões** (só 3D — o toggle "Planta 2D" foi REMOVIDO a pedido do Vitor). `PlantaFabril` = header + iframe + Fluxo + **chips "Setores de produção"** (cores idênticas à legenda do 3D) + metragens.
- O 3D é um HTML **self-contained** (Three.js + modelo em base64, `OrbitControls`, roda offline) em **`public/estrutura-3d/galpoes.html`** (~380KB), via `<iframe src="/estrutura-3d/galpoes.html?v=BUILD_HASH">` (cache-bust por deploy — senão o navegador pega versão velha; Cache-Control é must-revalidate).
- **Gerado no "Design" do Vitor** (um bundler que RECONSTRÓI o DOM a partir de um template escapado). Ele controla LÁ: posições dos equipamentos, tirar o arrasto de peças e o card "planta baixa" (o export já veio sem esses). **Trocar o modelo / reaplicar a limpeza = `node scripts/preparar-galpoes-3d.mjs ~/Downloads/index.html`** — o script injeta `style="display:none!important"` INLINE nos elementos do template (`.overlay.legend` = legenda de setores, `.note` = nota técnica de planta baixa), porque `<style>` no `<head>` externo é DESCARTADO na reconstrução do bundler (isso me custou umas voltas). Rodar a cada novo export.
- **Precisou de 2 exceções** (senão quebrava):
  1. `next.config.js`: o app manda `X-Frame-Options: DENY` + `frame-ancestors 'none'` em tudo → iframe bloqueado. Criei `FRAMEABLE_HEADERS` (SAMEORIGIN + `frame-ancestors 'self'`) aplicado SÓ em `/estrutura-3d/:path*`; o resto usa a regra global via `/((?!estrutura-3d/).*)`. Cross-origin segue bloqueado (clickjacking ok).
  2. `middleware.js`: o matcher joga rota fora da allowlist pro `/entrar`. Adicionei `estrutura-3d` à exclusão do matcher (`/((?!_next/static|…|estrutura-3d).*)`), igual `obras`/`torg-logo` — assim é servido como asset público.
- Prod: **workspace.torg.com.br**; teste direto (sem token) em `/estrutura-3d/galpoes.html`. O redirect do `vercel.json` só pega `*.vercel.app` (guarda de host), não afeta o domínio real.

Relacionado: [[torg_auditorias_externas]] (o portal que o auditor acessa).
