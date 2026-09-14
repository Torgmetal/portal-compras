---
name: torg_input_perde_foco
description: "Clicar número por número" = input que perde o foco a cada tecla porque o campo é um componente definido DENTRO do componente-pai; usar useComponenteEstavel (lib/react-estavel.js) ou hoist para o módulo
metadata:
  type: feedback
---

**Componente definido dentro de outro componente (`const Campo = (props) => <input …/>` no corpo do
pai) é função NOVA a cada render → para o React é outro tipo → ele desmonta o `<input>` a cada tecla e
o foco se perde.** Quem digita tem de clicar de novo para cada caractere.

**Why:** Vitor (14/09/2026), Qualidade: "alguns campos estamos tendo que clicar número por número, um
deles é no lote da tinta, no preenchimento do relatório". Era `SelLote` em `app/campo/Pintura.jsx`
(relatório de pintura do campo, da Lais) e o mesmo padrão em FormPintura, FormUS (`Campo`, `N`),
FormLP, FormEVS e PlpPainel (`Inp`) — todo campo de texto/número dessas telas sofria.

**How to apply:**
- Nunca definir componente com `<input>`/`<select>` dentro de outro componente. Ou hoista para o
  módulo (passando o que precisa por props), ou envolve com `useComponenteEstavel(render)` de
  `lib/react-estavel.js` — a função de desenho continua fechando sobre o estado do pai, mas o
  componente devolvido nasce uma vez só (lê a função mais nova por ref).
- Chips/badges inline (`StatusChip`, `Tab`) não doem: não guardam foco. O problema é só em campo editável.
- Teste que pega: `testes/campo-pintura-foco.teste.jsx` — digita duas vezes e confere que
  `document.activeElement` continua sendo o mesmo `<input>`.
- Relacionado: [[torg_pintura_duas_telas]], [[torg_ui_capricho]].
