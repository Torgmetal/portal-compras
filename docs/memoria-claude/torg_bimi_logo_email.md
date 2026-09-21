---
name: torg_bimi_logo_email
description: "Logo da Torg no avatar dos e-mails (no lugar do \"WT\") = BIMI; PARADO (Vitor deixou p/ depois 15/08)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1754de4f-06da-423d-8c20-70c99cbd5bad
  modified: 2026-08-15T14:37:52.761Z
---

Vitor quer o **logo da Torg no avatar do e-mail** (o círculo verde "WT" que o Gmail/Outlook geram das iniciais de "Workspace Torg"), sem o destinatário cadastrar nada. **Não dá pra fazer pelo conteúdo do e-mail nem pelo portal** — quem mostra o logo é a caixa do destinatário, e o padrão é o **BIMI** (DNS + certificado). **PARADO — Vitor deixou p/ depois (15/08/2026).**

**Diagnóstico do torg.com.br (dig, 15/08):**
- DMARC: `p=quarantine` ✓ (pré-requisito do BIMI, já atende). ⚠️ `rua/ruf` estão com placeholder `seuemail@dominio.com` — Matheus trocar por e-mail real (não trava BIMI).
- DKIM Resend (`resend._domainkey`): configurado ✓ → e-mails do portal passam no DMARC via DKIM (SPF do domínio é só Outlook/M365 `include:spf.protection.outlook.com -all`, MX = Microsoft 365; Resend alinha por DKIM).
- BIMI: **não existe** registro em `default._bimi.torg.com.br` — é o que falta.

**Pra fazer (quando retomar):**
1. Logo em **SVG Tiny PS** (quadrado, sem script/animação, `baseProfile=tiny-ps`) hospedado em HTTPS. (Eu ofereci converter o logo da Torg + entregar o registro DNS pronto — não chegou a fazer.)
2. Registro DNS `default._bimi.torg.com.br` TXT (Matheus).
3. **Certificado VMC ou CMC (PAGO ~US$1.000/ano, DigiCert/Entrust)** — **Gmail e Apple Mail só mostram o logo com esse certificado**. VMC exige marca registrada (INPI); sem registro, usar **CMC** (Gmail aceita). Sem certificado: só Yahoo/Fastmail mostram; Gmail/Apple não; Outlook suporte parcial.

Conclusão: é tarefa de **DNS (Matheus) + compra de certificado**, não do portal. Falta Vitor confirmar se o logo é **marca registrada** (define VMC vs CMC). Gravatar no remetente = paliativo (aparece em alguns clients, NÃO no Gmail).
