// GET  /api/expedicao/op/[id] — Visão da OP para a Expedição: marcas previstas
//       (Lista de Expedição da Engenharia, já importada do SharePoint) cruzadas
//       com o expedido (romaneios), com KPIs de peso e status por marca.
// POST /api/expedicao/op/[id] — sincroniza (re-importa) a Lista do SharePoint.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { importarListasOP } from "@/lib/lista-avancada-sharepoint";

export const runtime = "nodejs";
export const maxDuration = 120;

const ROLES = ["ADMIN", "EXPEDICAO", "PRODUCAO", "COMERCIAL", "PLANEJAMENTO", "PCP", "ENGENHARIA"];
const k = (s) => String(s || "").trim().toUpperCase();

// Consolida as marcas de todas as frentes da OP (dedup por marca, soma qtd/peso).
function consolidar(listas) {
  const map = new Map();
  for (const l of listas) {
    const arr = Array.isArray(l.marcasJson) ? l.marcasJson : [];
    for (const m of arr) {
      const key = k(m.marca);
      if (!key) continue;
      const exp = m.expedidoRomaneio ?? (m.expedidoArquivo === true ? true : m.expedidoArquivo === false ? false : null);
      const cur = map.get(key) || {
        marca: m.marca, descricao: m.descricao || "", qte: 0, pesoUnit: m.pesoUnit ?? null,
        pesoTotal: 0, expedido: false, temInfo: false, romaneio: null, dataExpedicao: null, frentes: [],
      };
      cur.qte += Number(m.qte || 0);
      cur.pesoTotal += Number(m.pesoTotal || 0);
      if (!cur.descricao && m.descricao) cur.descricao = m.descricao;
      if (exp === true) { cur.expedido = true; cur.temInfo = true; }
      else if (exp === false) cur.temInfo = true;
      if (m.romaneio && !cur.romaneio) cur.romaneio = m.romaneio;
      if (m.dataExpedicao && !cur.dataExpedicao) cur.dataExpedicao = m.dataExpedicao;
      if (l.frente && !cur.frentes.includes(l.frente)) cur.frentes.push(l.frente);
      map.set(key, cur);
    }
  }
  // ordena por marca (numérico-natural)
  return [...map.values()].sort((a, b) => String(a.marca).localeCompare(String(b.marca), undefined, { numeric: true, sensitivity: "base" }));
}

async function montar(op) {
  const listas = await prisma.listaExpedicao.findMany({
    where: { OR: [{ opId: op.id }, { opNumero: op.numero }] },
    orderBy: { frente: "asc" },
    select: {
      frente: true, arquivo: true, revisao: true, marcas: true, qtdItens: true,
      pesoContratado: true, pesoExpedido: true, pesoFaltante: true, importadoEm: true, fileModificado: true, marcasJson: true,
    },
  });

  const marcas = consolidar(listas);
  const expedidas = marcas.filter((m) => m.expedido).length;
  const pesoContratado = listas.reduce((s, l) => s + (l.pesoContratado || 0), 0);
  const pesoExpedido = listas.reduce((s, l) => s + (l.pesoExpedido || 0), 0);
  const pesoFaltante = listas.reduce((s, l) => s + (l.pesoFaltante || 0), 0);

  const frentes = listas.map((l) => ({
    frente: l.frente, arquivo: l.arquivo, revisao: l.revisao, marcas: l.marcas,
    pesoContratado: l.pesoContratado, pesoExpedido: l.pesoExpedido, importadoEm: l.importadoEm, fileModificado: l.fileModificado,
  }));

  return {
    op: { id: op.id, numero: op.numero, cliente: op.cliente, obra: op.obra },
    kpis: {
      marcasTotal: marcas.length,
      marcasExpedidas: expedidas,
      marcasPendentes: marcas.length - expedidas,
      pctMarcas: marcas.length ? Math.round((expedidas / marcas.length) * 100) : 0,
      pesoContratado, pesoExpedido, pesoFaltante,
      pctPeso: pesoContratado > 0 ? Math.round((pesoExpedido / pesoContratado) * 100) : 0,
    },
    frentes,
    marcas,
    temLista: listas.length > 0,
  };
}

export async function GET(_req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const op = await prisma.oP.findUnique({ where: { id: params.id }, select: { id: true, numero: true, cliente: true, obra: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });
  return NextResponse.json({ success: true, ...(await montar(op)) });
}

export async function POST(_req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "EXPEDICAO", "PLANEJAMENTO", "PCP"]); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const op = await prisma.oP.findUnique({ where: { id: params.id }, select: { id: true, numero: true, cliente: true, obra: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });

  let r;
  try { r = await importarListasOP({ opNumero: op.numero, opId: op.id, userId: user.id }); }
  catch (e) { return NextResponse.json({ error: "Falha ao ler a pasta do SharePoint: " + (e?.message || "") }, { status: 502 }); }
  if (!r.ok) return NextResponse.json({ error: r.erro || "Não foi possível importar." }, { status: 404 });

  await prisma.auditLog.create({
    data: { userId: user.id, action: "EXPEDICAO_SYNC_LISTA", entity: "OP", entityId: op.id, diff: { resultados: r.resultados?.map((x) => ({ frente: x.frente, ok: x.ok, revisao: x.revisao })) } },
  }).catch(() => {});

  return NextResponse.json({ success: true, resultados: r.resultados, ...(await montar(op)) });
}
