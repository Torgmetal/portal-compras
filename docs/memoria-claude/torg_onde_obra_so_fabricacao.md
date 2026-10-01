---
name: torg_onde_obra_so_fabricacao
description: Portal do cliente, "Onde a obra está" — só tarefa do departamento FABRICACAO é fase da fábrica; "Diagrama de Montagem" (Engenharia) e departamento MONTAGEM (campo) liam como Montagem 100%
metadata:
  type: project
---

OP-118 (01/10/2026), print repassado ao Vitor pelo WhatsApp: o portal do **cliente** mostrava
**"Montagem 100% · 0 peças"** com a Preparação em 62% e a Solda em 0%.

- **Causa:** `lib/onde-obra-piso.js` deduz a fase pelo NOME da tarefa (`faseDaTarefa`, regex
  `/montagem/`) e o bloco pega o MAIOR percentual entre as tarefas da fase. O "Diagrama de Montagem"
  (Engenharia, 100%) entrava como a montagem da fábrica.
- ⚠⚠ **O sincronismo do Syneco já tinha essa trava** (`avancosDasTarefas` em `lib/cronograma-syneco`:
  só `FABRICACAO` recebe avanço do chão; ali está escrito "em cada chamador, o próximo esquece"). O
  bloco do portal era o caller que esqueceu. Corrigido em `cb0d7029`: `etapaDaTarefa` recusa tarefa
  de outro departamento, lendo `departamento` (tarefa crua) **ou** `setor` (a forma que o portal monta).
  Isso vale para o percentual e para o **piso declarado**: uma tarefa da Engenharia em 100% à mão
  empurraria todas as peças para a Montagem.
- **Afetava também** os portais publicados da OP-089, 102 e 113, onde o "Diagrama de Montagem" estava em
  100%. Além disso, tarefas do departamento **MONTAGEM** (montagem em campo, OP-083/084) eram lidas como a
  montagem da fábrica.
- Tarefa **sem** departamento (cronograma antigo) segue valendo pelo nome.
- Conferido com a mesma conta da rota, dados reais: o código antigo reproduz o print exatamente
  (752 peças · 81.613 kg · Montagem 100% · 0 peças); o novo dá Montagem 0%.

Ver [[torg_cronograma_syneco]], [[torg_etapa_conjunto_croqui]].
