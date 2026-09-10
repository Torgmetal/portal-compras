CREATE TABLE "GanttDistribuicao" (
  "id" TEXT NOT NULL,
  "pecaId" TEXT NOT NULL,
  "setor" TEXT NOT NULL,
  "quantidade" INTEGER NOT NULL,
  "ancoraDia" DATE,
  "ancoraRecurso" TEXT,
  "partes" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GanttDistribuicao_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GanttDistribuicao_pecaId_setor_key" ON "GanttDistribuicao"("pecaId", "setor");
CREATE INDEX "GanttDistribuicao_setor_idx" ON "GanttDistribuicao"("setor");
ALTER TABLE "GanttDistribuicao" ADD CONSTRAINT "GanttDistribuicao_pecaId_fkey" FOREIGN KEY ("pecaId") REFERENCES "PecaConjunto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
