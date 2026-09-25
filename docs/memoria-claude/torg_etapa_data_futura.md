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

## Etapa "Entrega" e o histórico de remarcação no cartão (24/09/2026)

- **`ENTREGA`** ("Entrega" / "Entrega prevista") entrou em `ETAPAS` para anotar entrega combinada,
  muitas vezes parcial ("um item 29/09, o restante 15/10"). ⚠ Não marca "Chegou" (só
  `MATERIAL_RECEBIDO` marca) e não muda a previsão: remarcar continua sendo "Data de entrega (previsão)".
- ⚠⚠ **O cartão dos Prazos só mostrava a remarcação do FORNECEDOR** (`origemDaPrevisao`, prefixo
  `[Fornecedor]`). A feita por dentro ficava no `PrazoHistorico` e sumia da tela — a data mudava sem
  rastro nem observação. Agora `historicoDaPrevisao` (`lib/historico-previsao.js`) lista todas, uma
  por linha, com de/para, quem e observação; a do fornecedor segue em âmbar.

## O mesmo 25/09 derrubou um teste de COMPONENTE — e o "hoje" do formulário é UTC (25/09/2026)

- ⚠⚠ **`testes/acompanhamento-data-entrega.teste.jsx` apodreceu igual à suíte de 16/09.** O caso
  "trocar para previsão… não para hoje" (escrito em 23/09) tinha o prazo do pedido em **25/09** e
  conferia `not.toBe(<hoje de verdade>)`: no dia 25 as duas datas coincidiram e ele falhou sem defeito
  na tela. Componente não recebe `hoje` por parâmetro, então o equivalente é fixar o relógio:
  `vi.useFakeTimers({ toFake: ["Date"] })` + `vi.setSystemTime(new Date("…T12:00:00.000Z"))`, com
  `vi.useRealTimers()` no `finally`. ⚠ **Só o `Date`**: com todos os timers falsos o `waitFor` do
  Testing Library fica sem os timers que usa. ⚠ **Meio-dia UTC**: é o mesmo dia em UTC e em São
  Paulo, e o componente usa os dois relógios.
- ⚠⚠ **PENDENTE — o padrão da ETAPA no formulário é `hoje()` em UTC** (`AcompanhamentoPedido.jsx`),
  não `hojeEmSP`. Medido com o relógio fixado: às **22h de Brasília** de 25/09 o campo já vem com
  **26/09** e a dica "Data futura" aparece no formulário intocado; às 10h vem 25/09. Entre 21h e
  meia-noite, quem lança "Material recebido" sem conferir a data grava o dia seguinte: até a
  meia-noite conta como previsto, e depois como chegada UM DIA DEPOIS (`atrasoDias` +1 — "chegou no
  prazo" vira "1 dia de atraso"). ⚠ O padrão da PREVISÃO está certo: prazo é `@db.Date` e formata em UTC.
