---
name: torg_nao_sobrescrever_arquivo
description: "Conferir se o arquivo já existe ANTES de criar com `cat >` — sobrescrevi /pcp/solda, uma tela em produção"
metadata:
  type: feedback
---

**Criar arquivo com `cat > caminho` no Bash não avisa que o arquivo já existe — sobrescreve calado.** Em 01/09/2026 escrevi `app/pcp/solda/page.js` assim e destruí a tela "Programação de Solda" (`SetorClient`, com apontamento e furo de apontamento) que estava em produção. Só percebi porque o `git status` mostrou ` M` em vez de `??` — e já tinha subido.

**Why:** as ferramentas Write/Edit recusam sobrescrever arquivo não lido; o `cat >` do Bash não tem essa proteção, então o modo Bash-first tira justamente a rede que existe para isso. E como o portal tem muita tela fora do menu (`/pcp/solda`, `/pcp/montagem`, `/pcp/jato`… não aparecem na sidebar do PCP), "não está no menu" não é prova de que não existe.

**How to apply:** antes de criar arquivo novo com `cat >`/`>`, rodar `ls` no caminho (ou `git ls-files <caminho>`). Se existir, ler antes e decidir: editar, ou escolher outro caminho. E ao terminar, conferir se o `git status` traz `??` (novo) onde eu esperava novo — ` M` num arquivo que eu achava inédito é o sinal de que sobrescrevi algo. Ver [[torg_icloud_delecao]], que é a mesma família de erro: perder arquivo por comando que não pergunta.
