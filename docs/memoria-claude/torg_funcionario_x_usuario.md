---
name: torg_funcionario_x_usuario
description: "Quem tem acesso ao portal" não sai de Funcionario.usuario — o vínculo só é preenchido no autoatendimento; cruzar por e-mail
metadata:
  type: project
---

Para saber quais funcionários têm acesso ao portal, **não basta `Funcionario.usuario`**. O vínculo
`User.funcionarioId` só é preenchido quando o RH gera o acesso de autoatendimento (tipo=FUNCIONARIO).
Medido em 30/08/2026: **70 funcionários ativos, só 8 com vínculo**, e 30 usuários no portal.

**Why:** a Diretoria inteira (Vitor, Guilherme, Fabrine, Caio) tem login e caiu numa lista de
"quem não tem acesso" — 62 nomes em vez de 58. Erro silencioso: nada quebra, o número é que fica errado.

**How to apply:** cruzar também por e-mail (`Funcionario.email` × `User.email`, minúsculo e sem
espaços). Em lista de papel/presença, errar para MAIS é seguro (assina duas vezes); errar para menos
deixa alguém sem registro. ⚠ NÃO dá para separar interno de externo por domínio: **11 funcionários
reais usam gmail/hotmail pessoal** — a regra por domínio excluiria a fábrica. Ver [[torg_campanha_mural]].
