-- Conjuntos que o PCP programou para MONTAGEM e ficaram parados em PENDENTE.
--
-- Causa: /api/producao/pecas/liberar-montagem só virava o status de quem estava em "CORTE"; o dia e
-- a bancada eram gravados sem esse filtro, então o conjunto ficava com dia marcado e sem setor —
-- invisível em todo painel de montagem. Corrigido em 04/09/2026.
--
-- ⚠ Seguro por construção: o dia (`montagemDiaProgramado`) só foi gravado para as peças que
-- PASSARAM na prontidão (todos os croquis cortados) no momento da liberação. Ter dia é a prova de
-- que o portão foi cumprido.
--
-- Confira antes (esperado: 197 — 185 da OP-097 e 12 da 105):
--   SELECT "opNumero", count(*) FROM "PecaConjunto"
--    WHERE "tipoPeca"='CONJUNTO' AND status='PENDENTE' AND "montagemDiaProgramado" IS NOT NULL
--    GROUP BY 1;

UPDATE "PecaConjunto"
   SET status = 'MONTAGEM', "ultimoSetor" = 'Montagem'
 WHERE "tipoPeca" = 'CONJUNTO'
   AND status = 'PENDENTE'
   AND "montagemDiaProgramado" IS NOT NULL;
