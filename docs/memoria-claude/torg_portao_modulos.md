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
