<<<<<<< HEAD

-- ─────────────────────────────────────────────────────────────────────────────
-- Chave natural das peças do lote liberado (lib/liberacao-pecas.js).
-- O id da peça não sobrevive à reimportação/exclusão da lista; a marca sim.
ALTER TABLE "LiberacaoProducao" ADD COLUMN IF NOT EXISTS "pecaMarcas" JSONB;
=======
-- Área de evidência da foto de inspeção (lib/fotos-evidencia.js).
-- Aditiva e compatível com o que está no ar: coluna nula = foto sem área, como todas as antigas.
-- RODAR ANTES do deploy que usa `FotoInspecao.evidencia`.
ALTER TABLE "FotoInspecao" ADD COLUMN IF NOT EXISTS "evidencia" TEXT;
>>>>>>> f5fa1f41 (Foto de ensaio por área de evidência (e as seis molduras que saíam vazias))
