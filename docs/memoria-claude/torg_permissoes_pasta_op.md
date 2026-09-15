---
name: torg_permissoes_pasta_op
description: "Acesso às subpastas da OP no SharePoint é por usuário individual, nunca por grupo; 'Acesso Limitado' engana a contagem; OP nova nasce liberada e o molde OP-000 não protege"
metadata:
  type: project
---

Matheus (14/09/2026): *"remover o acesso do Leandro novo funcionários de algumas pastas
específicas como COMERCIAL, COMPRAS, MEDIÇÃO, SEGUROS, GARANTIAS"* em todas as OPs vigentes.
Feito em 138 subpastas de 29 pastas de OP (`/sites/TorgMetal/SERVIDOR/Ordem de Servico/01. OP`),
com `scripts/permissoes-sharepoint.mjs`.

⚠⚠ **O ACESSO É POR USUÁRIO INDIVIDUAL, NÃO POR GRUPO** — `PrincipalType: 1` nas 138 ocorrências.
Passei um bom tempo desenhando em volta do medo de que remover alguém derrubasse o grupo de 29
membros junto. Não é o caso nesta biblioteca: cada pessoa está na ACL pelo próprio nome, e a
remoção não toca em mais ninguém. **Medir antes de projetar a defesa.**

⚠⚠ **"ACESSO LIMITADO" NÃO É ACESSO, E ENGANA A CONTAGEM.** É marcador que o SharePoint cria
sozinho para dar passagem até um item permitido lá embaixo, e recolhe sozinho quando a herança é
quebrada. Uma pasta caiu de **53 para 21 principais sem ninguém perder acesso de verdade**: dos 53,
só 22 tinham papel real (Colaboração/Controle Total). Comparar o total de principais antes/depois
acusa desastre onde não houve — compare só quem tem papel real.

⚠⚠ **O APP DO PORTAL NÃO DÁ CONTA, E NÃO ADIANTA TENTAR.** `Torg Portal SharePoint` tem
`Sites.ReadWrite.All`; quebrar herança exige `Sites.FullControl.All` na **API REST do SharePoint** —
o Graph não expõe `breakroleinheritance` em versão nenhuma. Some-se que `AZURE_*` está marcada
**Sensitive** na Vercel: `vercel env pull` devolve `[SENSITIVE]` para todo mundo, inclusive para o
dono da conta. A saída foi a ponte pelo navegador (`entrar` abre o M365 no WSLg e guarda a sessão
num perfil fora do repo): quem escreve é a sessão do Matheus, com a permissão dele, e o log do
SharePoint registra o nome dele.

⚠ **`copyRoleAssignments=true, clearSubscopes=false`** — copia todo mundo ao quebrar a herança e
preserva ACL de subpastas mais profundas. E **nunca restaurar herança automaticamente** quando um
passo falha: devolver a herança devolve justamente o acesso que se queria tirar (Codex, 14/09).

⚠⚠ **OP NOVA NASCE LIBERADA, E O MOLDE NÃO RESOLVE.** O portal **não** cria essa estrutura — ele só
grava dentro de pastas que já existem. Quem cria a pasta da OP com as 10 subpastas é uma pessoa,
copiando a `OP-000 - PADRÃO`; e **cópia no SharePoint não leva permissão única junto** (o que é
copiado herda do destino). Deixei o molde limpo, mas isso não protege ninguém: cada OP nova precisa
de uma passada do script. Enquanto ele roda em menos de um minuto e é idempotente, isso é aceitável;
o conserto de verdade é o portal aplicar a regra ao criar a pasta.

⚠ **`remover` sem `--aplicar` é ensaio** — imprime o que faria e sai. É onde se descobre que o
filtro pegou pasta demais **antes** de pegar. O `--diario` grava a ACL de todas as pastas antes da
escrita, e é o que serve de rollback.

⚠ **O que a remoção NÃO cobre:** arquivo ou subpasta **dentro** das cinco que tenha ACL própria
concedida à pessoa sobrevive à remoção no nível da pasta (Codex). Não varri isso — se um dia
importar, é a mesma consulta um nível abaixo.

Relacionado: [[torg_sharepoint_servidor]], [[torg_op_pastas_servidor]].

⚠ **CONCEDER acesso o app do portal CONSEGUE, pelo Graph** (15/09/2026): `POST
/drives/{drive}/items/{item}/invite` com `{ recipients:[{email}], roles:["write"], requireSignIn:true,
sendInvitation:false }` — é o "compartilhar com pessoas" do SharePoint, e funciona com
Sites.ReadWrite.All (feito para `SERVIDOR/Almoxarifado` → expedicao@torg.com.br, a pedido do Vitor;
a pasta já tinha permissão própria com 8 pessoas). `GET …/permissions` também lê a ACL sem
navegador. O que continua exigindo a ponte pelo navegador é QUEBRAR herança/REMOVER em massa
(breakroleinheritance na REST). Script de leitura/concessão: `$S/sp-almox-*.mjs` da sessão —
vale virar comando `conceder` no `permissoes-sharepoint.mjs`.

