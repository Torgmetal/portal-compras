---
name: torg-portao-modulos
description: "Portal Torg — o portão por módulo vive em lib/portao-modulos.js; rota sem linha lá cai em erro genérico, não em /sem-acesso"
metadata:
  node_type: memory
  type: project
---

**Quem decide se alguém abre uma rota é `moduloNegado()`, em `lib/portao-modulos.js`** (descoberto
em 23/09/2026). O `middleware.js` só a chama: negou, redireciona para **`/sem-acesso`**, que escreve
qual módulo falta.

⚠⚠ **Rota SEM linha nessa tabela não fica bloqueada — fica QUEBRADA.** A recusa passa a vir do
`requireAcesso` dentro do Server Component, vira exceção e cai no `app/error.js`:
*"Algo deu errado. Tente novamente"* — numa tela em que tentar de novo nunca vai funcionar.
Foi o que aconteceu com `/fiscal`, que nunca tinha sido cadastrado: a Eduarda
(`financeiro@torg.com.br`, módulo FINANCEIRO) via o card Fiscal no seletor, entrava em Romaneios e
em Remessa Terceiro, e a Inteligência Fiscal dava erro.

⚠⚠ **E não dá para ramificar no `app/error.js`**: em produção o Next **apaga a mensagem** do erro
de Server Component (só o `digest` sobrevive). O tratamento de permissão tem que acontecer ANTES,
no middleware.

**Três lugares precisam concordar quando um módulo nasce ou muda:**

| Arquivo | O que decide |
|---|---|
| `lib/modulos-portal.js` | qual CARD aparece no seletor |
| `lib/portao-modulos.js` | quem ENTRA na rota |
| a própria página / rota de API | o que a pessoa VÊ e pode escrever lá dentro |

⚠ Eles podem divergir de propósito (`/rm` é aberto a todo mundo logado, e o card só aparece para
quatro módulos) — mas a divergência mora na lista `ABERTAS_DE_PROPOSITO` de
`testes/portao-modulos.teste.js`, com motivo escrito, nunca num `null` silencioso.

⚠ **`/api/...` NÃO passa pelo portão** (o caminho começa com `/api/`): cada rota mantém o seu
`requireAcesso`. O portão protege a navegação, não a escrita.

⚠⚠ **Módulos vivem no JWT e são gravados no LOGIN** (`lib/auth.js`, callback `jwt`, só dentro do
`if (user)`). Nunca são relidos do banco durante a sessão, que dura **7 dias**. Conceder um módulo
a alguém **não tem efeito até a pessoa sair e entrar de novo** — e ela vai jurar que continua sem
acesso. Diga isso junto da concessão. Ver [[torg-acesso-notificacoes]].

## "Ver" não é "agir" — o portão da rota não basta (24/09/2026)

⚠⚠⚠ **PEDIDO DE ACESSO VEM COM UM VERBO, E O VERBO É A ESPECIFICAÇÃO.** Matheus: *"libere para o
almoxarifado@torg.com.br o acesso a aba Prazos das RMs para ele conseguir **VER** quando chega os
materiais"*. A tela faz quatro coisas e só uma é ver:

| | |
|---|---|
| listar pedidos por RM com a previsão | ✅ é isto que ele pediu |
| **Sincronizar** | bate no Omie, divide a trava com os crons, pode disparar o `MISUSE_API_PROCESS` (bloqueia a conta ~30 min) |
| **Cobrar atrasados** | **manda e-mail ao fornecedor** — e e-mail não tem desfazer |
| **Aprovar/recusar** proposta | muda o prazo **e** avisa o fornecedor por e-mail |

Liberar a tela inteira daria ao almoxarife o poder de cobrar fornecedor e aceitar remarcação. O
portão (`/compras/prazos` → `nega("COMPRAS","ALMOXARIFADO")`) dá a **lista**; a caneta continua no
Compras, via `requireRole` nas três rotas de escrita.

⚠⚠ **ESCONDER O BOTÃO É OBRIGAÇÃO, NÃO ENFEITE**: a rota já recusaria, mas o botão à vista entrega
um **403 sem explicação** a quem não fez nada errado. A regra mora em UM lugar
(`app/compras/prazos/usar-pode-agir.js`) e **espelha** `requireRole(["ADMIN","COMPRAS"])` — inventar
a conta na tela faz ela e o servidor discordarem.

⚠⚠ **`hidden` POR CSS NÃO ESCONDE**: continua no DOM, navegável pelo teclado e clicável por script.
O primeiro teste que escrevi pegou isso — a correção é **não renderizar**.

⚠ **O LINK DA SIDEBAR TEM LISTA PRÓPRIA.** Item sem `modulos` em `components/Sidebar.jsx` cai no
padrão `["COMPRAS"]`: sem mexer nele, a pessoa entra digitando a URL e nunca acha a tela pelo menu —
que na prática é não ter acesso.

⚠ **Nem todo pedido de acesso é mudança de dado.** Eduardo já tinha o módulo ALMOXARIFADO; era só o
portão. Quando o módulo já existe no usuário, **não precisa deslogar** — a regra de "módulo só vale
no próximo login" vale para módulo CONCEDIDO, não para rota aberta.
