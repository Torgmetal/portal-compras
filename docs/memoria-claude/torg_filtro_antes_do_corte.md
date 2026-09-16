# Filtrar DEPOIS de cortar a lista esconde dado sem avisar

**16/09/2026.** Matheus, olhando a OP-097: *"existe 7 RMs mas na tela de RMs histórico e filtro por
OP-097 só aparece 3 (…) analise em todas as obras, eu preciso ter um filtro completo de tudo
referente a obra, não pode ocorrer isso."*

## O defeito

`app/compras/page.js` buscava as **100 RMs mais recentes** (`take: 100`) e o filtro por obra rodava
**depois, no navegador** (`rms.filter(...)` em `RMsTabelaSeletor.jsx`). Nenhum filtro de cliente
alcança o que o servidor não mandou.

Medido no banco de produção naquele dia, com 211 RMs no histórico:

- **111 RMs invisíveis** em qualquer tela do portal;
- **24 das 37 obras** mostravam menos RMs do que tinham — a OP-060 mostrava **1 de 21**;
- **11 obras com ZERO linhas na janela** — e por isso ausentes **até do seletor de OP**, porque as
  opções do `<select>` eram montadas a partir das mesmas 100 linhas. A obra sumia do filtro
  inteiro, sem nada na tela dizendo por quê.

⚠⚠ **O sintoma mais grave não era a lista curta, era a opção que não existia.** Lista curta levanta
suspeita; obra ausente do seletor parece obra sem RM. Ninguém notou por semanas.

## A regra que ficou (`lib/rms-painel.js`)

1. **Com obra escolhida, a consulta filtra no banco e NÃO corta** — a obra vem inteira, sempre. A
   obra na URL (`/compras?arquivadas=1&op=097`), não em `useState`.
2. **As opções do seletor saem de consulta própria** (`groupBy` por `opId` + contagem), nunca das
   linhas carregadas. Cada opção mostra quantas RMs a obra tem no escopo: é o número que denuncia
   divergência futura na hora, em vez de silenciosamente.
3. **Sem obra escolhida o teto continua (100), mas a tela DIZ que está cortando.** O Neon é pequeno
   (OOM 53200 documentado no CLAUDE.md) e carregar tudo não é opção — o conserto é o corte deixar
   de ser silencioso. Subir para 250 só adiaria o mesmo defeito.
4. **OP inexistente devolve lista VAZIA, nunca "todas"** (`normalizarOp`). Cair no sem-filtro faz a
   tela responder uma pergunta diferente da que foi feita.
5. **Um filtro de obra por tela.** O funil "OP / Cliente" do cabeçalho foi **removido**: funil de
   coluna só enxerga o que foi carregado, então era um segundo caminho que continuava mentindo ao
   lado de um seletor correto. Dois filtros da mesma coisa, um certo e um errado, é pior que um só.
6. **Trocar de obra ou de aba REMONTA o componente** (`key` por escopo). Sem isso dava para marcar
   RMs da OP-060, trocar para a OP-097 e disparar cotação consolidada com as RMs da obra anterior —
   o contador lê `selecionadas.size` e o envio lê a interseção com `rms`, então os dois nem
   concordariam sobre o que estava indo. Achado do Codex.
7. **A obra sobrevive à troca Ativas/Histórico** — trocar de aba não é trocar de obra. Quando a obra
   não tem RM naquela aba, o vazio diz qual obra e qual aba, em vez de voltar sozinho para "todas".

## Onde mais isso mora

`app/compras/consumiveis/page.js` usa o mesmo módulo (34 RMs internas, **todas sem OP** — o seletor
nem aparece lá, mas o aviso de corte vale). `lib/rms-servico.js` (Aluguel e Montagem) tem a mesma
estrutura `take: 100` com filtro no cliente e **ainda não foi corrigido** — não estourou porque os
volumes são baixos, mas é o mesmo defeito esperando o histórico crescer.

## A lição geral

**Todo `take` em consulta cujo filtro roda no cliente é um dado escondido esperando para acontecer.**
Ou o filtro sobe para o servidor, ou o corte aparece na tela. O que não pode é o corte existir e
ninguém saber.
