// Cache no banco do snapshot de Faturamento por obra (dados do Omie).
// Evita consultar o Omie (~40s) a cada acesso à tela. Atualizado no botão
// "Atualizar" (forçado) e por cron 1x/dia.
import { prismaDirect } from "@/lib/prisma";
import { listarPedidosVendaAbertos } from "@/lib/omie-pedidos-abertos";

const CACHE_ID = "default";

// Lê o snapshot do cache (ou null se ainda não existe).
export async function lerCacheFaturamento() {
  try {
    const row = await prismaDirect.faturamentoCache.findUnique({ where: { id: CACHE_ID } });
    if (!row) return null;
    return { ...row.dados, atualizadoEm: row.atualizadoEm.toISOString() };
  } catch {
    return null;
  }
}

// Consulta o Omie fresco e grava no cache. Retorna o snapshot.
export async function atualizarCacheFaturamento() {
  const dados = await listarPedidosVendaAbertos(true);
  const atualizadoEm = new Date();
  await prismaDirect.faturamentoCache.upsert({
    where: { id: CACHE_ID },
    create: { id: CACHE_ID, dados, atualizadoEm },
    update: { dados, atualizadoEm },
  });
  return { ...dados, atualizadoEm: atualizadoEm.toISOString() };
}
