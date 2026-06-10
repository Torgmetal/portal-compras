// Faturamento Direto (FD) — derivação com fallback por categoria.
//
// A fonte da verdade é OPItem.faturamentoDireto / AditivoItem.faturamentoDireto
// (marcado pelo Comercial, por item). O elo direto RMItem.opItemId quase nunca
// é preenchido (a engenharia cria RMs apontando só a OP), então a derivação
// usa o MESMO fallback por categoria já adotado no painel de OPs e no
// sugerir-vencedores (app/compras/painel-ops/[opId]/page.js):
//   - cada categoria da OP é FD se todos os seus itens são FD (misto → FD,
//     conservador: melhor avisar que algo é FD do que esconder);
//   - a RM é FD se TODAS as suas categoriasOP são FD;
//   - RM.faturamentoDireto=true (toggle de aluguel) também conta.
import { prisma } from "@/lib/prisma";

/** Monta o Map categoria → FD a partir dos itens (e aditivos) de uma OP. */
export function fdPorCategoriaDaOP(op) {
  const fdPorCategoria = new Map();
  const todos = [
    ...(op?.itens || []).map((i) => ({ categoria: i.categoria, fd: i.faturamentoDireto })),
    ...(op?.aditivos || []).flatMap((a) => (a.itens || []).map((i) => ({ categoria: i.categoria, fd: i.faturamentoDireto }))),
  ];
  for (const { categoria, fd } of todos) {
    if (!categoria) continue;
    if (!fdPorCategoria.has(categoria)) fdPorCategoria.set(categoria, fd);
    else if (fdPorCategoria.get(categoria) !== fd) fdPorCategoria.set(categoria, true);
  }
  return fdPorCategoria;
}

/** RM é FD? true/false, ou null quando indefinido (sem categoriasOP e sem flag). */
export function rmEhFD(rm, fdPorCategoria) {
  if (rm?.faturamentoDireto === true) return true; // toggle da RM (aluguel)
  if (rm?.categoriasOP?.length > 0) {
    return rm.categoriasOP.every((c) => fdPorCategoria.get(c) === true);
  }
  return null;
}

/**
 * Deriva FD por RM para um conjunto de rmIds (busca OPs/itens no banco).
 * @returns {Promise<Map<string, boolean>>} rmId → é FD (indefinido = false)
 */
export async function mapearFDPorRM(rmIds) {
  const out = new Map();
  const ids = [...new Set(rmIds)].filter(Boolean);
  if (ids.length === 0) return out;

  const rms = await prisma.rM.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      categoriasOP: true,
      faturamentoDireto: true,
      op: {
        select: {
          itens: { select: { categoria: true, faturamentoDireto: true } },
          aditivos: { select: { itens: { select: { categoria: true, faturamentoDireto: true } } } },
        },
      },
    },
  });

  for (const rm of rms) {
    const fdPorCategoria = fdPorCategoriaDaOP(rm.op);
    out.set(rm.id, rmEhFD(rm, fdPorCategoria) === true);
  }
  return out;
}

/** Decide FD de um item de RM: vínculo direto ao OPItem/AditivoItem > fallback da RM. */
export function itemEhFD(rmItem, fdPorRM) {
  if (rmItem?.opItem || rmItem?.aditivoItem) {
    return !!(rmItem.opItem?.faturamentoDireto || rmItem.aditivoItem?.faturamentoDireto);
  }
  return fdPorRM.get(rmItem?.rmId) === true;
}
