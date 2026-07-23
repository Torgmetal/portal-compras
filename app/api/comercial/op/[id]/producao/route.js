// GET — status de PRODUÇÃO de cada peça da OP, tomando as MARCAS da Lista de
// Expedição como universo e o SETOR REAL do Syneco (MesOrdem: setor mais
// avançado com produção > 0). Espelha a regra da Expedição Semanal / Status da
// Obra — o status armazenado da peça não serve (só avança até CORTE).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;
const ROLES = ["ADMIN", "COMERCIAL", "PLANEJAMENTO", "PCP", "ENGENHARIA", "PRODUCAO"];

const SYN_SETOR = { Corte: "CORTE", Montagem: "MONTAGEM", Solda: "SOLDA", Acabamento: "ACABAMENTO", Jato: "JATO", Pintura: "PINTURA" };
const ORDEM = ["PENDENTE", "CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDIDO"];
const normMarca = (m) => String(m || "").trim().toUpperCase();

export async function GET(_req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const op = await prisma.oP.findUnique({ where: { id: params.id }, select: { id: true, numero: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });

  // 1) universo = marcas da Lista de Expedição (dedup por marca, mantém 1ª frente)
  const listas = await prisma.listaExpedicao.findMany({
    where: { OR: [{ opId: op.id }, { opNumero: op.numero }] },
    select: { frente: true, marcasJson: true },
  });
  const marcas = new Map();
  for (const l of listas) {
    for (const m of Array.isArray(l.marcasJson) ? l.marcasJson : []) {
      const k = normMarca(m.marca);
      if (!k || marcas.has(k)) continue;
      marcas.set(k, {
        frente: l.frente, marca: m.marca, descricao: m.descricao || "", qte: m.qte ?? null, pesoTotal: m.pesoTotal || 0,
        expedido: m.expedidoRomaneio === true, romaneio: m.romaneio || null, dataExpedicao: m.dataExpedicao || null,
      });
    }
  }
  if (!marcas.size) return NextResponse.json({ success: true, semLista: true, pecas: [], resumo: [] });

  // 2) setor REAL por marca no Syneco (mais avançado com produção > 0)
  const rows = op.id
    ? await prisma.mesOrdem.groupBy({
        by: ["item", "setor"],
        where: { opId: op.id, produzidoUn: { gt: 0 }, setor: { in: Object.keys(SYN_SETOR) } },
        _sum: { produzidoUn: true },
      }).catch(() => [])
    : [];
  const setorPorMarca = new Map();
  for (const r of rows) {
    const st = SYN_SETOR[r.setor];
    const k = normMarca(r.item);
    if (!st || !k) continue;
    const cur = setorPorMarca.get(k);
    if (cur === undefined || ORDEM.indexOf(st) > ORDEM.indexOf(cur)) setorPorMarca.set(k, st);
  }

  // 3) status de cada peça: expedido > setor do Syneco > pendente
  const pecas = [...marcas.values()].map((m) => {
    const setor = m.expedido ? "EXPEDIDO" : (setorPorMarca.get(normMarca(m.marca)) || "PENDENTE");
    return { ...m, setor };
  }).sort((a, b) => (ORDEM.indexOf(b.setor) - ORDEM.indexOf(a.setor)) || String(a.marca).localeCompare(String(b.marca), "pt-BR"));

  // 4) resumo por etapa (contagem + peso)
  const resumo = ORDEM.map((s) => {
    const doSetor = pecas.filter((p) => p.setor === s);
    return { setor: s, qtd: doSetor.length, pesoKg: doSetor.reduce((x, p) => x + (p.pesoTotal || 0), 0) };
  }).filter((r) => r.qtd > 0);

  const temSyneco = rows.length > 0;
  return NextResponse.json({ success: true, pecas, resumo, total: pecas.length, pesoTotal: pecas.reduce((s, p) => s + (p.pesoTotal || 0), 0), temSyneco });
}
