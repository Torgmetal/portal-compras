#!/usr/bin/env bash
# Refaz o split do EstudoClient do ZERO, a partir da versao que estiver no disco.
# Existe porque o Vitor edita esse arquivo toda semana: refazer tem que ser um
# comando, nao uma tarde.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
SP="scripts/refatorar"
D="app/comercial/orcamentos/estudos/[id]"
C="$D/_componentes"

echo "── 1. corte por bloco de topo"
python3 "$SP/splitter.py" "$D/EstudoClient.jsx" "$SP/g-estudo.json" | head -5

echo "── 2. blocos internos das abas que sozinhas passam de 350"
python3 "$SP/extrai3.py" "$C/Pintura.jsx" \
  "$(python3 "$SP/acha.py" "$C/Pintura.jsx" '\{res\.pinturaPorArea\?\.length > 0 && \($')" \
  EscopoDePintura '/**
 * A tinta por área da obra — que é como ela é comprada e aplicada.
 *
 * Vitor (23/08/2026): "trazer as áreas de pintura mencionadas na primeira parte e trazer a
 * quantidade de tinta que vamos usar em cada área". Quem compra tinta compra por cor e por
 * trecho, não um número único da obra.
 */'
python3 "$SP/extrai3.py" "$C/Pintura.jsx" \
  "$(python3 "$SP/acha.py" "$C/Pintura.jsx" '^\s*\{leitura && \($')" \
  LeituraDoSistema '/**
 * O que a IA leu da planilha do cliente aparece ANTES de valer.
 *
 * Aplicar direto sobrescreveria camadas preenchidas à mão — e numa planilha do cliente, um
 * campo mal lido vira preço errado sem ninguém ver.
 */'
python3 "$SP/extrai3.py" "$C/Cenario.jsx" \
  "$(python3 "$SP/acha.py" "$C/Cenario.jsx" '\{sens\.length > 0 && \($')" \
  OQueMoveOResultado '/**
 * A tabela de sensibilidade do cenário.
 *
 * Cada linha é um susto de tamanho realista, aplicado sozinho sobre o cenário base. Serve para
 * saber onde vale gastar a negociação.
 */'
python3 "$SP/extrai2.py" "$C/FluxoDoDinheiro.jsx" \
  $(python3 "$SP/acha.py" "$C/FluxoDoDinheiro.jsx" 'minWidth: 1040' --ate-fechar-div --sobe 1) \
  TabelaFluxoMes '/**
 * O fluxo mês a mês, com a receita digitável na própria linha.
 *
 * Vitor (23/08/2026): "mais as receitas nos meses para que aí sim você calcule o cenário
 * financeiro real". Cronograma de medição negociado vale mais que distribuir por regra.
 */'

echo "── 3. imports órfãos (reconstruídos, nunca por cirurgia de range)"
python3 "$SP/limpa-imports.py" "$D/"

echo "── 4. props que chegam e não são lidas"
python3 "$SP/limpa-sobras.py"

echo "── 5. tamanhos finais"
for f in "$D/EstudoClient.jsx" "$C"/*.jsx "$D/_lib"/*.js; do
  n=$(wc -l < "$f")
  [ "$n" -gt 350 ] && echo "  ACIMA DE 350: $n $f" || true
done
echo "  EstudoClient.jsx: $(wc -l < "$D/EstudoClient.jsx") linhas | $(ls "$C" | wc -l) módulos"
