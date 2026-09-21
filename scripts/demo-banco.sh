#!/bin/sh
# Copia o banco de PRODUÇÃO (Neon) para o Postgres LOCAL `torg_demo` — o banco do ambiente de
# demonstração. Leitura na produção (pg_dump), escrita só no Mac. ~15 s para os 230 MB.
#
#   sh scripts/demo-banco.sh            # recria torg_demo do zero com a produção de agora
#
# Pré-requisitos (uma vez): `brew install postgresql@17 && brew services start postgresql@17`.
# A demo aponta para ele pelo `.env.demo` (ver docs/memoria-claude/torg_ambiente_demo.md).
set -e
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"
cd "$(dirname "$0")/.."
URL=$(node --env-file=.env.local -e "process.stdout.write(process.env.DATABASE_URL_UNPOOLED || '')")
[ -n "$URL" ] || { echo "DATABASE_URL_UNPOOLED não está no .env.local"; exit 1; }
DUMP=$(mktemp -t torg-prod).dump
echo "→ pg_dump da produção…"; pg_dump "$URL" --format=custom --no-owner --no-privileges --file="$DUMP"
echo "→ recriando torg_demo…"; psql -q -d postgres -c "DROP DATABASE IF EXISTS torg_demo;" -c "CREATE DATABASE torg_demo;"
pg_restore --dbname=torg_demo --no-owner --no-privileges --jobs=4 "$DUMP"
rm -f "$DUMP"
psql -tA -d torg_demo -c "SELECT 'torg_demo pronto: ' || (SELECT count(*) FROM \"OP\") || ' OPs, ' || (SELECT count(*) FROM \"User\") || ' usuários, ' || (SELECT count(*) FROM \"PecaConjunto\") || ' peças'"
