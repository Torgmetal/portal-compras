---
name: torg-pintura-pendencias-assinatura
description: "RIP de pintura não vai para assinatura com procedimento de preparo, data/horários ou inspeção visual de demão aplicada em branco (29/09/2026); o que conta como demão aplicada; por que RIP antigo não tem horário final"
metadata:
  type: project
---

Geraldo (29/09/2026): *"RIP 089-002 não está puxando o horário final"* — e depois o procedimento, e o
"APROVADO" da 2ª e 3ª demão no 089-003. **Não era o PDF**: ele imprime o que está gravado
([[torg_pdf_mostra_o_gravado]]), e os campos nunca tinham sido gravados. Os dois RIPs foram DUAS vezes
para assinatura assim e voltaram pelo assinante (Davi; depois o Alexandre: "falta preencher procedimento
e horário final"). O reenvio saiu 7 min depois da devolução, sem nenhuma gravação no meio — o AuditLog
não tem `EDITAR_RELATORIO_INSPECAO` nem `MEDIR_RELATORIO_CAMPO` entre os dois.

**Por que estavam vazios:**
- **Horário final (`hFim`)** — até 22/09/2026 (`bf32c164`) o celular tinha UM campo "Horário" por demão,
  gravado como `hIni`. RIP preenchido no campo antes disso não tem `hFim`: eram 7 de 12 em 29/09
  (071-001, 085-001, 089-002, 089-003, 103-002, 103-003, 106-002). Não há de onde tirar — a hora real é
  do inspetor; nunca preencher por conta própria.
- **Procedimento da PREPARAÇÃO (`prepProcedimento`)** — não confundir com `procedimento` (cabeçalho, "PO-05
  … R3", que vinha preenchido). Só o PLP (`preparoMetodo`) o preenchia, e o celular apenas MOSTRA esse
  campo; OP sem PLP (071, 085, 089, 103) nascia em branco. Desde 29/09 nasce com
  `PLP_PADRAO.preparoMetodo` ("Jateamento abrasivo", PO-05) em `valoresIniciaisInspecao` — o PLP que diz
  outro método prevalece, e o snapshot `padroesInspecao.plp` NÃO ganha o padrão (não finge que o PLP
  especificou). Só relatório NOVO.
- **Inspeção visual** — o campo existe no celular desde 22/08; o inspetor marcou só a 1ª demão.

**A trava (29/09, Vitor: "não deixar ir para assinatura sem esses campos preenchidos"):**
`pendenciasPintura` (`lib/pintura-campos.js`), chamada por `pendenciasParaAssinatura` — a mesma que barra
o dimensional sem cota. Vale no servidor (409 na rota de assinatura, só no PRIMEIRO envio; abrir revisão
zera `envioAssinaturaId`, então volta a valer), na lista (botão Enviar desabilitado com o que falta) e no
detalhe (painel "pontos para conferir").
- Cobra `prepProcedimento` sempre e, em cada demão APLICADA, data, horário inicial, horário final e
  inspeção visual.
- ⚠⚠ **Demão aplicada = tem algo além do que o relatório NASCE trazendo** (produto, fabricante, cor,
  método — vêm do PLP e da memória da OP para as demãos previstas) **ou tem leitura de espessura**. Contar
  o pré-preenchido barraria o relatório que cobre só o fundo. A lista é `CAMPOS_DEMAO_DA_OBRA`, a MESMA
  que a memória da OP (`padroes-inspecao.js`) usa — campo novo lembrado por obra entra lá e a trava acompanha.
- Aderência (depende do PIT) e condição ambiental da demão (herda a do jato) ficam de fora.
- Relatório já enviado não é barrado; o próximo envio depois de uma revisão é.

⚠ A tela do computador cortava cada valor da demão em 60 caracteres (o celular, 300): salvar no computador
apagava lote de lista longa. Unificado em `LIMITE_VALOR_DEMAO` (29/09); nenhum RIP tinha passado de 60.

Ver [[torg_pintura_duas_telas]].
