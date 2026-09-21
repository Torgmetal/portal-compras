---
name: torg_cliente_obras_liberadas
description: Como um login de CLIENTE passa a ver uma OP — é pelo e-mail nos contatos da OP; "liberar obras" no Admin › Usuários e "editar contatos" na aba Obra escrevem o mesmo `OP.clienteContatos`; e-mail principal da OP e assinaturas também abrem a obra
metadata:
  type: project
---

**Vitor (21/09/2026):** *"como eu vinculo as OPs para um usuário do cliente?"*, depois, na OP-122
(12 contatos da TMSA): *"eu não consigo adicionar novos e-mails"* e *"preciso deixar uma forma de
conseguir liberar as OPs que eu quero que ele veja"*.

**A regra (dele, de 28/08):** não existe cadastro "cliente × obra". O portal do cliente
(`/api/cliente/meu-espaco`) lista a obra quando o **e-mail do login** aparece nela: contato da OP
(`OP.clienteContatos`, salvo `apenasConsulta`), e-mail principal da OP (`clienteEmail`), assinatura
de documento, cadeia do data book, destinatário do portal público, responsável de plano.

**O que a Torg controla é o contato da OP** — é onde também ficam os papéis (Pedidos e
faturamento) e de onde saem os envios. Por isso as duas telas novas escrevem no mesmo lugar:

| Onde | O quê | Rota |
|---|---|---|
| Comercial › OP › aba Obra › **Editar contatos** | agenda: nome, função, e-mail, telefones (lista completa) | `PUT /api/comercial/op/[id]/contatos` |
| Admin › Usuários › (login CLIENTE) › **Obras liberadas no portal** | marca/desmarca OPs = põe/tira o e-mail dos contatos | `GET/PUT /api/admin/usuarios/[id]/obras` (`lib/cliente-obras.js`) |

⚠ **Obra que vem pelo e-mail principal da OP aparece travada** ("pelo e-mail da OP") — troca-se no
cadastro do Comercial, não ali. ⚠ Assinaturas/data book **não entram na lista de liberação**: são
histórico, não liberação; a obra continua aparecendo sozinha para quem assinou.

⚠ Até 21/09 a aba Obra só MOSTRAVA a lista; contato novo entrava pelo envio do cronograma
(`/api/planejamento/cronogramas/[id]/contatos-cliente`) ou dos planos. `atualizarContatosCliente`
(lib/contatos-cliente.js) agora carrega função/telefones **quando vêm** — quem manda só nome+e-mail
(o modal do cronograma) não apaga o resto. `emailAnterior` preserva papéis ao corrigir um e-mail.

Ver [[torg_acesso_notificacoes]] e [[torg_cronograma_envio_cliente]].
