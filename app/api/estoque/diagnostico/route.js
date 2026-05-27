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
const OMIE_ESTOQUE_URL = "https://app.omie.com.br/api/v1/estoque/consulta/";
const OMIE_MOV_URL = "https://app.omie.com.br/api/v1/estoque/movestoque/";

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

  // 1) ListarFamilias — expõe resposta bruta para identificar campos reais
  try {
    const data = await callOmie(OMIE_FAMILIAS_URL, {
      call: "ListarFamilias",
      app_key: APP_KEY,
      app_secret: APP_SECRET,
      param: [{ pagina: 1, registros_por_pagina: 100 }],
    });
    // Expõe todos os campos da resposta para debug
    resultado.familiasCamposResposta = Object.keys(data);
    resultado.familiasTotalRegistros = data.total_de_registros ?? data.nTotRegistros ?? null;

    // Tenta todos os campos possíveis onde o array de famílias pode estar
    const lista =
      data.familia_cadastro ||
      data.familias_cadastro ||
      data.lista_familias ||
      data.familias ||
      (Array.isArray(data.registros) ? data.registros : null) ||
      [];

    if (lista.length > 0) {
      // Expõe o 1º item bruto para ver os campos reais
      resultado.familiaExemplo = lista[0];
      resultado.familias = lista.map((f) => ({
        codigo: String(
          f.cCodFamilia || f.nCodFamilia || f.codigo || f.codigo_familia ||
          f.id || f.cCod || f.cod || ""
        ),
        descricao: String(
          f.cDesFamilia || f.descricao || f.cDescricao || f.nome ||
          f.cNome || f.descricao_familia || ""
        ),
        inativa: f.inativa === "S" || f.cInativa === "S" || f.inativo === "S",
        _raw: f, // inclui objeto completo para debug
      }));
    } else {
      resultado.familias = [];
      // Expõe resposta bruta completa quando lista está vazia
      resultado.familiasRespostaBruta = data;
    }
    resultado.totalFamilias = Number(data.total_de_registros || data.nTotRegistros) || lista.length;
  } catch (e) {
    resultado.familiasErro = e.message;
  }

  // 2) Testes críticos: variaçoes de ListarProdutos para descobrir o que funciona
  resultado.testesComFiltro = [];

  // 2a) Com família real (código numérico do ConsultarProduto — "Tinta e Solvente")
  // Se retornar produtos, a abordagem por família funciona com códigos numéricos
  const familiaRealTeste = "7318288399"; // codigo_familia retornado pelo ConsultarProduto
  {
    const teste = { categoria: familiaRealTeste, descricao: "codigo real (Tinta e Solvente)" };
    try {
      const data = await callOmie(OMIE_PROD_URL, {
        call: "ListarProdutos",
        app_key: APP_KEY, app_secret: APP_SECRET,
        param: [{ pagina: 1, registros_por_pagina: 3, filtrar_apenas_familia: familiaRealTeste }],
      });
      const lista = data.produto_servico_cadastro || [];
      teste.ok = true;
      teste.totalNaPagina = lista.length;
      teste.totalRegistros = Number(data.total_de_registros) || null;
      teste.totalPaginas = Number(data.total_de_paginas) || null;
      teste.exemplo = lista[0] ? { codigo: lista[0].codigo, descricao: lista[0].descricao, codigo_familia: lista[0].codigo_familia, descricao_familia: lista[0].descricao_familia } : null;
    } catch (e) { teste.ok = false; teste.erro = e.message; }
    resultado.testesComFiltro.push(teste);
  }

  // 2b) SEM apenas_importado_api (omitido) — pode ser que "N" estava filtrando errado
  {
    const teste = { categoria: "sem_filtro_importado", descricao: "ListarProdutos sem apenas_importado_api" };
    try {
      const data = await callOmie(OMIE_PROD_URL, {
        call: "ListarProdutos",
        app_key: APP_KEY, app_secret: APP_SECRET,
        param: [{ pagina: 1, registros_por_pagina: 3 }],
      });
      const lista = data.produto_servico_cadastro || [];
      teste.ok = true;
      teste.totalNaPagina = lista.length;
      teste.totalRegistros = Number(data.total_de_registros) || null;
      teste.totalPaginas = Number(data.total_de_paginas) || null;
      teste.exemplo = lista[0] ? { codigo: lista[0].codigo, descricao: lista[0].descricao, codigo_familia: lista[0].codigo_familia, descricao_familia: lista[0].descricao_familia } : null;
    } catch (e) { teste.ok = false; teste.erro = e.message; }
    resultado.testesComFiltro.push(teste);
  }

  // 2c) apenas_importado_api: "S" (só produtos importados via API)
  {
    const teste = { categoria: "importado_api_S", descricao: "apenas_importado_api: S" };
    try {
      const data = await callOmie(OMIE_PROD_URL, {
        call: "ListarProdutos",
        app_key: APP_KEY, app_secret: APP_SECRET,
        param: [{ pagina: 1, registros_por_pagina: 3, apenas_importado_api: "S" }],
      });
      const lista = data.produto_servico_cadastro || [];
      teste.ok = true;
      teste.totalNaPagina = lista.length;
      teste.totalRegistros = Number(data.total_de_registros) || null;
      teste.totalPaginas = Number(data.total_de_paginas) || null;
      teste.exemplo = lista[0] ? { codigo: lista[0].codigo, descricao: lista[0].descricao, codigo_familia: lista[0].codigo_familia, descricao_familia: lista[0].descricao_familia } : null;
    } catch (e) { teste.ok = false; teste.erro = e.message; }
    resultado.testesComFiltro.push(teste);
  }

  // 2d) ConsultarProduto por código EXTERNO — testa produto Materia Prima conhecido
  {
    const teste = { categoria: "consultar_101000047", descricao: "ConsultarProduto CHAPA AÇO (codigo externo)" };
    try {
      const data = await callOmie(OMIE_PROD_URL, {
        call: "ConsultarProduto",
        app_key: APP_KEY, app_secret: APP_SECRET,
        param: [{ codigo: "101000047" }],
      });
      teste.ok = true;
      teste.descricao_produto = data.descricao;
      teste.codigo_familia = data.codigo_familia;
      teste.descricao_familia = data.descricao_familia;
      teste.inativo = data.inativo;
    } catch (e) { teste.ok = false; teste.erro = e.message; }
    resultado.testesComFiltro.push(teste);
  }

  // 3) ListarProdutosResumido — sem filtro, expõe campos reais da resposta
  try {
    const data = await callOmie(OMIE_PROD_URL, {
      call: "ListarProdutosResumido",
      app_key: APP_KEY,
      app_secret: APP_SECRET,
      param: [{ pagina: 1, registros_por_pagina: 3 }],
    });
    const lista =
      data.produto_servico_resumido ||
      data.produto_resumido ||
      data.produto_servico_cadastro ||
      data.produtos ||
      [];
    resultado.produtosResumido = {
      ok: true,
      totalNaPagina: lista.length,
      totalRegistros: Number(data.total_de_registros || data.nTotRegistros) || null,
      totalPaginas:   Number(data.total_de_paginas   || data.nTotPaginas)   || null,
      camposResposta: Object.keys(data),
      exemplo: lista[0] || null,
    };
  } catch (e) {
    resultado.produtosResumido = { ok: false, erro: e.message };
  }

  // 4) ListarProdutos SEM filtro — sem apenas_importado_api (parâmetro omitido)
  try {
    const data = await callOmie(OMIE_PROD_URL, {
      call: "ListarProdutos",
      app_key: APP_KEY,
      app_secret: APP_SECRET,
      param: [{ pagina: 1, registros_por_pagina: 3 }],
    });
    const lista =
      data.produto_servico_cadastro ||
      data.produto_cadastro ||
      data.produtos ||
      [];
    resultado.produtosCompleto = {
      ok: true,
      totalNaPagina: lista.length,
      totalRegistros: Number(data.total_de_registros || data.nTotRegistros) || null,
      totalPaginas:   Number(data.total_de_paginas   || data.nTotPaginas)   || null,
      camposResposta: Object.keys(data), // nomes reais dos campos da resposta
      exemplo: lista[0] ? {              // 1º produto com todos os campos expostos
        ...lista[0],
      } : null,
    };
  } catch (e) {
    resultado.produtosCompleto = { ok: false, erro: e.message };
  }

  // 4b) ConsultarProduto — testa com o 1º produto do ListarPosEstoque (nCodProd)
  // para verificar se o endpoint funciona e quais campos retorna
  try {
    const hoje = new Date();
    const dDataPosicao = `${String(hoje.getDate()).padStart(2,"0")}/${String(hoje.getMonth()+1).padStart(2,"0")}/${hoje.getFullYear()}`;
    const posData = await callOmie(OMIE_ESTOQUE_URL, {
      call: "ListarPosEstoque",
      app_key: APP_KEY,
      app_secret: APP_SECRET,
      param: [{ nPagina: 1, nRegPorPagina: 1, dDataPosicao }],
    });
    const primeiroProd = (posData.produtos || [])[0];
    if (primeiroProd?.nCodProd) {
      const det = await callOmie(OMIE_PROD_URL, {
        call: "ConsultarProduto",
        app_key: APP_KEY,
        app_secret: APP_SECRET,
        param: [{ codigo_produto: Number(primeiroProd.nCodProd) }],
      });
      resultado.consultarProdutoTeste = {
        ok: true,
        codigoTestado: primeiroProd.cCodigo,
        nCodProd: primeiroProd.nCodProd,
        camposResposta: Object.keys(det),
        codigo_familia: det.codigo_familia || null,
        descricao_familia: det.descricao_familia || null,
        // Mostra campos de família com variações de nome
        familiaVariantes: {
          codigo_familia:    det.codigo_familia,
          descricao_familia: det.descricao_familia,
          cCodFamilia:       det.cCodFamilia,
          cDesFamilia:       det.cDesFamilia,
          familia:           det.familia,
        },
      };
    } else {
      resultado.consultarProdutoTeste = { ok: false, erro: "Nenhum produto em ListarPosEstoque para testar" };
    }
  } catch (e) {
    resultado.consultarProdutoTeste = { ok: false, erro: e.message };
  }

  // 5) ListarPosEstoque — endpoint ALTERNATIVO. Le da tabela de posicao de estoque,
  // nao do cadastro de produtos. Se o registro corrompido nao tiver tocado essa
  // tabela, podemos usar isso pra puxar codigo+descricao+saldo+CMC.
  try {
    const hoje = new Date();
    const dDataPosicao = `${String(hoje.getDate()).padStart(2, "0")}/${String(hoje.getMonth() + 1).padStart(2, "0")}/${hoje.getFullYear()}`;
    const data = await callOmie(OMIE_ESTOQUE_URL, {
      call: "ListarPosEstoque",
      app_key: APP_KEY,
      app_secret: APP_SECRET,
      param: [{
        nPagina: 1,
        nRegPorPagina: 10,
        dDataPosicao,
      }],
    });
    const lista = data.produtos || [];
    resultado.posEstoque = {
      ok: true,
      totalNaPagina: lista.length,
      totalPaginas: Number(data.nTotPaginas) || null,
      totalRegistros: Number(data.nRegistros) || null,
      exemplo: lista[0] ? {
        cCodigo: lista[0].cCodigo,
        cDescricao: lista[0].cDescricao,
        cUnidade: lista[0].cUnidade,
        nSaldo: lista[0].nSaldo,
        nFisico: lista[0].nFisico,
        nCMC: lista[0].nCMC,
        // Tudo o que aparecer alem desses campos
        ...Object.keys(lista[0]).filter((k) => !["cCodigo","cDescricao","cUnidade","nSaldo","nFisico","nCMC"].includes(k)).reduce((a, k) => ({ ...a, [k]: lista[0][k] }), {}),
      } : null,
    };
  } catch (e) {
    resultado.posEstoque = { ok: false, erro: e.message };
  }

  // 6) ListarMovEstoque — outro endpoint que nao depende do cadastro de produtos
  try {
    const ate = new Date();
    const de = new Date();
    de.setDate(de.getDate() - 7);
    const fmt = (d) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
    const data = await callOmie(OMIE_MOV_URL, {
      call: "ListarMovEstoque",
      app_key: APP_KEY,
      app_secret: APP_SECRET,
      param: [{
        nPagina: 1,
        nRegPorPagina: 10,
        dDtInicial: fmt(de),
        dDtFinal: fmt(ate),
      }],
    });
    const lista = data.movimentos || [];
    resultado.movEstoque = {
      ok: true,
      totalNaPagina: lista.length,
      totalPaginas: Number(data.nTotPaginas) || null,
      exemplo: lista[0] || null,
    };
  } catch (e) {
    resultado.movEstoque = { ok: false, erro: e.message };
  }

  return NextResponse.json(resultado);
}
