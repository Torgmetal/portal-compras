// GET — marcas de todas as frentes da OP, para EXPORTAR a lista de expedição.
// Só é chamado no clique do "Exportar" (o payload é grande: uma frente pode ter
// milhares de marcas), por isso fica fora do GET do resumo.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;
const ROLES = ["ADMIN", "ENGENHARIA", "COMERCIAL", "PLANEJAMENTO", "PCP", "EXPEDICAO"];

export async function GET(_req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const op = await prisma.oP.findUnique({ where: { id: params.id }, select: { id: true, numero: true, obra: true, cliente: true, refCliente: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });

  const listas = await prisma.listaExpedicao.findMany({
    where: { OR: [{ opId: op.id }, { opNumero: op.numero }] },
    orderBy: { frente: "asc" },
    select: { frente: true, arquivo: true, revisao: true, pesoContratado: true, pesoExpedido: true, marcasJson: true },
  });

  // Cruza os romaneios EMITIDOS (RomaneioPrevio.emitidoEm) → quanto já saiu por marca.
  const previosEmitidos = await prisma.romaneioPrevio.findMany({
    where: { OR: [{ opId: op.id }, { opNumero: String(op.numero) }], emitidoEm: { not: null } },
    select: { numero: true, emitidoEm: true, itens: true },
  });
  const expMap = new Map(); // MARCA(upper) -> { qtd, romaneios:Set, data }
  for (const r of previosEmitidos) {
    for (const it of (Array.isArray(r.itens) ? r.itens : [])) {
      const k = String(it.marca || "").trim().toUpperCase();
      if (!k) continue;
      const cur = expMap.get(k) || { qtd: 0, romaneios: new Set(), data: null };
      cur.qtd += Number(it.qte ?? it.qtd) || 0;
      cur.romaneios.add(String(r.numero).padStart(2, "0"));
      if (r.emitidoEm && (!cur.data || r.emitidoEm > cur.data)) cur.data = r.emitidoEm;
      expMap.set(k, cur);
    }
  }

  const frentes = listas.map((l) => ({
    frente: l.frente,
    arquivo: l.arquivo,
    revisao: l.revisao,
    pesoContratado: l.pesoContratado,
    pesoExpedido: l.pesoExpedido,
    marcas: (Array.isArray(l.marcasJson) ? l.marcasJson : []).map((m) => {
      const qte = m.qte ?? null;
      const ex = expMap.get(String(m.marca || "").trim().toUpperCase());
      // Quanto já saiu nos romaneios emitidos (limitado ao total da marca).
      const expedidoQtd = ex ? (qte != null ? Math.min(ex.qtd, qte) : ex.qtd) : 0;
      const romaneios = ex ? [...ex.romaneios].sort() : [];
      // Situação derivada da quantidade: expedida (tudo saiu) / parcial / pendente.
      const totalmenteExpedida = qte != null && qte > 0 && expedidoQtd >= qte;
      return {
        marca: m.marca,
        descricao: m.descricao || "",
        qte,
        pesoUnit: m.pesoUnit ?? null,
        pesoTotal: m.pesoTotal ?? 0,
        expedidoQtd,                          // nº de peças já expedidas (romaneios emitidos)
        romaneios,                            // nº dos romaneios em que saiu
        // expedido (booleano) mantido p/ compat: true só quando saiu TUDO. Sem romaneio,
        // cai na coluna "Marca (Expedido)" do próprio arquivo.
        expedido: expedidoQtd > 0 ? totalmenteExpedida : (m.expedidoRomaneio ?? (m.expedidoArquivo === true ? true : m.expedidoArquivo === false ? false : null)),
        origemExpedido: ex ? "romaneio" : (m.expedidoRomaneio != null ? "romaneio" : m.expedidoArquivo != null ? "arquivo" : null),
        romaneio: romaneios.length ? romaneios.join(", ") : (m.romaneio ?? null),
        dataExpedicao: ex?.data ?? m.dataExpedicao ?? null,
      };
    }),
  }));

  return NextResponse.json({ success: true, op: { numero: op.numero, obra: op.obra, cliente: op.cliente, refCliente: op.refCliente }, frentes });
}
