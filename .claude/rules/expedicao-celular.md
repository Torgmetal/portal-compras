---
paths:
  - "app/expedicao/layout.js"
  - "components/SidebarExpedicao.jsx"
---

## Este módulo abre no celular (e é o único)

`app/expedicao/layout.js` é `md:ml-64`, e o `SidebarExpedicao` vira gaveta abaixo de `md`. Os
outros 15 layouts continuam `ml-64` fixo — no telefone a barra come a tela inteira. Se algum dia
outro módulo precisar de campo, o padrão a copiar é esse par de arquivos.
