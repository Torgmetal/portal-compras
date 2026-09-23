---
name: torg-relatorio-quadros-assinatura
description: "Portal Compras Torg — quem assina em qual quadro do relatório de inspeção é UMA regra (lib/assinatura-quadros.js): papel do convite pela posição, cada assinatura num quadro só, inspetor = aprovador vira um quadro"
metadata:
  type: project
---

**23/09/2026.** Vitor: *"notei que alguns estão com o Geraldo duplicando a assinatura"*.

⚠⚠ **ERAM DUAS CÓPIAS DA MESMA REGRA, E UMA FICOU PARA TRÁS.** O gerador do dimensional (que também
desenha a **pré-montagem**) tinha o seu próprio casamento assinante × quadro: cada coluna procurava de
novo na lista inteira, por pedaço do nome — e **"Torg Metal" está dentro de "Inspetor Torg Metal" E de
"Fiscalização Torg Metal"**. Os 5 RPM (103-001..004, 105-002) saíram com a mesma assinatura nos dois
quadros. O formulário comum já tinha sido consertado em 04/09 (dbccdd81); a cópia não.

A regra agora mora em **`lib/assinatura-quadros.js`** (`quadrosDeAssinatura`), e os dois desenhos
(`blocoAssinaturas` em `lib/relatorio-form-pdf.js` e o bloco do `lib/relatorio-dimensional-pdf.js`) só
desenham o que ela devolve:
- **cada assinatura ocupa UM quadro** (conjunto de usados);
- ⚠⚠ **o papel do convite vai pela POSIÇÃO**: a tela de envio oferece "Inspetor", "Torg Metal" e
  "Cliente", e todo modelo tem as colunas nessa ordem (quem inspecionou · a Torg que aprova · o cliente).
  Casar por pedaço de nome fazia a coluna depender da ORDEM ALFABÉTICA de quem assina — no RIP-089-002
  o Geraldo saía como "Inspetor de Qualidade" de uma inspeção do Alexandre, e **o Davi (TMSA) se recusa
  a assinar essa composição** (recusou duas vezes em 19/09);
- papel livre continua casando por nome, e quem sobra ocupa a coluna vaga (senão a assinatura some);
- ⚠⚠ **quando o inspetor é quem aprova, os dois quadros viram UM** ("Inspetor Torg Metal · Fiscalização
  Torg Metal"), com a assinatura uma vez: houve um registro, uma data, um IP. Só com o MESMO nome, e não
  une ao contrário.

⚠ A mesma cópia antiga tinha um defeito pior, latente: com o convite padrão, **a assinatura do cliente
sumia** do dimensional. Ninguém foi atingido porque nenhum dimensional tinha sido enviado com os 3 papéis.

⚠ Todo gerador passa `{ inspetor: rel.inspetor }` para o bloco — é o que permite a junção.
Ver [[torg_assinatura_doc]], [[torg_relatorio_editar_assinado]].
