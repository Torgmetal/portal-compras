
-- ─────────────────────────────────────────────────────────────────────────────
-- Chave natural das peças do lote liberado (lib/liberacao-pecas.js).
-- O id da peça não sobrevive à reimportação/exclusão da lista; a marca sim.
ALTER TABLE "LiberacaoProducao" ADD COLUMN IF NOT EXISTS "pecaMarcas" JSONB;
