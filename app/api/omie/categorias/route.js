import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";

const OMIE_CATEG_URL = "https://app.omie.com.br/api/v1/geral/categorias/";

export const runtime = "nodejs";
export const maxDuration = 30;

// Lista categorias cadastradas no Omie pra popular dropdown.
// Filtra apenas categorias DESPESA (que fazem sentido em pedido de compra).
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

    // Pode ter centenas de categorias — paginação até esgotar
    const todas = [];
    let pagina = 1;
    const maxPaginas = 10; // teto de segurança
    while (pagina <= maxPaginas) {
      const resp = await fetch(OMIE_CATEG_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          call: "ListarCategorias",
          app_key: appKey,
          app_secret: appSecret,
          param: [{ pagina, registros_por_pagina: 100 }],
        }),
      });
      const data = await resp.json();
      if (data.faultstring) {
        return NextResponse.json({ error: data.faultstring }, { status: 400 });
      }
      const lista = data.categoria_cadastro || [];
      todas.push(...lista);
      const totalPaginas = data.total_de_paginas || 1;
      if (pagina >= totalPaginas) break;
      pagina++;
    }

    // Mapeia pra estrutura simples e filtra: só ativas e que aceitem despesa/compra
    const categorias = todas
      .map((c) => ({
        codigo: c.codigo || "",
        descricao: c.descricao || "",
        natureza: c.natureza || "", // "D" = despesa, "R" = receita
        conta_inativa: c.conta_inativa || "N",
        nao_exibir: c.nao_exibir || "N",
      }))
      .filter(
        (c) =>
          c.codigo &&
          c.descricao &&
          c.conta_inativa !== "S" &&
          c.nao_exibir !== "S" &&
          (c.natureza === "D" || c.natureza === "" || c.natureza === "B") // despesa, ou sem natureza específica
      )
      .sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }));

    return NextResponse.json({ categorias, _meta: { count: categorias.length } });
  } catch (err) {
    console.error("categorias error:", err);
    return NextResponse.json({ error: err?.message || "Falha ao listar categorias" }, { status: 500 });
  }
}
