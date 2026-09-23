# "Codex: aceito sempre" — e o que isso NÃO dispensa

Matheus (22/09/2026): *"Codex: aceito sempre"*, junto de *"o P1 do Vitor remova de nossa
dependência, ele vai seguir ajustando"*.

## O que mudou

Quando o hook Stop devolver `decisao_humana` — pendência que já foi encaminhada e cujo dono é
outra pessoa —, **não é preciso parar e perguntar de novo**. A mensagem seguinte começa com
`codex: aceito <motivo>`, o motivo diz de quem é a pendência, e o trabalho segue.

⚠⚠ **ISSO NÃO É APROVAÇÃO DO CODEX, E O PRÓPRIO FLUXO DIZ ISSO.** "Aceito" encerra o ciclo
*aceitando que a pendência existe*; não transforma um achado aberto em achado resolvido, e não
vale como validação fiscal, jurídica ou de tela.

## O que NÃO mudou

- ⚠⚠ `resultado: "corrigir"` continua exigindo correção. A aceitação é para pendência de terceiro
  ou decisão humana, **nunca** para achado no código que eu escrevi.
- ⚠ O hook não se desativa nem se contorna para passar na revisão.
- ⚠ Máximo de 2 ciclos de correção por tarefa; sem solução, parar e reportar.

## O P1 dos avulsos saiu da nossa lista

`app/comercial/[id]/AbaExpedicao.jsx:617` (commit `498199259d`) — avulso perde identificação ao
reabrir o romaneio. **É do Vitor e ele está ajustando.** Não aparece mais como pendência nossa em
`docs/revisao-codex-claude.md`; se o Codex apontar de novo, a resposta é que o dono é ele.

Ver [[torg_codex_aprova_antes]] e [[torg_revisao_codex_fluxo]].
