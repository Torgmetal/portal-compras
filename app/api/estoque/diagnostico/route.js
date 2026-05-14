// GET /api/estoque/diagnostico — tenta DUAS rotas:
// 1. ListarFamilias (geralmente funciona, nao passa por produtos problematicos)
// 2. ListarProdutosResumido (resiliente — fallback do ListarProdutos)
// Retorna tudo o que conseguiu pra usuario diagnosticar.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 30;

const OMIE_FAMILIAS_URL = "https://app.omie.com.br/api/v1/geral/familias/";
const OMIE_PROD_URL = "https://app.omie.com.br/api/v1/geral/produtos/";

async function callOmie(url, payload) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await resp.json();
  if (data.faultstring) throw new Error(data.faultstring);
  return data;
}

export async function GET() {
  try {
    await requireRole(["ADMIN", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }

  const APP_KEY = process.env.OMIE_APP_KEY;
  const APP_SECRET = process.env.OMIE_APP_SECRET;
  if (!APP_KEY || !APP_SECRET) {
    return NextResponse.json({ error: "Omie nao configurado" }, { status: 500 });
  }

  const resultado = {};

  // 1) Tenta ListarFamilias — endpoint dedicado pra categorias do Omie
  try {
    const data = await callOmie(OMIE_FAMILIAS_URL, {
      call: "ListarFamilias",
      app_key: APP_KEY,
      app_secret: APP_SECRET,
      param: [{ pagina: 1, registros_por_pagina: 100 }],
    });
    const lista = data.familia_cadastro || data.familias_cadastro || [];
    resultado.familias = lista.map((f) => ({
      codigo: String(f.codigo || f.codigo_familia || f.cCodFamilia || ""),
      descricao: String(f.descricao || f.cDescricao || ""),
      inativa: f.inativa === "S" || f.cInativa === "S",
    }));
    resultado.totalFamilias = data.total_de_registros || resultado.familias.length;
  } catch (e) {
    resultado.familiasErro = e.message;
  }

  // 2) Tenta ListarProdutosResumido — fallback resiliente (sem campos extras)
  try {
    const data = await callOmie(OMIE_PROD_URL, {
      call: "ListarProdutosResumido",
      app_key: APP_KEY,
      app_secret: APP_SECRET,
      param: [{ pagina: 1, registros_por_pagina: 10, apenas_importado_api: "N" }],
    });
    const lista = data.produto_servico_resumido || data.produto_resumido || [];
    resultado.produtosResumido = {
      totalNaPagina: lista.length,
      totalRegistros: data.total_de_registros || null,
      totalPaginas: data.total_de_paginas || null,
      exemplo: lista[0] || null,
    };
  } catch (e) {
    resultado.produtosResumidoErro = e.message;
  }

  // 3) Tenta ListarProdutos completo — pode falhar com erro 4474
  try {
    const data = await callOmie(OMIE_PROD_URL, {
      call: "ListarProdutos",
      app_key: APP_KEY,
      app_secret: APP_SECRET,
      param: [{ pagina: 1, registros_por_pagina: 5, apenas_importado_api: "N" }],
    });
    const lista = data.produto_servico_cadastro || [];
    resultado.produtosCompleto = {
      totalNaPagina: lista.length,
      totalPaginas: data.total_de_paginas || null,
      exemplo: lista[0] || null,
    };
  } catch (e) {
    resultado.produtosCompletoErro = e.message;
  }

  return NextResponse.json(resultado);
}
