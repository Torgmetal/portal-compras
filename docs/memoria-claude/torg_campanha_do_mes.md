---
name: torg_campanha_do_mes
description: "Campanha do mês (Setembro Amarelo, Outubro Rosa…) é uma linha do calendário em lib/campanha.js; troca sozinha pelo dia de Brasília; imagens em public/campanhas/<id>/ liberadas no middleware; material no SERVIDOR em Marketing/Workspace/Torguinho"
metadata:
  type: project
---

Vitor (30/09/2026): *"para amanhã precisamos mudar nossa campanha de marketing pois começa o Outubro Rosa
(…) tem que ser horário de Brasília"*. Desde então a campanha é um **calendário** (`CAMPANHAS` em
`lib/campanha.js`): uma linha por campanha com mês, nome, laço, Torguinho, slogan e cores.

- **Onde aparece:** laço no login (`WorkspaceAcesso`) e no menu (`SidebarModuleSwitcher`), Torguinho de laço
  no chat interno e no do portal do cliente, faixa nas telas do cliente (`FaixaCampanha`), selo no portal da
  obra (`SeloCampanha`), cabeçalho do vídeo do mural (`AvisoVideoModal`) e selo no rodapé de todo e-mail
  (`cabecalhoEmail`). Nenhuma tela tem a campanha escrita à mão.
- ⚠⚠ **Troca pelo dia de BRASÍLIA** (`hojeBRT`): a virada é 00h00 de Conchal, não 21h (meia-noite UTC).
  Vale para qualquer ano — volta sozinha no mês dela.
- ⚠ **Imagens em `public/campanhas/<id>/laco.png` e `torguinho.png`**, e a pasta `campanhas` está na
  exceção do `matcher` do middleware: o laço aparece no login, no portal do cliente e no e-mail, onde não há
  sessão (sem a exceção vira imagem quebrada). O `/laco-setembro.png` antigo ficou pelos e-mails de 2026.
- ⚠ **Cores inline (style), nunca classe**: o Tailwind não gera classe de cor que vem de uma tabela.
- **Prévia:** `?campanha=<id>` mostra a campanha antes da data (`?campanha=outubro-rosa`), `?campanha=1` a do
  mês, `?campanha=0` desliga; dura a sessão da aba.
- **Material:** SERVIDOR → `Marketing/Workspace/Torguinho/<Campanha> - <ano>` (Laço X.png + Torguinho Laço
  X.png). Já existem **Novembro Azul - 2026** e **Torguinho Natal** — para ligar, é uma linha nova no
  calendário + as duas imagens.
- ⚠ **Os originais são RETRATO** (≈1100×1400) e as telas desenham em caixa quadrada: sem enquadrar, esticam.
  Reduzir para 192 px (laço) e 512 px (Torguinho) **centralizado em quadrado transparente**. Neste Mac não
  há Pillow, sharp nem ImageMagick — foi feito com um script Swift/AppKit (`NSBitmapImageRep`).
- ⚠ **O `preview_start` sobe o CHECKOUT PRINCIPAL, não a worktree** — validar tela de uma worktree por ali
  mostra o código antigo. Validado em jsdom (`testes/campanha-telas.teste.jsx`) e, depois do deploy, no
  portal no ar com `?campanha=outubro-rosa` na tela de entrada (pública).
- Slogan do Outubro Rosa **aprovado pelo Vitor** (30/09/2026): "A Torg Metal apoia a prevenção do câncer de
  mama." — mesmo registro do Setembro (a Torg apoia; sem telefone nem instrução médica na frente do cliente).

**Banner do primeiro acesso** (`components/BannerCampanha`, 30/09/2026): campanha com `banner` no calendário abre
uma janela UMA vez por aparelho (localStorage `torg:campanha-vista:<id>:<ano>`), para equipe E clientes.
- ⚠⚠ Texto aprovado pelo Vitor, com a **arte do laço** (ele preferiu à do Torguinho) e **sem mencionar câncer de
  mama em homens** — pedido explícito dele. Fala com as mulheres (cuidar de si, conversar com o médico) e com os
  homens (levar a conversa para casa). Sem idade/frequência de exame: orientação médica não é papel da Torg.
- Não abre em login, assinatura, ata, aceite do data book nem na conferência de peça no pátio (tela cheia no
  celular). A prévia mostra sempre, mesmo já dispensado.
- ⚠ Teste com `localStorage`: o Node 26 não traz — usar `vi.stubGlobal("localStorage", …)` como os outros testes.

Ver [[torg_campanha_mural]] (o vídeo com ciência obrigatória, que é outra peça, por data no banco).
