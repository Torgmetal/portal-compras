---
name: torg_recebimento_estoque
description: RRA (arame) e RRP (penetrante) são de ESTOQUE, sem OP — RRA-EST-001; entram na §12 de cada data book cuja obra usou o R (arame) ou o lote no LP (penetrante); tinta segue por OP
metadata:
  type: project
---

**Pedido (Vitor, 14/10/2026):** *"ele pede para selecionar a OP — o que não pode ser, pois o Arame será usado
para várias obras"*, e depois o mesmo para *"líquido penetrante e revelador"*. Obra sem RRA não é problema: o
responsável do data book cria o recebimento depois.

**Como ficou (`357de8e9`, `lib/recebimento-estoque.js`):**
- `opNumero = "EST"` (`OP_ESTOQUE`, em `lib/recebimento-certificados.js` para a tela poder usar). Código
  **RRA-EST-001** / RRP-EST-001 — `codigoRelatorio` tratava "EST" como "000". A rota de criação IGNORA a OP que
  chegue para esses dois tipos, sem contrato (é da obra) e sem checar escopo.
- **Distribuição:** assinado por todos, entra na **§12** de cada data book ABERTO cuja obra usou:
  - arame → pelo **R**: `consumiveisDaOP` (o arame vigente na data da solda de cada conjunto, o mesmo do carimbo e da §06);
  - penetrante → pelo **lote**: `penetranteLote`/`removedorLote`/`reveladorLote` dos relatórios LP da obra (N.A. ignorado).
  Uma obra recebe todos os que usou. Recalcula, não acumula: não usado/não assinado → sai (só livro aberto).
- Quem distribui: `vincularNoDataBook` delega para `vincularRecebimentoDeEstoque` quando `opNumero === "EST"`
  (cobre a última assinatura) **e o cron `/api/cron/data-book`** (hora em hora, horário comercial) para a obra
  que soldar/usar o lote DEPOIS da assinatura.
- PDF: "ORIGEM: Estoque — uso em várias obras" no lugar de OP/cliente/contrato (`identificacaoRir`).
- Tela: o modal do computador esconde o campo OP; no celular a OP escolhida antes não vai ao relatório e o
  tipo aparece mesmo fora do escopo da obra. Lista mostra "Estoque".

⚠ **Antes disso a busca de certificados estava QUEBRADA em produção** (`818bcfa7`): o select pedia
`DocumentoQualidade.indiceR`, que não existe (o R é `importRef`) — "Unexpected end of JSON input". Estava
também na criação do recebimento e na rota do PLP. Prisma mockado não pega campo inexistente: os testes agora
conferem o select contra o schema (`testes/lib/campo-indice-r-inexistente.teste.js`).

Relacionado: [[torg_recebimentos_certificado]], [[torg_databook_relatorio_assinado]].

**Data do recebimento na criação (14/10/2026, `d3d6f6e4`):** Vitor — *"pode ser um recebimento retroativo"*. O modal
(computador e celular) pede a data, hoje por padrão; vai para `resultados.dataInspecao` (o mesmo campo do
cabeçalho e do PDF, que também confere a validade contra ela). `validarDataRecebimento`: futura ou inexistente é 400.
Vale para os três recebimentos (tinta também).

**Recebimento de AÇO — RRM (14/10/2026, `9f7d0aef`):** Vitor — *"o modelo de relatório dos materiais de uso, que seria o
Aço — mesma linha dos demais no layout, porém informações compatíveis com recebimento de material"*.
- O mesmo RIR do arame/penetrante (`ehRir`/`TIPOS_RIR`), com uma inspeção a mais, **IDENTIFICAÇÃO** (corrida marcada
  na peça × certificado — `inspecoesRir(tipo)`), e a **NORMA / GRAU** no lugar da validade (aço não vence). PDF
  com coluna "MATERIAL", instrumentos TR/PQ/ES. Classe dos certificados = `ESTRUTURAL` sem o penetrante (que também
  cai em ESTRUTURAL em `classificarMaterial`).
- De estoque (RRM-EST-001), escolha do Vitor. Assinado, entra na **§04** de cada livro cuja obra usou o R. O uso
  vem de `certificadosDaOp`, o mesmo conjunto da §04, que inclui o R declarado vindo de outra obra.
- ⚠⚠ **A §04 é seção de CERTIFICADO (vínculo automático), e relatório ali era proibido** (teste
  `relatorio-secao-databook`). O aço é exceção deliberada, com dois ajustes: o cron ignora `categoria RELATORIO` ao
  medir a "montagem" da seção (`livro.relatorios` em `certificadosQueEntram`), e o PDF lista os relatórios numa
  tabela própria ("Relatórios de recebimento"), fora da rastreabilidade.

**Certificados de penetrante/revelador na §06 (14/10/2026, `4c2cd991`, `lib/databook-consumiveis-lp.js`):** Vitor — *"puxar a
informação de cada relatório emitido e já puxar os certificados scaneados sozinho"*. Lotes dos LP **assinados** da obra →
lançamento de produto de LP no CMR com aquele lote (`numeroCorrida`) → vínculo na **§06** (escolha dele). Roda na última
assinatura do LP (`aoConcluirAssinaturas`) e no cron do data book. Recalcula só os de LP (arame nunca), respeita
REMOVER_DOC_SECAO_DATABOOK, e o nome da §06 vira "…de solda e de líquido penetrante" com certificado de LP.
⚠ O CMR escreve "METAL-CHEK VP 30" — o filtro de LP aceita hífen/espaço/"CHEK" (`f56fbc5b`). R 261928/261929 (OP-102)
foram lançados SEM o PDF escaneado: entram na lista, as folhas só quando o Almoxarifado digitalizar.
