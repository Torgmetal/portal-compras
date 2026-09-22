---
name: torg-cliente-relatorio-consulta
description: "Portal Compras Torg — o cliente logado consulta o relatório de inspeção depois que TODOS assinam, se a obra estiver liberada para ele; antes disso o espaço só mostra o que foi endereçado a ele"
metadata:
  type: project
---

**22/09/2026.** Vitor, sobre **Renato Massano** (inspetor de qualidade da TMSA, contato da OP-105,
login de cliente): *"vamos manter assim, apenas deixe disponível para ele consultar quando o Davi
assinar"*.

**O que ele via:** a OP-105 aparecia e a lista de documentos saía **vazia**. Não era defeito — o
espaço do cliente mostra o que foi **enviado para a pessoa assinar**, e o único relatório da obra
(RPM-105-002, pré-montagem, emitido 21/09) foi endereçado a `pinho.davi@tmsa.ind.br` e
`qualidade@torg.com.br`. O Renato tinha **zero** `AssinaturaDocumento`, zero data book e não estava
entre os 13 destinatários do portal da obra.

A regra de leitura mora em **`lib/cliente-relatorios.js`** (`obraLiberadaPara`, `cicloConcluido`,
`documentoDeConsulta`, `relatoriosParaConsulta`), usada pelo `/api/cliente/meu-espaco` e pela rota
nova `/api/cliente/relatorio/[id]/pdf`.

- ⚠⚠ **SÓ DEPOIS DE TODAS AS ASSINATURAS.** Documento em circulação ainda pode voltar para revisão;
  mostrá-lo faria o inspetor do cliente conferir uma versão que a Torg ainda não fechou.
- ⚠⚠ **NÃO DÁ PARA CONFIAR SÓ NO `EnvioAssinatura.status`**: quem assina grava `"CONCLUIDO"` num
  update com `.catch(() => {})` (`app/api/assinar/[token]/route.js`). As assinaturas é que são o
  fato; o status vale como atalho, e `REVISAO_PEDIDA` manda mais que as assinaturas colhidas.
- ⚠ **Só obra LIBERADA** — contato da OP ou `clienteEmail` (o mesmo conceito de
  [[torg_cliente_obras_liberadas]]). Quem chegou à obra por ter assinado UM documento continua
  vendo só o que é dele: entrar numa assinatura não é ganhar a obra inteira.
- ⚠ **Consulta não é pendência**: fica fora do contador "a assinar" e do topo da lista, e o cartão
  sai com a tarja cinza "para consulta", sem o link de assinar.
- ⚠ **A rota do PDF não tem token** — a autorização é a sessão (`requireUser`) mais a mesma dupla
  de regras. Ela passa `exigirOp` para o gerador, então id trocado no meio do caminho não entrega
  documento de outra obra. `Cache-Control: no-store`.
- ⚠ O relatório guarda o número da obra como ela o escreve ("67" e "067" convivem): a busca usa
  variantes, senão a lista fica vazia por causa de um zero à esquerda.

⚠ **Não muda nada para quem já recebia o documento**: o que é endereçado a ele continua vindo pela
assinatura, com o link — e o mesmo envio não aparece duas vezes.
