-- Migration: add_modulos
-- Substitui o enum Role (campo único) por:
--   TipoUsuario (ADMIN | USUARIO) + Modulo enum + tabela UserModulo (relação N:N)
-- Regra de migração de dados:
--   role=ADMIN      → tipo=ADMIN,  sem UserModulo
--   role=<qualquer> → tipo=USUARIO + 1 linha em UserModulo com o módulo correspondente

-- ── 1. Novos enums ──────────────────────────────────────────────────────────
CREATE TYPE "TipoUsuario" AS ENUM ('ADMIN', 'USUARIO');

CREATE TYPE "Modulo" AS ENUM (
  'COMERCIAL',
  'ENGENHARIA',
  'COMPRAS',
  'PRODUCAO',
  'ALMOXARIFADO',
  'FINANCEIRO',
  'EXPEDICAO'
);

-- ── 2. Coluna tipo (nullable por ora, para permitir UPDATE) ─────────────────
ALTER TABLE "User" ADD COLUMN "tipo" "TipoUsuario";

-- ── 3. Tabela UserModulo ────────────────────────────────────────────────────
CREATE TABLE "UserModulo" (
    "id"     TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "modulo" "Modulo" NOT NULL,
    CONSTRAINT "UserModulo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserModulo_userId_modulo_key" ON "UserModulo"("userId", "modulo");
CREATE INDEX "UserModulo_userId_idx" ON "UserModulo"("userId");

ALTER TABLE "UserModulo"
    ADD CONSTRAINT "UserModulo_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 4. Migração de dados ────────────────────────────────────────────────────
-- ADMINs ficam sem módulos
UPDATE "User" SET "tipo" = 'ADMIN'   WHERE "role" = 'ADMIN';
-- Todos os outros viram USUARIO
UPDATE "User" SET "tipo" = 'USUARIO' WHERE "role" <> 'ADMIN';

-- Insere linhas em UserModulo para cada role não-admin
INSERT INTO "UserModulo" ("id", "userId", "modulo")
SELECT gen_random_uuid()::text, "id", 'COMERCIAL'::"Modulo"
FROM "User" WHERE "role" = 'COMERCIAL';

INSERT INTO "UserModulo" ("id", "userId", "modulo")
SELECT gen_random_uuid()::text, "id", 'ENGENHARIA'::"Modulo"
FROM "User" WHERE "role" = 'ENGENHARIA';

INSERT INTO "UserModulo" ("id", "userId", "modulo")
SELECT gen_random_uuid()::text, "id", 'COMPRAS'::"Modulo"
FROM "User" WHERE "role" = 'COMPRAS';

INSERT INTO "UserModulo" ("id", "userId", "modulo")
SELECT gen_random_uuid()::text, "id", 'ALMOXARIFADO'::"Modulo"
FROM "User" WHERE "role" = 'ALMOXARIFADO';

INSERT INTO "UserModulo" ("id", "userId", "modulo")
SELECT gen_random_uuid()::text, "id", 'PRODUCAO'::"Modulo"
FROM "User" WHERE "role" = 'PRODUCAO';

INSERT INTO "UserModulo" ("id", "userId", "modulo")
SELECT gen_random_uuid()::text, "id", 'FINANCEIRO'::"Modulo"
FROM "User" WHERE "role" = 'FINANCEIRO';

INSERT INTO "UserModulo" ("id", "userId", "modulo")
SELECT gen_random_uuid()::text, "id", 'EXPEDICAO'::"Modulo"
FROM "User" WHERE "role" = 'EXPEDICAO';

-- ── 5. Tornar tipo NOT NULL ─────────────────────────────────────────────────
ALTER TABLE "User" ALTER COLUMN "tipo" SET NOT NULL;

-- ── 6. Remover coluna role e enum Role ─────────────────────────────────────
ALTER TABLE "User" DROP COLUMN "role";
DROP TYPE "Role";
