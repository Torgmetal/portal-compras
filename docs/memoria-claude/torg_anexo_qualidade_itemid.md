---
name: torg_anexo_qualidade_itemid
description: "O sharepointItemId de um documento da Qualidade MORRE quando o arquivo é movido/renomeado; o download tem uma escada de tentativas e ela vive em lib/databook-arquivo.js"
metadata:
  type: project
---

`DocumentoQualidade.sharepointItemId` **não é estável**. Ele morre quando alguém move ou renomeia
o arquivo no SharePoint — rotina de almoxarifado, não acidente. O arquivo continua lá; o id é que
deixa de resolver, e o Graph devolve 404.

Quem sabe lidar com isso é **`baixarDocumento` (`lib/databook-arquivo.js`)**, com uma escada:
1. o drive provável pela `origem` (`servidor`/`projeto_servidor` → drive SERVIDOR, senão o padrão);
2. o outro drive — há documento com `origem` que não corresponde à biblioteca onde o arquivo está;
3. o **CAMINHO** (`downloadSharedFile`), que sobrevive à troca de id. O caminho pode estar em
   `sharepointUrl` **ou** em `arquivoUrl` (o importado da planilha do CMR guarda em `arquivoUrl`).

⚠⚠ **QUALQUER LUGAR QUE BAIXE ANEXO DA QUALIDADE PASSA POR ELA.** O mesmo defeito apareceu DUAS
vezes, com o MESMO arquivo de 309 KB: o certificado do arame fora do livro da OP-106 (28/08/2026,
Vitor) e o botão do olho em 502 na §06 da OP-103 (15/09/2026, Matheus — `R 261085`). Da primeira
vez a escada foi criada só no gerador do livro; a rota `/api/qualidade/documentos/[id]/download`
continuou tentando o item por id e desistindo. Duas implementações do mesmo download, uma só com a
lição aprendida.

⚠ **`sharepointUrl` e `origem` precisam estar no `select`** de quem chama `baixarDocumento`, senão
a escada não tem como andar. Um select incompleto não dá erro: dá 502 silencioso.

⚠ **Não é o drive errado** — foi a minha primeira suspeita e estava errada. Medido em 15/09/2026:
4.200 documentos ativos com itemId, **4.123 na biblioteca SERVIDOR**, e amostras de cinco origens
diferentes abrem em 200. `SHAREPOINT_DRIVE_ID` **é** o drive SERVIDOR.

⚠ **Blob continua em stream, de propósito** (`isBlobUrlSegura` → `res.body`): é o caminho dos
uploads do portal, e um data book de dezenas de MB não precisa atravessar a memória da função.

⚠ **A defesa de SSRF é o que separa os dois caminhos**: só entra na escada quem tem `itemId` ou URL
do SharePoint da empresa. URL de terceiro nunca é buscada — 400, e há teste com o endereço de
metadados da nuvem.

**Ainda quebrado (19 documentos, 15/09/2026):** os que guardam link de PÁGINA do Office
(`/_layouts/15/Doc.aspx?sourcedoc={GUID}&file=DM_009_26_T67.xlsx`) — arquivos `.xlsx`, não PDF.
O `sourcedoc` é o UniqueId do arquivo e a escada não sabe usá-lo; `downloadSharedFile` falha nessa
forma de URL. Todos são `DM_*` (desenhos de montagem) de um import só.

Relacionado: [[torg_databook_revisao]], [[torg_qualidade]], [[torg_desenho_rastreado]].
