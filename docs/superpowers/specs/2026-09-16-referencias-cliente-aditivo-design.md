# Referências do cliente, aditivo como pedido novo e aviso aos setores — desenho (16/09/2026)

Vitor (16/09/2026): "precisamos ter campos para descrever as TAGs, OCs, TPR da TMSA (…) não está claro a
estrutura para um novo aditivo (…) e um aviso para os setores sobre esses aditivos"; "no caso dos clientes
que pedem outras numerações (…) vamos deixar amarrado esses termos?" → não; "sobre o aditivo lembre-se que
temos que criar linha de medição nova, linha de materiais novas como se fosse uma nova OP praticamente".

## Hoje
- `OP.refCliente` é um texto livre onde tudo do cliente vai parar (OP-105: 4 OCs + ETC + TAGs numa string).
- Cada cliente usa termos próprios: TMSA = TPR/OC/ETC/TAG; Danpower = ENC/PC; Marko = AF; Valmet = OC/TAG;
  QWS e Inpasa = número seco; Marko OP-108 = TDR + CNO.
- `Aditivo` tem número, descrição livre, prazo, proposta/estudo, itens de verba (AditivoItem) e receitas
  (OPReceita com "· aditivo N" na observação). Ao criar, só grava auditoria: nenhum setor é avisado.
- Kick Off já tem divulgação por e-mail + aceite por token + painel de cobrança (`/comercial/kickoffs`).

## Decisões
1. **Papéis fixos, palavras do cliente.** Quatro papéis: PROJETO (guarda-chuva: TPR, ENC, obra),
   PEDIDO (o que o cliente emite e o Fiscal fatura: OC, AF, PC), ITEM (ETC / item do pedido) e TAG
   (equipamento: TC 8011, SE-001). O rótulo de cada papel vem do **dicionário do cliente**.
2. **`Cliente`** (novo cadastro mínimo): nome, razão social, CNPJ, `termos` Json
   `{ projeto:{rotulo,exemplo,ativo}, pedido:{…}, item:{…}, tag:{…} }`. `OP.clienteId` opcional; OP.cliente
   (texto) continua. Cliente sem dicionário usa rótulos genéricos (Projeto / Pedido / Item / TAG).
3. **`OPReferencia`**: uma linha por código, com `papel`, `rotulo` (foto do termo na época), `codigo`,
   `descricao`, `valor`, `data`, `revisao`, `frente` (A/B/C, para TAG), `paiId` (TAG/ITEM dentro do PEDIDO),
   `aditivoId` (o pedido que veio com o aditivo). "Outros códigos" (TDR, CNO) = papel OUTRO com rótulo livre.
4. **`OP.refCliente` passa a ser derivado** das referências (PROJETO + PEDIDOs) sempre que elas mudam — os
   ~60 documentos que já imprimem `refCliente` continuam iguais. Sem referências, o campo manual vale.
5. **Aditivo = pedido novo do cliente.** Ganha `status` (RASCUNHO → DIVULGADO → EM_EXECUCAO → ENCERRADO),
   `valor`, `divulgadoEm/divulgadoPara`; suas referências (PEDIDO + ITEM/TAG) entram em `OPReferencia`
   com `aditivoId`. Como uma OP nova: **linhas de receita** (OPReceita, agora com `aditivoId`; sem estudo,
   nasce uma linha com o valor do aditivo), **linha de medição** (OPMedicao manual "Aditivo N — <pedido>"
   com `aditivoId` e o valor contratado, a ser vinculada ao pedido Omie depois) e **linhas de materiais**
   (AditivoItem, já existente) visíveis no bloco do aditivo.
6. **Aviso aos setores** reaproveita o Kick Off: `POST /api/comercial/aditivo/[id]/divulgar` gera o
   Comunicado de Aditivo (PDF padrão Torg), manda e-mail aos setores escolhidos (mesmo modal do Kick Off,
   `kickoff-destinatarios`), cria `AditivoAceite` (token por pessoa), sino para os módulos, status
   DIVULGADO, auditoria. Página pública `/aditivo/aceite/[token]`; painel `/comercial/kickoffs` lista os
   aditivos com pendências e cobra pelo mesmo botão.
7. **Tabelas novas por `scripts/ensure-mes-tables.mjs`** (nunca `prisma db push`).

## Fora deste passo
Importar TAGs da lista LX da TMSA (fica para a OP-122, com a lista em mãos); escopo por OP para usuários.
