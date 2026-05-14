// GET /api/estoque/diagnostico — testa varias rotas do Omie pra ver qual sobrevive
// ao erro 4474. Estrategias testadas:
//   1) ListarFamilias — independente de produtos, sempre deveria funcionar
//   2) ListarProdutos com filtrar_apenas_familia — filtra pela categoria configurada
//   3) ListarProdutosResumido com mesmo filtro — fallback resiliente
//   4) ListarProdutos SEM filtro — pra documentar o erro
// Retorna tudo no JSON pro usuario ver onde tá o gargalo.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";

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

  // Le categorias configuradas (default ["3.1"])
  let categoriasConfig = ["3.1"];
  try {
    const cfg = await prisma.configEstoque.findFirst();
    if (cfg?.categoriasOmie?.length > 0) categoriasConfig = cfg.categoriasOmie;
  } catch { /* sem config ainda */ }

  const resultado = { categoriasConfig };

  // 1) ListarFamilias — sempre tenta primeiro
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
    resultado.totalFamilias = Number(data.total_de_registros) || resultado.familias.length;
    resultado.totalPaginasFamilias = Number(data.total_de_paginas) || 1;
  } catch (e) {
    resultado.familiasErro = e.message;
  }

  // 2) ListarProdutos COM filtro por familia — uma chamada por categoria configurada
  resultado.testesComFiltro = [];
  for (const codigoFamilia of categoriasConfig) {
    const teste = { categoria: codigoFamilia };
    try {
      const data = await callOmie(OMIE_PROD_URL, {
        call: "ListarProdutos",
        app_key: APP_KEY,
        app_secret: APP_SECRET,
        param: [{
          pagina: 1,
          registros_por_pagina: 5,
          apenas_importado_api: "N",
          filtrar_apenas_familia: codigoFamilia,
        }],
      });
      const lista = data.produto_servico_cadastro || [];
      teste.ok = true;
      teste.totalNaPagina = lista.length;
      teste.totalRegistros = Number(data.total_de_registros) || null;
      teste.totalPaginas = Number(data.total_de_paginas) || null;
      teste.exemplo = lista[0] ? {
        codigo: lista[0].codigo,
        descricao: lista[0].descricao,
        unidade: lista[0].unidade,
        codigo_familia: lista[0].codigo_familia,
        descricao_familia: lista[0].descricao_familia,
      } : null;
    } catch (e) {
      teste.ok = false;
      teste.erro = e.message;
    }
    resultado.testesComFiltro.push(teste);
  }

  // 3) ListarProdutosResumido — testa sem filtro pra documentar
  try {
    const data = await callOmie(OMIE_PROD_URL, {
      call: "ListarProdutosResumido",
      app_key: APP_KEY,
      app_secret: APP_SECRET,
      param: [{ pagina: 1, registros_por_pagina: 10, apenas_importado_api: "N" }],
    });
    const lista = data.produto_servico_resumido || data.produto_resumido || [];
    resultado.produtosResumido = {
      ok: true,
      totalNaPagina: lista.length,
      totalRegistros: Number(data.total_de_registros) || null,
      totalPaginas: Number(data.total_de_paginas) || null,
    };
  } catch (e) {
    resultado.produtosResumido = { ok: false, erro: e.message };
  }

  // 4) ListarProdutos SEM filtro — o que estava quebrando
  try {
    const data = await callOmie(OMIE_PROD_URL, {
      call: "ListarProdutos",
      app_key: APP_KEY,
      app_secret: APP_SECRET,
      param: [{ pagina: 1, registros_por_pagina: 5, apenas_importado_api: "N" }],
    });
    const lista = data.produto_servico_cadastro || [];
    resultado.produtosCompleto = {
      ok: true,
      totalNaPagina: lista.length,
      totalPaginas: Number(data.total_de_paginas) || null,
    };
  } catch (e) {
    resultado.produtosCompleto = { ok: false, erro: e.message };
  }

  return NextResponse.json(resultado);
}
