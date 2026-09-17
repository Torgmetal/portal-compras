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
