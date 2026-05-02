-- AlterTable
ALTER TABLE "AditivoItem" ADD COLUMN     "cmcMedio" DOUBLE PRECISION,
ADD COLUMN     "localEstoque" TEXT;

-- AlterTable
ALTER TABLE "OPItem" ADD COLUMN     "cmcMedio" DOUBLE PRECISION,
ADD COLUMN     "localEstoque" TEXT;
