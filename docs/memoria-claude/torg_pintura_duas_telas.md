---
name: torg-pintura-duas-telas
description: "Portal Compras Torg — o relatório de pintura tem DOIS formulários (portal de campo e computador); a Lais só enxerga o de campo, então ajuste pedido por ela tem que ir nos dois"
metadata:
  type: project
---

O relatório de inspeção é preenchido por **dois componentes diferentes**, e mexer num não muda o
outro:

- `app/campo/Pintura.jsx` (+ `app/campo/Medir.jsx`) — **portal de campo**, `/campo`. É o que os
  inspetores abrem, no celular **e no PC**. Grava por `PATCH /api/campo/relatorios/[id]`, que tem
  **lista fechada** de campos em `resultados` — campo novo aqui exige entrar nessa lista, senão
  salva vazio.
- `app/qualidade/inspecoes/[id]/FormPintura.jsx` — formulário do computador, para quem **monta** o
  documento (módulo QUALIDADE/ADMIN). É o único que lê o PIT (`escopoDoTipo`).

**Lais Stival** (stival2112@gmail.com) tem **só o módulo `QUALIDADE_CAMPO`** — 04/09/2026. Pedido
dela ("não apareceu nada na minha tela") quase sempre significa que a mudança foi só para o
formulário do computador. Rotas que ela usa têm de aceitar `PERFIS_CAMPO` (foi o caso da prévia do
PDF, que exigia ADMIN/QUALIDADE e dava 403).

**04/09/2026 — o perfil de campo passou a entrar em `/qualidade/inspecoes`** (lista e detalhe) sem
ganhar o módulo QUALIDADE inteiro, que abriria data book, SGQ, auditorias, calibração e CMR. O
resto de `/qualidade` continua fechado, a Sidebar mostra só "Inspeções" para ele, e **preencher ≠
fechar**: `podeFecharRelatorio` (lib/qualidade-campo.js) guarda enviar para assinatura e excluir
para ADMIN/QUALIDADE. Então **o ajuste de pintura continua tendo de ir nos DOIS formulários**.

Ver [[torg_qualidade]].
