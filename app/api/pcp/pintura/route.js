// GET /api/pcp/pintura?op=067[&ids=a,b,c] → o caderno de pintura daquela OP.
//
// Vitor (07/09/2026): "todas as folhas sairão da OP selecionada na barra do Gantt de cada OP".
// Por isso a rota é por OBRA, e os `ids` restringem ao lote que a barra representa — sem eles,
// responde pela OP inteira.
//
// ⚠ SÓ LÊ. Nada aqui grava: o PLP é documento da Qualidade e o CMR é do Almoxarifado. O que o PCP
// informa para destravar uma liberação vai para o AuditLog em /api/pcp/fila-setor, não para cá.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { cadernoDePintura } from "@/lib/pintura-lote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = ["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO", "QUALIDADE"];

export async function GET(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const u = new URL(req.url);
  const op = String(u.searchParams.get("op") || "").trim();
  if (!op) return NextResponse.json({ error: "Informe a OP." }, { status: 400 });

  // ⚠ limite no número de ids: a barra do Gantt manda o lote, não a obra inteira, mas nada impede
  // alguém de montar a URL na mão — e uma lista sem teto vira uma consulta sem teto.
  const ids = String(u.searchParams.get("ids") || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 5000);

  try {
    return NextResponse.json(await cadernoDePintura(op, ids));
  } catch (e) {
    return NextResponse.json({ error: e.message || "Falha ao montar o caderno de pintura" }, { status: 400 });
  }
}
