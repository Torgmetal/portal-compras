---
name: torg_branch_de_outra_sessao
description: Outra sessão (Codex/Matheus) pode trocar o branch do repositório no mesmo diretório; conferir HEAD antes de commitar e commitar docs via worktree de main
metadata:
  type: feedback
---

Em 12/09/2026 dois commits de memória foram parar em `codex/producao-operacional`: uma sessão do Codex tinha feito
checkout desse branch no MESMO diretório minutos antes. `git push origin main` não subiu nada (o main local não
tinha mudado) e os commits ficaram num branch alheio, com o `versao-build.json` do hook dentro.

**Why:** o diretório de trabalho é um só, compartilhado com o Codex e com o Matheus; o HEAD pode mudar entre um
comando e outro. Commit em branch errado some da main, e o `versao-build.json` que o hook inclui vira conflito quando
o branch alheio for mesclado.

**How to apply:** antes de `git commit`, `git rev-parse --abbrev-ref HEAD`. Se não for `main`, NÃO trocar de branch
(a outra sessão tem alterações não commitadas ali): `git worktree add <tmp> main`, commitar ou cherry-pick lá,
`git push origin main`, `git worktree remove <tmp>`. Para tirar commits meus de um branch alheio: `git reset --mixed
<base>` e restaurar só os meus arquivos com `git checkout <base> -- <arquivos>` — nunca `reset --hard`, que apaga o
trabalho não commitado deles. Ver também [[torg_nao_sobrescrever_arquivo]].
