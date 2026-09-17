-- A ordem das fases é a prioridade compartilhada nas abas da OP.
ALTER TABLE "OP" ADD COLUMN IF NOT EXISTS "fasesReferencias" JSONB;
