import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";

const OMIE_LOCAL_URL = "https://app.omie.com.br/api/v1/estoque/local/";

export const runtime = "nodejs";
export const maxDuration = 30;

// Lista locais de estoque cadastrados no Omie pra popular dropdown.
export async function GET() {
  try {
    await requireRole(["ADMIN", "COMPRAS"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ error: e.message }, { status });
  }

  try {
    const appKey = process.env.OMIE_APP_KEY;
    const appSecret = process.env.OMIE_APP_SECRET;
    if (!appKey || !appSecret) {
      return NextResponse.json(
        { error: "Credenciais Omie não configuradas (OMIE_APP_KEY/OMIE_APP_SECRET)" },
        { status: 500 }
      );
    }

    const resp = await fetch(OMIE_LOCAL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        call: "ListarLocaisEstoque",
        app_key: appKey,
        app_secret: appSecret,
        param: [{ nPagina: 1, nRegPorPagina: 100 }],
      }),
    });

    const data = await resp.json();
    if (data.faultstring) {
      return NextResponse.json({ error: data.faultstring }, { status: 400 });
    }

    // Resposta Omie: { locaisEncontrados: [{ codigo_local_estoque, codigo, descricao, inativo, ... }] }
    const raw = data.locaisEncontrados || data.cadastros || data.locais || [];
    const lista = raw.map((l) => ({
      nCodLocal: l.codigo_local_estoque || l.nCodLocal || 0,
      cCodLocal: l.codigo || l.cCodLocal || "",
      cDescricao: l.descricao || l.cDescricao || "",
      cAtivo: l.inativo === "S" ? "N" : "S",
    })).filter((l) => l.cAtivo !== "N" && l.cDescricao);

    return NextResponse.json({ locais: lista, _meta: { count: lista.length } });
  } catch (err) {
    console.error("locais-estoque error:", err);
    return NextResponse.json({ error: err?.message || "Falha ao listar locais" }, { status: 500 });
  }
}
