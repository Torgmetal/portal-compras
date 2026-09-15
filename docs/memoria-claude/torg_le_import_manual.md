---
name: torg_le_import_manual
description: "O import da Lista de Expedição é manual e atrasa sem ninguém ver; cron diário só AVISA (nunca importa) comparando o arquivo do servidor com o do portal"
metadata:
  type: project
---

O import da L.E. (`Engenharia › Listas`) é **manual** — não existe, e nunca existiu, gatilho
automático. O custo apareceu em setembro de 2026: a **OP-084** passou **três semanas** com a R07 no
portal enquanto o servidor já tinha a R08 (9 marcas que sumiriam da expedição), e a **OP-104** teve
o arquivo **trocado sob o mesmo nome de revisão** — caso que nem olhando o nome alguém pega.

Desde 15/09/2026 existe `/api/cron/conferir-listas` (`0 10 * * 1-5` — 10h UTC = 7h aqui), que
compara o arquivo do SharePoint com `ListaExpedicao` e avisa o módulo ENGENHARIA pelo sino e por
e-mail. Regra pura em `lib/le-pendencias.js`, com testes.

⚠⚠ **SÓ AVISA, NUNCA IMPORTA** — decisão do Matheus, e é a certa: a revisão mexe em marca que já
tem etiqueta impressa e peça conferida (a OP-105 mostrou isso na prática). Trocar a lista de uma
obra sem ninguém olhar seria pior que o atraso que o aviso resolve.

⚠ **`?simular=1` confere sem avisar ninguém.** A única forma de provar este cron é rodá-lo contra o
SharePoint de verdade, e sem o parâmetro cada prova mandaria e-mail para a Engenharia inteira. A
simulação também **não bate o heartbeat**: marcaria o cron como executado sem ninguém ter sido
avisado, e o monitor pararia de cobrar justamente no dia em que ele falhou.

⚠ **Duas recusas deliberadas a alarme falso**: registro antigo sem `fileModificado` não acusa
"arquivo trocado", e o temporário do Excel (`~$T105-LE-R02.xlsx`) sai da listagem — ele tem data de
hoje e faria toda obra com a planilha aberta parecer arquivo trocado.

⚠⚠ **PRIMEIRA EXECUÇÃO REAL (15/09/2026): 7 pendências, e UMA ERA FALSO POSITIVO — a minha
conclusão de que não era é que estava errada.** Suspeitei da OP-085 (`T85-LE-R01.xls` no servidor
contra `T85-LE-R01_GALV.xls` no portal), abri a pasta do servidor, vi **um arquivo só** e conclui
que era divergência real. Faltou olhar o OUTRO lado: no portal a 085 tem **duas frentes**
(`T85-LE` → `T85-LE-R01.xls` e `T85-LE-R01 GALV` → `T85-LE-R01_GALV.xls`), e o arquivo do servidor
já estava importado pela primeira. O comparador pegava a importação mais RECENTE da obra e
comparava com ela. **Metade da evidência com confiança inteira** — olhar o servidor E o portal.
Corrigido: o arquivo do servidor é procurado entre TODOS os registros da obra ("este arquivo já
entrou?"), e o caso real da 085 virou teste. Depois da correção, 6 pendências — 094, 103, 107,
115, 116 e 118 —, e as quatro últimas **nunca tiveram lista importada**.

⚠ **Obra que o Graph recusou não é obra sem arquivo.** Um 403/429/500 virava `arquivos: []` →
"sem-arquivo" → nenhum aviso, com heartbeat de SUCESSO: o cron ficava mudo exatamente quando
quebrava. Hoje ela sai da comparação, volta em `incompletas` e o heartbeat registra `ok:false`.

⚠ `lesDeVariasOps` (`lib/le-servidor.js`) existe porque `lesDaOp` redescobre o drive e **relista as
29 pastas de OP a cada chamada**: 22 obras viravam ~60 idas ao Graph, e o cron tem 60 s. Com a
listagem única, a execução inteira leva ~9 s.

Relacionado: [[torg_etiquetas_le_marca_fantasma]], [[torg_permissoes_pasta_op]].
