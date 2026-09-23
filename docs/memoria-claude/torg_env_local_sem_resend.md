---
name: torg-env-local-sem-resend
description: "Portal Compras Torg — o .env.local do Mac tem RESEND_API_KEY VAZIO: script local que 'reenvia' convite ou e-mail falha em silêncio; e-mail real só sai pela Vercel"
metadata:
  type: project
---

**Medido em 23/09/2026** (agente da varredura de assinaturas): em 21/09 às 21:44–21:45 houve **15
tentativas de reenviar convites de assinatura** por um script rodado localmente — todas falharam com
`"RESEND_API_KEY nao configurado"` (`lib/email.js:46`), porque o `.env.local` tem a chave **vazia**
(tamanho 0). Nada foi enviado, e o convite do Alexandre para os EVS/LP da OP-102 ficou parado dois dias.

⚠⚠ **Script local NÃO manda e-mail.** Qualquer "corrigir e reenviar" feito por script precisa ser
seguido do reenvio PELA TELA (Vercel), ou o destinatário nunca fica sabendo. E o script deve ler o
retorno de `sendEmail` — `{ ok:false }` não lança exceção, então "rodou sem erro" não quer dizer "saiu".

⚠ Não é para "consertar" preenchendo a chave no `.env.local`: o dev local roda contra a produção, e
um e-mail disparado de teste chegaria ao cliente de verdade (ver CLAUDE.md, aviso de arquitetura).

Ver [[torg_relatorio_quadros_assinatura]], [[torg_assinatura_doc]].
