---
name: torg_qualidade_plano_acao
description: Qualidade › Planos de Ação 5W2H — ações com acompanhamento e status por ação; PDF paisagem
metadata: 
  node_type: memory
  type: project
  originSessionId: dcd073c6-4b21-46d4-b2d3-f4c7977df22a
---

**Planos de Ação (5W2H)** — é a **3ª aba de Auditorias Internas** (`/qualidade/auditorias-internas`, abas Cronograma | Relatórios | Plano de Ação), NÃO item próprio no menu (mudou em 296047b; o Vitor quis ao lado de Relatórios). A aba renderiza `PlanosAcaoLista.jsx`; deep-link `?aba=planos`. Detalhe em `/qualidade/planos-acao/[id]` (rota-lista `/qualidade/planos-acao` foi removida). Criado d817458, 17/07/2026. Acesso ADMIN/QUALIDADE.

- `model PlanoAcao` (numeração `PA-001`): titulo, `origem` (texto livre — de onde veio: Auditoria RAI-001, NC, reclamação, reunião), responsavel, status (EM_ANDAMENTO|CONCLUIDO|CANCELADO), `itens` Json.
- Cada item = uma ação **5W2H**: `oque` (What), `porque` (Why), `onde` (Where), `quem` (Who), `quando` (When, data), `como` (How), `quanto` (How much), + `status` (A_FAZER|EM_ANDAMENTO|CONCLUIDO), `acompanhamento` (texto), `concluidoEm` (carimbado na transição p/ CONCLUIDO no PATCH).
- **"Atrasado" é DERIVADO do prazo** (`situacaoItem()` em `lib/plano-acao.js`: sem concluir + `quando` vencido = ATRASADO), não é status gravado — mesmo padrão do [[torg_reunioes]]/auditoria.
- Consts em `lib/plano-acao.js` (COLUNAS_5W2H, STATUS_*). PDF em `lib/plano-acao-pdf.js` (A4 **paisagem**, tabela 5W2H com quebra de célula + acompanhamento como sublinha + situação colorida; grades verticais começam em `PH - HEADH`, NÃO `+16`, senão entram no cabeçalho navy).

Relacionado: nasce naturalmente das auditorias ([[torg_qualidade_auditorias_internas]]) mas é standalone. Hoje `origem` é só texto — não há FK pra RAI. Ver [[torg_qualidade]].

**11/09/2026 — PDF virou FICHA POR AÇÃO (commit 7f9f55d9, build 3098/3099).** Vitor: "na abertura dos planos de ação dos
indicadores está bem ruim, está pequeno para visualizar tanto na geração quanto depois do PDF". A tabela de 8 colunas a
7,5 pt saiu; `lib/plano-acao-pdf.js` desenha uma ficha por ação (o quê 11,5 pt negrito; por quê/como em 2 colunas a
10 pt; onde/quem/quando/quanto em grade 2×2; prazo + chip de situação na faixa; acompanhamento embaixo), ainda A4
paisagem com o mesmo cabeçalho/rodapé FORM 28 — vale para TODO plano (indicadores, RNC, Qualidade, análise crítica).
O modal `PlanoAcaoIndicador.jsx` passou de 10–12 px sem rótulo para 14 px com rótulo visível por campo (termo em inglês
como dica) e caixas de 2 linhas. Teste `testes/plano-acao-indicador-salvar.teste.jsx` lê por `getByLabelText(/^Quanto/)`.
