// GET — status de PRODUÇÃO de cada peça da OP, tomando as MARCAS da Lista de
// Expedição como universo e o SETOR REAL do Syneco (MesOrdem: setor mais
// avançado com produção > 0). Espelha a regra da Expedição Semanal / Status da
// Obra — o status armazenado da peça não serve (só avança até CORTE).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, requireUser } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;
const ROLES = ["ADMIN", "COMERCIAL", "PLANEJAMENTO", "PCP", "ENGENHARIA", "PRODUCAO"];

const SYN_SETOR = { Corte: "CORTE", Montagem: "MONTAGEM", Solda: "SOLDA", Acabamento: "ACABAMENTO", Jato: "JATO", Pintura: "PINTURA" };
const ORDEM = ["PENDENTE", "CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDIDO"];
const normMarca = (m) => String(m || "").trim().toUpperCase();

export async function GET(_req, { params }) {
  // Leitura da aba aberta a todos os setores (dado operacional, sem financeiro).
  try { await requireUser(); } catch (e) { return NextResponse.json({ error: e.message }, { status: 401 }); }
  const op = await prisma.oP.findUnique({ where: { id: params.id }, select: { id: true, numero: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });

  // 1) universo = marcas da Lista de Expedição (dedup por marca, mantém 1ª frente)
  const listas = await prisma.listaExpedicao.findMany({
    where: { OR: [{ opId: op.id }, { opNumero: op.numero }] },
    select: { frente: true, marcasJson: true },
  });
  // Romaneios EMITIDOS no portal → expedido por marca (quantidade + nº do romaneio + data).
  const previosEmitidos = await prisma.romaneioPrevio.findMany({
    where: { OR: [{ opId: op.id }, { opNumero: String(op.numero) }], emitidoEm: { not: null } },
    select: { numero: true, emitidoEm: true, itens: true },
  });
  const expMap = new Map();
  for (const r of previosEmitidos) for (const it of (Array.isArray(r.itens) ? r.itens : [])) {
    const kk = normMarca(it.marca); if (!kk) continue;
    const cur = expMap.get(kk) || { qtd: 0, romaneios: new Set(), data: null };
    cur.qtd += Number(it.qte ?? it.qtd) || 0;
    cur.romaneios.add(String(r.numero).padStart(2, "0"));
    if (r.emitidoEm && (!cur.data || r.emitidoEm > cur.data)) cur.data = r.emitidoEm;
    expMap.set(kk, cur);
  }

  // Baixas MANUAIS (sem romaneio) por marca — contam como expedido (não pendente).
  const baixasOP = await prisma.baixaExpedicao.findMany({ where: { opId: op.id }, select: { marca: true, qtd: true, motivo: true } });
  const baixaMap = new Map();
  for (const b of baixasOP) { const kk = normMarca(b.marca); if (!kk) continue; const c = baixaMap.get(kk) || { qtd: 0, motivo: null }; c.qtd += Number(b.qtd) || 0; c.motivo = c.motivo || b.motivo; baixaMap.set(kk, c); }

  const marcas = new Map();
  for (const l of listas) {
    for (const m of Array.isArray(l.marcasJson) ? l.marcasJson : []) {
      const k = normMarca(m.marca);
      if (!k || marcas.has(k)) continue;
      const ex = expMap.get(k);
      const bx = baixaMap.get(k);
      const qte = m.qte ?? null;
      const totalExp = (ex ? ex.qtd : 0) + (bx ? bx.qtd : 0);
      const expedidoQtd = qte != null ? Math.min(totalExp, qte) : totalExp;
      // 100% expedida (setor EXPEDIDO) por quantidade; senão cai no booleano legado.
      const full = expedidoQtd > 0 && qte != null && qte > 0 ? expedidoQtd >= qte : m.expedidoRomaneio === true;
      marcas.set(k, {
        frente: l.frente, marca: m.marca, descricao: m.descricao || "", qte, pesoTotal: m.pesoTotal || 0,
        expedidoQtd, expedido: full,
        temExpedicao: expedidoQtd > 0 || m.expedidoRomaneio === true, // saiu algo → mostra romaneio/data
        baixaMotivo: bx ? bx.motivo : null, // baixa manual (sem romaneio)
        romaneio: ex ? [...ex.romaneios].sort().join(", ") : (bx ? "baixa manual" : (m.romaneio || null)),
        dataExpedicao: ex?.data ?? m.dataExpedicao ?? null,
      });
    }
  }
  // Sem Lista de Expedição (Lista Avançada) importada: cai pras peças da LPC (Tekla), que
  // casam com o Syneco (MesOrdem) por marca — assim OPs sem a lista ainda têm status por peça
  // (ex.: OP-089). Croqui + conjunto entram: o croqui reflete o corte, o conjunto a montagem+.
  if (!marcas.size) {
    const pcs = await prisma.pecaConjunto.findMany({
      where: { opId: op.id, fonte: "LPC_IMPORT" },
      select: { marca: true, descricao: true, qte: true, pesoTotalKg: true },
    });
    for (const p of pcs) {
      const k = normMarca(p.marca);
      if (!k || marcas.has(k)) continue;
      const ex = expMap.get(k); const bx = baixaMap.get(k);
      const qte = p.qte ?? null;
      const totalExp = (ex ? ex.qtd : 0) + (bx ? bx.qtd : 0);
      const expedidoQtd = qte != null ? Math.min(totalExp, qte) : totalExp;
      marcas.set(k, {
        frente: "", marca: p.marca, descricao: p.descricao || "", qte, pesoTotal: p.pesoTotalKg || 0,
        expedidoQtd, expedido: expedidoQtd > 0 && qte != null && qte > 0 ? expedidoQtd >= qte : false,
        temExpedicao: expedidoQtd > 0,
        baixaMotivo: bx ? bx.motivo : null,
        romaneio: ex ? [...ex.romaneios].sort().join(", ") : (bx ? "baixa manual" : null),
        dataExpedicao: ex?.data ?? null,
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

  // Tipo de cada peça (CROQUI / CONJUNTO / avulsa) — pro relatório separar a rota: o croqui (P)
  // só passa pelo corte e vira conjunto na montagem; o conjunto segue montagem→pintura.
  const tiposPC = await prisma.pecaConjunto.findMany({ where: { opId: op.id }, select: { marca: true, tipoPeca: true } });
  const tipoPorMarca = new Map();
  for (const t of tiposPC) { const k = normMarca(t.marca); if (k && !tipoPorMarca.has(k)) tipoPorMarca.set(k, t.tipoPeca || null); }

  // 3) status de cada peça: expedido > setor do Syneco > pendente
  const pecas = [...marcas.values()].map((m) => {
    const setor = m.expedido ? "EXPEDIDO" : (setorPorMarca.get(normMarca(m.marca)) || "PENDENTE");
    return { ...m, setor, tipoPeca: tipoPorMarca.get(normMarca(m.marca)) || null };
  }).sort((a, b) => (ORDEM.indexOf(b.setor) - ORDEM.indexOf(a.setor)) || String(a.marca).localeCompare(String(b.marca), "pt-BR"));

  // 4) resumo por etapa (contagem + peso)
  const resumo = ORDEM.map((s) => {
    const doSetor = pecas.filter((p) => p.setor === s);
    return { setor: s, qtd: doSetor.length, pesoKg: doSetor.reduce((x, p) => x + (p.pesoTotal || 0), 0) };
  }).filter((r) => r.qtd > 0);

  const temSyneco = rows.length > 0;
  return NextResponse.json({ success: true, pecas, resumo, total: pecas.length, pesoTotal: pecas.reduce((s, p) => s + (p.pesoTotal || 0), 0), temSyneco });
}
