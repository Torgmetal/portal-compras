---
name: torg-databook-revisao
description: "Data book emitido é documento — só muda por REVISÃO (R00→R01, zera assinaturas); validade congela na emissão; certificados puxam a ficha do CMR pelo R"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1754de4f-06da-423d-8c20-70c99cbd5bad
  modified: 2026-08-21T02:06:40.418Z
---

**Data book EMITIDO é documento, não rascunho.** Vitor (19/08/2026): *"uma vez esse documento emitido, ele valerá para sempre"* e *"os data books emitidos não mexa em nada; sempre depois de emitido você não deve permitir salvar sem gerar uma revisão, e se for revisão fazer o histórico da revisão e enviar para assinatura de todos novamente"*.

- `lib/databook-revisao.js` é o guarda único: `estaFechado(book)` (= tem `emitidoEm` **ou** status EMITIDO/ENVIADO_CLIENTE/ACEITO), `erroPrecisaRevisao()` (409 igual em todas as rotas — se cada uma inventar a sua, uma esquece e vira porta dos fundos) e `abrirRevisao()`. Aplicado em 9 rotas de escrita.
- `abrirRevisao` incrementa, volta a EM_MONTAGEM, limpa `aceiteEm/aceiteNome/aceiteIp/enviadoClienteEm` e **zera todas as assinaturas** — quem assinou a R00 não assinou a R01.
- Motivo é obrigatório (≥5 chars): revisão sem motivo é mudança sem rastro. Histórico em `DataBookRevisao`.

**Validade congela na emissão.** A coluna Validade mostra **a data**, nunca contagem ("Vence em 11d" mudava a cada geração do arquivo). Depois de emitido, sem vermelho/laranja — o data book é a fotografia do que estava válido naquele dia; o certificado vencer depois não o torna errado. O alerta colorido vale só EM_MONTAGEM.

**Certificado anexado ↔ ficha do CMR (`lib/databook-pdf.js`).** Quem monta anexa o PDF e o arquivo se chama pelo índice R → o documento nasce só com `nome: "R 260620"`. A §04 da OP-070 saía como 7 linhas de `R 260620 | — | — | Sem validade`. O CMR tem esses dados indexados pelo mesmo R: agora casa e a tabela mostra material com a bitola, corrida, nº do certificado, norma e fornecedor.
⚠ Só casa se o nome for **mesmo** um índice R (`/^r[\s._-]*\d{4,}/i`) ou o doc tiver `importRef` — senão `T70_-_ART_assinado` vira o R 70 de outra obra. Empate: ficha da própria OP ganha.

**PDF — armadilhas já corrigidas:** capa/rodapé tinham `Rev.00` fixo; a capa mostrava a data de HOJE como emissão; `emitido` só testava `status === "EMITIDO"`, então livro ACEITO saía "RASCUNHO" e baixava como `(rascunho)`. A revisão vai no nome do arquivo (baixar a R01 não pode substituir a R00 de quem já tinha). Rodapé global **pula a capa** (ela tem faixa de controle própria) e é curto de propósito — o selo ISO fica centralizado na mesma linha.

**Tabela do PDF (`drawTabela`)**: coluna com `wrap: true` quebra em até 3 linhas e a linha cresce junto. Abreviar com "…" apaga justamente a bitola, que é a informação — ver [[torg_ui_capricho]].

Relacionados: [[torg_qualidade]], [[torg_prontuario_certificados]], [[torg_calibracao]], [[torg_assinatura_doc]]


**Entrega ao cliente (24/08/2026):** duas portas, e a decisão do Vitor foi ligar a segunda.
1. **Cadeia de assinaturas** — Elaborador → Inspetor → Responsável Técnico → **Cliente** (4ª e
   última). Quem assina a última é o cliente, e é isso que grava `status: "ACEITO"` e dispara o
   e-mail com o link de download. Não é "todos assinam e então libera": é a assinatura *dele* que
   libera.
2. **Portal do cliente** ([[torg_apresentacao_cliente]]) — seção `DATABOOK`, ligada por padrão.
   Antes só LISTAVA os volumes (sem download) e **sem filtro de status**: bastava haver volume
   gerado. A OP-067 tinha 18 volumes de um livro `EM_MONTAGEM` que apareceriam inteiros (não
   chegou a vazar porque o portal dela estava em RASCUNHO). Agora o bloco só aparece com o livro
   `ACEITO` e cada volume **baixa** por `/api/portal/[token]/databook?volume=N` — proxy, não
   redirect, e só a **revisão corrente** (revisão zera as assinaturas; volume da R00 continua no
   Blob depois da R01).

⚠️ Gerar volume é passo à parte de aceitar: em 24/08/2026 o único livro `ACEITO` (OP-070) tinha
**zero volumes gerados**. Livro aceito sem volume = portal sem nada para entregar.

🚨 **Pedir revisão sem assinar (24/08/2026).** Vitor: *"um dos assinantes pediu uma revisão, mas não conseguimos, pois ele deve assinar para depois começar novamente"*. Não havia recusa: quem achava erro tinha de **assinar** — carimbar nome, data e IP num dossiê que sabia estar errado — só para o fluxo andar até dar para abrir revisão.

Agora `/data-book/assinar/[token]` tem **"Encontrei algo errado — pedir revisão"** (nome + motivo próprios, campo separado do de assinar) → `POST /api/qualidade/data-books/assinar/[token]/revisao`. Reusa `abrirRevisao` de `lib/databook-revisao.js`, então a regra segue num lugar só.
- **Qualquer um da cadeia, a qualquer momento**, tenha assinado ou não. Não exige ser a vez dele.
- Sobe a revisão, **zera todas as assinaturas**, volta o livro a `EM_MONTAGEM` e avisa por e-mail **todo o resto da cadeia** (`enviarEmailRevisaoPedida`) — quem já assinara precisa saber que a assinatura caiu. O solicitante não recebe.
- ⚠️ Os **tokens NÃO mudam** no `abrirRevisao` (só status/datas), então o link de cada um continua valendo. Quem recria a cadeia com tokens novos é o `POST /api/qualidade/data-books/[id]/assinaturas`, que exige o livro **fechado** — ou seja, a Qualidade tem de **reemitir** antes de reiniciar o fluxo.
- Dois pedidos quase juntos: o 2º é recusado com explicação, não sobe revisão duas vezes.
