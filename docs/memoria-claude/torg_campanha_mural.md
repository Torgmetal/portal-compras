---
name: torg_campanha_mural
description: Comunicado em vídeo com ciência obrigatória no login (MuralAviso + MuralCiencia); estreou no Setembro Amarelo 2026
metadata:
  type: project
---

O mural do RH emite **comunicado em vídeo com ciência obrigatória**: `MuralAviso` (videoUrl,
exibirLoginDe/Ate, dispensados) + `MuralCiencia` (por pessoa, com `assistiu` e motivo). O modal
(`components/AvisoVideoModal`) vive no layout raiz e some **por pessoa** quando ela assiste até o
fim — não por data. Botão "Lista de presença" no mural gera o PDF de quem não tem portal e arquiva
em `/RH/Workspace/Campanhas/<data> - <campanha>`. Estreia: Setembro Amarelo, 01–30/09/2026.

**Why:** três armadilhas custaram tempo e vão repetir. (1) Usuário **tipo=FUNCIONARIO leva 403** em
rota fora de `/meu-rh` — o vídeo não aparecia para a produção e **sem erro na tela**, porque o
componente engole a falha. (2) Imagem em `/public` usada em tela **sem sessão** (login, portal do
cliente) é redirecionada pelo middleware (307) e vira ícone quebrado: precisa entrar na exceção do
matcher. (3) Modal obrigatório **tem que liberar quando o vídeo falha**, senão wifi ruim tranca a
pessoa fora do portal.

**How to apply:** para a próxima campanha, criar a linha em `MuralAviso` com a janela em **horário de
Brasília** (o servidor é UTC) e a lista de `dispensados` — clientes saem pelo tipo, terceiros com
conta comum saem por e-mail. `?campanha=1` liga a parte visual fora de setembro para validar (dura a
sessão). Ver [[torg_funcionario_x_usuario]], [[torg_fuso_servidor]], [[torg_ui_capricho]].
