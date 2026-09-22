# MES — a barra de nesting tem dono, e ele é um só

**22/09/2026.** A mesma barra podia ser aberta em dois postos. O teto não dobrava (`comporTeto`
conta cada unidade uma vez) — e era por isso que doía: os dois postos lançavam peças que existem
**uma vez só**, e o excedente comia o saldo legítimo de **outras barras da mesma marca**.

## Onde mora

| | |
|---|---|
| Tabela | `mes."MesUnidadeReserva"` |
| Garantia | índice PARCIAL ÚNICO `(unidadeId, ambiente) WHERE "liberadaEm" IS NULL` |
| Regra | `lib/mes/unidade-reserva.js` |
| Transferência / liberação | `lib/mes/transferencia.js` |
| Ações do totem | `trazerBarra`, `liberarBarra` |

⚠⚠ **QUEM GARANTE É O BANCO, NÃO O `if` DA ROTA** — mesma lição da Conferência de Peça. A trava do
MES (`pg_advisory_xact_lock`) serializa por **recurso**, e numa abertura concorrente os recursos são
dois: os dois leem "livre" no mesmo instante. O `P2002` do índice é o que sobra, e ele é tratado
como recusa de negócio, com o nome do posto que está com a barra.

⚠⚠ **A CHAVE NÃO TEM A OPERAÇÃO** (parecer do Codex): a barra é uma coisa física, e incluir a etapa
permitiria dois donos ao mesmo tempo.

⚠⚠ **A LIBERAÇÃO É CENTRALIZADA EM `encerrarNaTransacao`**, por onde TODO encerramento passa — a
tela encerra marca a marca, e pôr isso só no `encerrarLote` deixaria a barra presa a um posto que já
terminou. A pergunta é *"sobrou sessão ABERTA nesta barra?"*, não *"este lote acabou"*.

⚠⚠ **NÃO EXPIRA POR TEMPO.** Silêncio não prova que a barra parou de ser cortada. Quem solta é o
encerramento ou o ADMIN, com motivo e auditoria (`MES_LIBERAR_BARRA`).

⚠⚠ **TRANSFERIR NÃO MOVE PRODUÇÃO.** Nenhuma sessão muda de `recursoId` — arrastar falsificaria o
OEE dos dois postos. E **sessão compartilhada com outro comando não se transfere**: o apontamento
carrega `sessaoId`, não a barra.

⚠⚠ **O LIMITE:** isto impede a barra ABERTA em dois postos, **não** a barra REABERTA depois.
Fechar exige o apontamento saber a UNIDADE. Ver `docs/mes-proprio.md` §17.9.
