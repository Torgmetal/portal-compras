// Executada no build somente quando a melhoria for publicada.
// Registros antes marcados como preenchidos representam o preenchimento total.
export const RH_VAGAS_BAIXA_SQL = `DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'Vaga' AND column_name = 'quantidadePreenchida'
  ) THEN
    ALTER TABLE "Vaga" ADD COLUMN "quantidadePreenchida" INTEGER NOT NULL DEFAULT 0;
  END IF;
  UPDATE "Vaga" SET "quantidadePreenchida" = "quantidade"
    WHERE "status" = 'PREENCHIDA' AND "quantidadePreenchida" <> "quantidade";
END $$;`;
