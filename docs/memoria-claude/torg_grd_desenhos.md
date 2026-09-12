---
name: torg_grd_desenhos
description: "Desenhos da Engenharia nas telas de produção/PCP: modal busca PDFs no SharePoint (formato A1–A4 pela pasta), Imprimir+GRD registra liberação (GrdLiberacao)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1754de4f-06da-423d-8c20-70c99cbd5bad
  modified: 2026-08-18T17:27:11.917Z
---

**Desenhos/projetos da peça + controle de GRD (teste, Vitor 18/08, commit 15575c1).** Vitor: "na pasta da engenharia temos os projetos dessas peças… o próprio responsável do setor faz a impressão e já registra como nosso controle de liberação para os setores… seria até mesmo nosso controle de GRD" — na tela de produção E no PCP.

**Estrutura no SharePoint (validada na OP-089):** `{pastaOP}/2. Engenharia/2.5 Projetos/2.5.2 Fabricação/`
- **Conjunto:** `2.5.2.3 Conjunto/{frente A|B|C}/{A1|A2|A3|A4}/{marca}.pdf` → **formato de impressão = nome da pasta-mãe**.
- **Croqui:** `2.5.2.2 Croqui/{frente}/{marca} - CROQUI.pdf` → **A4 (croqui)** (identifica por "CROQUI" no nome; croquis LE tipo T89AG1 ficam em subpastas tipo "GRADES E DEGRAUS" — a pasta-mãe NÃO é A1-4, o fallback pelo nome resolve).
- Ignorar tudo com "obsolet" (nome ou pasta-mãe). Também existem `.dwg` — só os `.pdf` interessam pra impressão.

**Como acha o arquivo:** Graph search escopado na pasta Fabricação (`/root:{path}:/search(q='{marca}')`) — ⚠️ o search NÃO devolve `parentReference.path`, só o `id`; resolve-se a pasta-mãe com `GET /items/{parentId}?$select=name`. Matching de marca EXATO (`casaMarca`): nome começa com a marca seguida de `.pdf`, espaço, `.`, `_` ou `-` (evita T89A1 casar T89A10).

**Implementação:**
- **`GrdLiberacao`** (model + tabela criada em prod + ensure-mes-tables): opId/opNumero/marca/arquivo/formato/setor/itemId/liberadoPor*/createdAt; index (opNumero, marca). Registro = uma impressão/liberação.
- **APIs:** `GET /api/producao/desenhos?opNumero=&marca=` → `{arquivos:[{itemId,nome,formato,sizeKb}], liberacoes, erroSp}` (liberações vêm mesmo se o SP falhar); `POST` registra GRD (auditLog `GRD_LIBERAR_DESENHO`); `GET /api/producao/desenhos/arquivo?itemId=&nome=` → **proxy inline do PDF** (visualiza/imprime no navegador sem credencial do SP).
- **`components/DesenhoPecaModal.jsx`** (compartilhado): lista PDFs com **"Imprimir em A2/A3/A4"**, botões **Abrir** e **"Imprimir + GRD"** (registra e abre), histórico de liberações. Usado em: `PrioridadesProducaoClient` (ícone por linha; setor=bloco) e `DespachoPanel` do PCP (ícone ao lado da marca; setor="PCP"; o despacho GET passou a devolver `opNumero` pra isso).
- **`acharPastaOp(opNumero)`** exportada de `lib/sharepoint.js` (acha a pasta da OP por prefixo `OP-###`); `pastaRomaneiosTerceiro` refatorada pra usá-la.

**Tela de produção detalhada (mesmo commit):** `/producao/prioridades` virou TABELA por OP — colunas `# · Marca/descrição · Situação (setor ou "no terceiro · volta DD/MM") · Qtd · Peso un. · Peso total · Des.(desenhos) · ↑↓` — prioritárias em cima, "Demais pendentes (N)" embaixo. **Exportar** = Excel padrão Torg (`criarRelatorioTorg`, cód REL-PCP-003) do bloco ativo com OP/Prior./Marca/Descrição/Situação/Qtd/Pesos + total. (Vitor reclamou que a 1ª versão era confusa e sem qtd/pesos.)

Pendente/possível: GRD em PDF (relatório formal), revisão do desenho (R01+) no matching, cache da busca.

## Aba GRD no PCP (`/pcp/grd`, 19/08/2026)

Pedido do Vitor: *"crie uma aba no portal do PCP com esse nome GRD e lá dentro informe todas as
OPs e traga as impressões, liberações, todas as informações necessárias para garantir a
rastreabilidade das OPs"*.

- KPIs: OPs com desenho liberado · GRDs · impressões (com reimpressões) · amarradas no Data Book.
- Lista de OPs: marcas liberadas / marcas na OP, GRDs, impressões, setores, Data Book, última
  impressão. Detalhe **sob demanda** ao abrir a OP.
- No detalhe: a **cobertura de rastreabilidade das peças** ([[torg_rastreio_corrida]]) + cada
  liberação com marca, arquivo, formato, setor, **rastreabilidade carimbada** (o snapshot do R
  impresso no papel), nº de impressões, 1ª e última, quem liberou e link pro PDF carimbado.
- Excel `REL-PCP-005`: a OP aberta em detalhe, ou o resumo de todas.

⭐ O valor está no **snapshot**: mesmo que o CMR mude depois, o que o setor recebeu no papel
continua registrado. Ver [[torg_desenho_rastreado]].
