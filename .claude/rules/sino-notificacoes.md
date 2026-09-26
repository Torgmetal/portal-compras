---
paths:
  - "components/NotificationBell.jsx"
  - "components/SidebarUserFooter.jsx"
  - "lib/notificacoes.js"
  - "app/api/notificacoes/**"
---

## O sino (notificações)

`components/NotificationBell.jsx`, no rodapé de **toda** sidebar (`SidebarUserFooter.jsx`), ao
lado do nome. `lib/notificacoes.js` decide quem recebe; `app/api/notificacoes/route.js` (GET
lista as minhas, PATCH marca como lida) é só leitura/escrita do que já foi decidido.

⚠⚠ **ISTO JÁ EXISTIU, MORREU E VOLTOU.** Vitor (30/08/2026), ao remover: "prisma.notificacao só
aparecia no create — nenhuma tela, API ou cron lia de volta (…) a tela `/compras/notificacoes`
foi apagada, ninguém lia. Se um dia o sino voltar, o histórico está lá e os writes voltam pelo
git." As 541 linhas antigas continuam no banco, intocadas — não foi problema de dado, foi não
ter onde ler. Desta vez o sino mora em **toda** sidebar, com contador, não atrás de um link.

⚠⚠ **POR MÓDULO OU POR PESSOA, NUNCA GLOBAL.** A versão antiga gravava uma linha só, sem
destinatário — se o sino tivesse existido, RH e Financeiro veriam "Nova RM". Agora o destinatário
é resolvido **na criação** (`criarNotificacao({ destinatarios, modulos })`), materializado em
`NotificacaoDestinatario` — uma linha por (notificação, pessoa), cada uma com sua própria
leitura. Módulo resolve para `UserModulo` ativos + ADMIN sempre (mesma regra do `requireRole`).
Sem `destinatarios` nem `modulos` resolvendo gente, a notificação **não é criada** — perder o
evento silenciosamente é pior que logar o erro.

⚠ `Notificacao.lida`/`lidaEm` (o par antigo, no singular) é **legado morto**, não a fonte da
verdade nova — um booleano só não serve para "vários destinatários, leitura independente".

**Os 5 emissores restaurados** (existiam antes de 30/08, removidos junto com a tela, trazidos de
volta pelo git com o destinatário certo desta vez):

| Evento | Rota | Quem recebe |
|---|---|---|
| RM criada | `app/api/rm/route.js` | módulo COMPRAS |
| Cotação respondida | `app/api/cotacao/submeter/[token]/route.js` | módulo COMPRAS |
| Cotação declinada | `app/api/cotacao/declinar/[token]/route.js` | módulo COMPRAS |
| Consulta de estoque criada | `app/api/rm/[id]/consulta-estoque/route.js` | módulos PRODUCAO + ENGENHARIA |
| Consulta de estoque respondida | `.../consulta-estoque/responder/route.js` | **só quem abriu** a consulta (pessoal, não módulo) |

O e-mail (`notificarEvento`/`sendEmail`) continua rodando do lado de cada um — o sino é um canal
a mais, não substitui o Resend.
