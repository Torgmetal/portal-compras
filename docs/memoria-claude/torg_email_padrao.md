---
name: torg_email_padrao
description: Padrão visual dos e-mails do portal — faixa navy
metadata: 
  node_type: memory
  type: project
  originSessionId: dcd073c6-4b21-46d4-b2d3-f4c7977df22a
---

**Todo aviso automático do portal usa o mesmo cabeçalho** (regra do Vitor, 17/07/2026, commit 6acee2c): faixa **navy `#0D1F3C`** + **filete laranja `#F4801F`** (4px) embaixo — a mesma linguagem dos PDFs (Data Book, Relatório de Status, Cronograma).

```
<div style="background:#0D1F3C;color:#fff;padding:18px 24px;border-radius:8px 8px 0 0;">
  <h2 ...>Título</h2>
  <p ...>Torg Metal · Estruturas Metálicas</p>
</div>
<div style="height:4px;background:#F4801F;"></div>
```

**Em e-mail NOVO use `cabecalhoEmail(titulo, subtitulo)` de `lib/email-layout.js`** (exporta também `EMAIL_NAVY`/`EMAIL_ORANGE`) — não repetir o HTML na mão, foi assim que a cor derivou. ⚠️ o título entra como HTML: escapar antes (`escapeHtml`).

Antes da padronização a cor estava espalhada: `#006EAB` na maioria, `#002945` em várias, `#0d1f3c` em 2 e **`#059669` (verde)** no assistente e no kick-off da OP.

**Só o CABEÇALHO é navy.** Corpo (`#f9fafb`), botões (`#006EAB`) e conteúdo seguem como estavam.

Ao varrer/auditar: cabeçalho = `border-radius: Npx Npx 0 0` (cantos só EM CIMA). Cuidado — `border-radius:[^"]*0 0` também casa `0 0 8px 8px`, que é o **corpo**, e `background:#006EAB;color:#fff` casa **botão** `<a>`. Os dois furos me deram falso positivo. Envio: `lib/email.js` (`sendEmail` com `to/cc/replyTo/attachments/fromName`).
