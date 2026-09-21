---
name: torg-grd-engenharia
description: "Portal Compras Torg — GRD da Engenharia (FORM 09) lida da pasta 13. GRD do SharePoint, organizada por OP em /engenharia/grd"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1754de4f-06da-423d-8c20-70c99cbd5bad
  modified: 2026-08-31T22:16:41.747Z
---

**`/engenharia/grd` — a GRD que a ENGENHARIA emite**, lida da pasta SharePoint `/Engenharia/13. GRD` (31/08/2026). Não confundir com [[torg_grd_desenhos]]: aquela (`GrdLiberacao`) nasce quando alguém IMPRIME um desenho no portal; esta (`GrdEngenharia`) é o FORM 09 que a Engenharia emite ao liberar projeto. São dois controles diferentes.

Formato do arquivo: `FORM 09 - GRD-<nº>_R<rev>.xlsx`, uma aba. Cabeçalho traz Nº, DATA, De/Para (setor), Referência (cliente), **OP: T105B**, Peso Total Liberado, Área da obra, Emitido por. Depois a tabela: Item | Nº do documento | Rev. | Descrição | F (finalidade) | S (situação) | Cópias. Primeira carga: **470 GRDs, 64 obras, 17 com revisão**.

- ⚠️ **CÉLULAS MESCLADAS REPETEM O VALOR.** O Tekla mescla "Nº do documento" e "Descrição" sobre três colunas — a linha chega com o mesmo texto três vezes. Deduplicar consecutivos devolve a linha à forma que ela tem na tela.
- ⚠️⚠️ **Ler o cabeçalho célula a célula, NUNCA o bloco de linhas de uma vez.** `map(txt)` sobre array de arrays transforma cada linha na string `",,PCP,,,,,,OP: T105B,,,"` — o regex casa nela e "Para" volta com a linha inteira dentro, enquanto data, peso e OP saem nulos. **Os itens continuam lendo certo**, o que torna o erro fácil de não ver.
- ⚠️ **A chave é o `itemId` do arquivo, não o número da GRD.** Revisão vira arquivo novo (`_R01`) e as duas versões coexistem na pasta; guardar por número apagaria a R00 — e o histórico de revisão é o que o procedimento pede. Na tela a superada aparece esmaecida, não sumida.
- ⚠️ **Só lê o que mudou** (compara `lastModifiedDateTime`): são 485 planilhas, e cada leitura é um download.

**A regra do alerta (Vitor, 31/08):** GRD nova **não** manda e-mail — é o fluxo normal, várias por dia, e avisar de todas vira ruído. Avisa só quando **um projeto que já desceu R00 volta em R01**, e só se o R00 estiver registrado no banco (GRD que chega direto em R01 nunca desceu pelo portal). Destinatário: Gabriel `engenharia3@torg.com.br`. Cron 11h/17h/21h em dia útil. As 470 da carga inicial foram marcadas `avisadoEm` para não disparar alerta retroativo.

**GRD sem OP no cabeçalho não entra na lista** (27 casos) — continua gravada e contada em âmbar no topo; corrigido o cabeçalho na pasta, a próxima leitura encaixa.

**Clicar no número baixa o FORM 09 ORIGINAL** do SharePoint, para evidência de auditoria ISO — nunca um PDF reconstruído a partir do que o parser leu. Numa auditoria, um campo que o parser errou apareceria como se fosse o que a Torg registrou. Arquivo sumido responde dizendo qual e onde procurar: "não consegui abrir" e "não está mais na pasta" são coisas diferentes.

A **`Matriz GRD.xlsx`** (476 linhas, feita à mão) era o controle que esta tela substitui. **Vitor (31/08/2026): "não vamos mais medir pela matriz de GRD, vamos deixar os indicadores como está".** Ou seja: a matriz sai de cena como fonte de medição, os *INDICADORES ENG. 2026* ficam como estão e o portal **não** gera export no formato dela. Não construir ponte para ela.

⚠️ **O número vem do NOME do arquivo, não do cabeçalho.** Dez GRDs da pasta trazem número impresso diferente do arquivo — sete delas (24, 26, 27, 28, 29, 30, 31) dizem "Nº 23", porque alguém copiou a 23 e não trocou o campo; também 261→"260", 386→"383", 396→"391". Enquanto eu usava o cabeçalho como chave, as sete colidiam na `@@unique([numero, revisao])` e **sumiam da importação em silêncio**. A unique saiu (a chave é o `itemId`), o impresso vai para `numeroCabecalho` e a tela mostra "doc. diz 23" em âmbar — numa auditoria é o documento que o auditor lê.

**Roteiro (Vitor, 31/08):** Engenharia → **Gabriel** (`engenharia3@`) → **Larissa** (`pcp@`). Fica em `lib/grd-roteiro.js`, e-mail de área e não pessoal, pré-preenchido na emissão mas editável.

**A guia do PCP** (`GrdRemessaPcp`, série `GRD-PCP-001/2026`, separada da série da Engenharia) sai do botão "Emitir guia" em PCP › GRD e cobre só o que ainda não saiu em guia. **O recebimento é preenchido pelo próprio envio do e-mail** — sem link de confirmação (Vitor: "dentro do portal já sabemos quem recebeu"). O texto impresso é *"Remetida por e-mail a X em <data> — recebimento por meio eletrônico"*, e **não** "confirmado por X": afirmar um ato que não houve dentro de documento auditado é o mesmo erro do data book, ao contrário. Só grava se o e-mail sair. Sem e-mail, sai a linha para assinar no papel.
