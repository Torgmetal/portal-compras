---
name: torg_lpc_chave_duplicada
description: LPC importada sob o NÚMERO da obra quando o arquivo mistura fases duplica as marcas que já existiam por fase; o import avisa e o Planejamento pode excluir a linha errada
metadata:
  type: project
---

**OP-83 (17/09/2026).** Vitor: *"a engenharia subiu uma nova lista pois encontrou um erro e o portal
não reconheceu isso e as peças erradas permanecem na fila do planejamento ainda"*.

Medido no banco: **628 de 864 marcas com mais de uma linha**, quase todas no par `83` + `083`, e
**83 conjuntos com DUAS linhas marcadas `naLPC`** — a antiga sob a frente (`T83A`, `T83B`, `T83C`,
`T83D`) e a nova sob `083`. Mesma quantidade nas duas, então não era erro de quantidade: era linha
repetida. A fila da Montagem mostrava cada um desses conjuntos duas vezes.

**Por que aconteceu.** A peça é única por `(opNumero, marca)`. `chaveParaOParser` usa a fase do nome
do arquivo; sem ela o parser deduz a fase pelas marcas. A lista corrigida cobria **várias fases ao
mesmo tempo**, então nenhuma fase isolada servia e sobrou o número da obra. `chaveAjustadaPeloBanco`
(`lib/lpc-chave.js`) só resgata quando existe **UMA** chave de fase no banco — a OP-83 tinha cinco,
então devolveu `null` e a chave numérica ficou. As marcas antigas não foram encontradas nem
atualizadas: nasceram linhas paralelas.

⚠ O comentário do `lpc-chave.js` dizia "a chave numérica fica (a tela avisa)" — **a tela não avisava**:
`chaveAjustada` não era exibido em lugar nenhum. Agora:

- A rota `importar-lpc` devolve **`chaveConflito`** `{ chave, fases, marcas, exemplos }` quando a
  chave é numérica e as marcas do arquivo já existem sob chaves de fase. Ela **não muda o que grava** —
  escolher a fase sozinha é impossível com o arquivo misturando várias; o que ela faz é dizer.
- `Engenharia › Listas` mostra a tarja vermelha com a contagem, as fases e o caminho de saída.
- **`Planejamento › Datas por setor › Montagem`** ganhou o botão **"excluir N da obra"** (com
  confirmação) e marca a **"repetida"** em cada cartão cuja marca aparece mais de uma vez na obra.
  O endpoint `DELETE /api/producao/pecas` com `{ids}` já aceitava o perfil PLANEJAMENTO — faltava a
  tela. ⚠ O aviso de **lote já liberado** volta da rota e aparece: apagar peça corta a programação do
  PCP, e isso era silencioso.

⚠ **O jeito certo de importar continua sendo UMA FASE POR ARQUIVO**, com a fase no nome
(`T83A-LPC_R01.xlsx`). Ver [[torg_listas_le_lpc]] e [[torg_pecaconjunto_opnumero]].

### Onde o Planejamento exclui (17/09/2026)

Vitor: *"tire essas peças da página do planejamento pois não estamos conseguindo excluir"* — eram 9
croquis **órfãos** da OP-83 (`T83F-82/84/85/86/87/90/91/92/93`), criados no import de 16/09: sem
conjunto, sem desenho, sem NC1, sem ordem no Syneco, zero produzido, nenhum lote liberado apontando
para eles. A tela onde ele os via é **Liberar frentes**, e ela não tinha exclusão.

Agora as DUAS telas do Planejamento excluem, com confirmação e com o aviso de lote liberado:

| Tela | O que lista | Onde fica o botão |
|---|---|---|
| `Datas por setor › Montagem` | CONJUNTOS | barra de ações, "excluir N da obra" |
| `Datas por setor › Liberar frentes` | CROQUIS e avulsas | barra da seleção, "excluir" |

⚠ Só a Montagem marca a **"repetida"**: lá a duplicidade é por marca na obra. Em Liberar frentes a
lista já é por frente, e a coluna FRENTE distingue.

⚠⚠ **Apagar direto no banco por script é bloqueado pelo classificador de auto-mode** (17/09/2026) —
e está certo: exclusão em produção é do usuário, pela tela, com auditoria. O caminho é sempre dar o
botão, não rodar o `deleteMany`.

### ⚠⚠ O portão do desenho travava a SELEÇÃO, não só a liberação (18/09/2026)

Geraldo e Gabriel: *"na tela do Gabriel do Planejamento não estamos conseguindo selecionar as marcas
pois estão sem NC1 e desenho"*. O checkbox da linha em **Liberar frentes** vinha
`disabled={!liberavel(p)}`, e `liberavel` exige `temDesenho === true` e `temMaquina !== false`. Os
croquis órfãos da OP-83 não têm nenhum dos dois — então não podiam ser marcados para **nada**: nem
prioridade, nem exclusão. O botão de excluir que eu tinha acabado de pôr era inalcançável para
exatamente as peças que precisavam dele.

- O checkbox voltou a ser livre. A linha continua vermelha e o `title` explica que não desce ao PCP.
- **O portão mudou de lugar, não sumiu**: `liberar()` recusa a seleção que contenha peça travada,
  nomeando as primeiras e pedindo para desmarcar. ⚠ Recusa em vez de liberar só as boas — mandar
  menos do que o número do botão diz é o erro que o comentário do `pecaIds` já registrava.
- ⚠ "Marcar todas as visíveis" continua pegando só as **liberáveis**, para não atrapalhar o fluxo
  diário de liberação. Para limpar lixo, marca-se linha a linha.
- Regra geral que ficou: **trava de AÇÃO não pode virar trava de SELEÇÃO**. Ver [[torg_portao_desenho]].
