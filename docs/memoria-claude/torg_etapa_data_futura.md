# Etapa com data futura é previsão, não acontecimento

`lib/acompanhamento-pedido.js` → `etapaPrevista(data, hoje)` e `linhaDoTempo(pedido, { hoje })`.
Vale para as duas telas que desenham a linha do tempo (RM e Prazos das RMs) e para a situação do
pedido (`lib/painel-prazos-rm.js`).

⚠⚠⚠ **MEDIDO EM 24/09/2026: 7 DOS 10 LANÇAMENTOS DE ETAPA TINHAM DATA FUTURA** — todos "Liberado para
coleta", com observações como *"entrega até terça"*. O comprador anotava o que o FORNECEDOR prometeu,
e a tela escrevia "Liberado para coleta em 28/10/2026" como coisa feita. Agora sai **"Coleta prevista
para 28/10/2026"**, com ícone de calendário. O próprio dia de hoje já conta como acontecido.

⚠⚠⚠ **O IRMÃO GRAVE: "material recebido" com data futura virava CHEGOU.** O pedido saía do vermelho,
da lista de atrasados e da **cobrança por e-mail** por causa de uma promessa do próprio fornecedor —
e ainda escondia a nota de entrada real do Omie. Nenhum caso no banco no dia; o furo estava aberto.
Agora `chegou`, `temRecebidoManual` e `chegada` só contam o que já aconteceu.

⚠⚠ **A CONFUSÃO DE FUNDO: lançar "liberado" com data futura NÃO muda a previsão.** Quem decide atraso
e cobrança é `prazoEntregaPrevisto`. O comprador achava que tinha remarcado a entrega, e a SOUFER
continuava "15 dias de atraso" e na lista de cobrança. O formulário agora avisa na hora: data futura
vira previsão, e remarcar é a opção **"Data de entrega (previsão)"**.

⚠ **"Hoje" é de São Paulo** (`hojeEmSP`), e a data da etapa é gravada à meia-noite UTC (é o dia
digitado). ⚠ E o painel passa o MESMO `agora` para a situação e para as etapas — dois relógios na
mesma linha fariam a etapa dizer "prevista" ao lado de um chip que já a trata como feita.

⚠ **Teste que usa data "de verdade" muda de sentido sozinho.** A suíte de 16/09 tinha "recebido em
25/09" como passado; virou amanhã e quebrou. As suítes agora fixam `hoje`/`agora`.
