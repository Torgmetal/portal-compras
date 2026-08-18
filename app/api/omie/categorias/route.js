import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";

const OMIE_CATEG_URL = "https://app.omie.com.br/api/v1/geral/categorias/";

export const runtime = "nodejs";
export const maxDuration = 30;

// Prefixo numérico da descrição (ex: "5.2 - Material Auxiliar" → "5.2").
// É por esse número que o Omie ordena e exibe a "Categoria da Compra".
function prefixoNumerico(descricao) {
  const m = String(descricao || "").match(/^\s*(\d+(?:\.\d+)*)/);
  return m ? m[1] : null;
}

// Ordena igual ao Omie: pelo número da descrição, natural (2 < 3 < ... < 10 < 11),
// e por nível (5.1 < 5.2 < 5.3). Categorias sem número na descrição vão pro fim.
function compararComoOmie(a, b) {
  const pa = prefixoNumerico(a.descricao);
  const pb = prefixoNumerico(b.descricao);
  if (pa && pb) {
    const sa = pa.split(".").map(Number);
    const sb = pb.split(".").map(Number);
    for (let i = 0; i < Math.max(sa.length, sb.length); i++) {
      const x = sa[i] ?? 0;
      const y = sb[i] ?? 0;
      if (x !== y) return x - y;
    }
    return 0;
  }
  if (pa) return -1;
  if (pb) return 1;
  return String(a.descricao).localeCompare(String(b.descricao), "pt-BR");
}

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

    // Mapeia pra estrutura simples e filtra igual ao dropdown de compra do Omie:
    //  - conta_despesa = "S": só categorias de DESPESA (compra); tira receitas (1.x)
    //  - totalizadora  ≠ "S": tira os cabeçalhos de grupo (ex: "3 - Custos Diretos"),
    //    que não são lançáveis
    //  - conta_inativa ≠ "S" e nao_exibir ≠ "S": tira as inativas/ocultas
    //  - transferencia ≠ "S": tira as contas internas de transferência
    const categorias = todas
      .map((c) => ({
        codigo: c.codigo || "",
        descricao: c.descricao || "",
        conta_despesa: c.conta_despesa || "N",
        totalizadora: c.totalizadora || "N",
        transferencia: c.transferencia || "N",
        conta_inativa: c.conta_inativa || "N",
        nao_exibir: c.nao_exibir || "N",
      }))
      .filter(
        (c) =>
          c.codigo &&
          c.descricao &&
          c.conta_despesa === "S" &&
          c.totalizadora !== "S" &&
          c.transferencia !== "S" &&
          c.conta_inativa !== "S" &&
          c.nao_exibir !== "S"
      )
      .sort(compararComoOmie);

    return NextResponse.json({ categorias, _meta: { count: categorias.length } });
  } catch (err) {
    console.error("categorias error:", err);
    return NextResponse.json({ error: err?.message || "Falha ao listar categorias" }, { status: 500 });
  }
}
