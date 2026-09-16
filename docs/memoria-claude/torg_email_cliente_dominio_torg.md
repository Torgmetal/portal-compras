---
name: torg_email_cliente_dominio_torg
description: Contato de CLIENTE digitado com @torg.com.br (duas vezes na OP-106 em setembro/2026) — o e-mail "sai sem erro" e ninguém recebe; conferir domínio antes de dizer que enviou
metadata:
  type: project
---

Dois incidentes na OP-106 em setembro/2026 com a mesma causa: o destinatário do CLIENTE (TMSA)
foi digitado com o domínio **@torg.com.br** em vez de **@tmsa.ind.br** — no envio do data book
(ninguém recebeu) e no pedido de assinatura do RIP-106-002 R01 (Davi Pinho, `pinho.davi@torg.com.br`;
o contato da OP e o login dele no portal são `pinho.davi@tmsa.ind.br`).

**Por que engana:** o Resend aceita o envio (o domínio torg.com.br é nosso), o log diz
`falhas: []`, e o portal do cliente (`/cliente`) casa a assinatura pendente **pelo e-mail da sessão** —
com o endereço errado o documento nem aparece para ele assinar. Parece "o cliente assinou e o carimbo
não saiu"; na verdade a assinatura dele estava na revisão anterior (R00), congelada quando a R01 abriu.

**How to apply:** ao investigar "não recebeu"/"assinou e não aparece", comparar o e-mail da linha de
assinatura (`AssinaturaDocumento.email`) com `OP.clienteContatos` e com `User.email` do cliente.
Corrigir a linha (audit `CORRIGIR_EMAIL_ASSINANTE`) faz o pedido aparecer no portal dele sem novo
e-mail. O data book já recusa cliente @torg.com.br (`avaliacao-cliente`); o envio de relatório para
assinatura ainda não avisa — candidato a guarda. Ver [[torg_databook_revisao]], [[torg_assinatura_doc]].
