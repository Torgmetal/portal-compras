#!/usr/bin/env bash
# Instala (ou conserta) o CLI do graphify. Idempotente: rodar de novo não quebra
# nada e reaproveita o que já existe.
#
# Por que existe um script para "pip install graphifyy":
#   • São ~200 MB de dependência (numpy, networkx e as gramáticas do tree-sitter).
#     Não cabem no repositório, então cada máquina instala a sua.
#   • Ubuntu 24.04+ e o Python do Homebrew são PEP 668 ("externally managed") e
#     RECUSAM `pip install` no Python do sistema. Tem que ser num venv.
#   • O Debian/Ubuntu ainda tira o `ensurepip` do pacote base, então `python3 -m venv`
#     falha na metade. A saída é criar o venv sem pip e trazer o pip pelo get-pip.
#
# O venv fica FORA de qualquer repositório, em ~/.local/share/graphify/.venv.
set -euo pipefail

RAIZ="${XDG_DATA_HOME:-$HOME/.local/share}/graphify"
VENV="$RAIZ/.venv"
BIN="$HOME/.local/bin"

info() { printf '  %s\n' "$*"; }
erro() { printf '\n✗ %s\n' "$*" >&2; exit 1; }

# O graphifyy exige 3.10+. Conferir a versão ANTES de criar o venv evita o pior dos erros: o venv
# nasce, o pip recusa o pacote e a mensagem que sobra é "pip install graphifyy falhou", que não diz
# nada sobre versão de Python.
MINIMO="3.10"
serve() { "$1" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; }
versao() { "$1" --version 2>&1 | awk '{print $2}'; }

command -v python3 >/dev/null || erro "python3 não encontrado. Instale o Python $MINIMO+ e rode de novo."
info "python3: $(python3 --version)"
serve python3 || erro "o graphifyy exige Python $MINIMO+ e o python3 daqui é $(versao python3).
    macOS:  brew install python
    Ubuntu: sudo apt install python3.12 python3.12-venv
  Depois abra um terminal NOVO (para o PATH pegar o Python novo) e rode isto de novo."

# ⚠⚠ VENV VELHO NÃO SE REAPROVEITA. Caso real (Vitor, 05/09/2026): a primeira execução foi com o
# Python 3.9.6 do sistema e criou o venv; depois de instalar o Python novo pelo Homebrew, o script
# encontrou o venv, reaproveitou e chamou o pip DELE — o do 3.9. O pacote foi recusado e o erro que
# apareceu foi "pip install graphifyy falhou", falando do Python antigo, que nem estava mais no
# PATH. Conferir só se o venv EXISTE não basta: tem que conferir se ele ainda serve.
if [ -x "$VENV/bin/python3" ] && ! serve "$VENV/bin/python3"; then
  info "o venv é do Python $(versao "$VENV/bin/python3") — refazendo com o $(versao python3)"
  rm -rf "$VENV"
fi

if [ ! -x "$VENV/bin/python3" ]; then
  mkdir -p "$RAIZ"
  info "criando o venv em $VENV"
  if python3 -m venv "$VENV" >/dev/null 2>&1; then
    info "venv com pip próprio"
  else
    # Sem ensurepip (Debian/Ubuntu): cria vazio e traz o pip pelo bootstrap oficial.
    info "sem ensurepip — trazendo o pip pelo get-pip"
    rm -rf "$VENV"
    python3 -m venv --without-pip "$VENV" || erro "não consegui criar o venv. Em Debian/Ubuntu: sudo apt install python3-venv"
    curl -sS https://bootstrap.pypa.io/get-pip.py | "$VENV/bin/python3" - >/dev/null \
      || erro "falhou ao baixar o get-pip.py (sem rede?)"
  fi
else
  info "venv já existe em $VENV"
fi

info "instalando/atualizando o graphifyy (pode demorar, são ~200 MB)"
"$VENV/bin/pip" install --quiet --upgrade graphifyy || erro "pip install graphifyy falhou"

mkdir -p "$BIN"
ln -sf "$VENV/bin/graphify" "$BIN/graphify"
info "link: $BIN/graphify -> $VENV/bin/graphify"

# Verificação de verdade, em dois passos: as dependências pesadas carregam, e o
# comando responde. Só "o pip não deu erro" já enganou antes.
"$VENV/bin/python3" -c "import numpy, networkx, tree_sitter, graphify" \
  || erro "as dependências não carregam. Apague $VENV e rode de novo."
"$BIN/graphify" --help >/dev/null 2>&1 || "$BIN/graphify" >/dev/null 2>&1 \
  || erro "o CLI foi instalado mas não respondeu. Veja: $VENV/bin/graphify"

# Publica o próprio instalador, para consertar o CLI fora deste repositório também.
cp -f "${BASH_SOURCE[0]}" "$BIN/instalar-graphify" 2>/dev/null && chmod +x "$BIN/instalar-graphify" || true

VERSAO="$("$VENV/bin/pip" show graphifyy 2>/dev/null | awk '/^Version:/{print $2}')"
printf '\n✓ graphify %s pronto\n' "${VERSAO:-instalado}"

case ":$PATH:" in
  *":$BIN:"*) ;;
  *) printf '\n⚠ %s não está no seu PATH. Acrescente ao ~/.bashrc ou ~/.zshrc:\n\n    export PATH="$HOME/.local/bin:$PATH"\n\n' "$BIN" ;;
esac
