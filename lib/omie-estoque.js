// Sincronizacao de estoque com o Omie. Puxa:
// 1) Produtos das categorias configuradas (descricao, unidade, CMC, qtd)
// 2) Movimentacoes de estoque (entradas via NF + saidas via baixa) — usado
//    pra criar EstoqueMovimentacao no nosso banco e disparar a alocacao FIFO
//
// Best-effort: erros sao logados, mas a sync continua pros proximos itens.
//
// Endpoints Omie usados:
//   - ListarProdutos (produto_servico_cadastro)
//   - ListarPosicaoEstoque
//   - ListarMovimentoEstoque

import { prisma } from "@/lib/prisma";
import { aplicarAlocacaoMovimentacao } from "@/lib/estoque-alocacao";

const OMIE_PROD_URL = "https://app.omie.com.br/api/v1/geral/produtos/";
const OMIE_FAMILIAS_URL = "https://app.omie.com.br/api/v1/geral/familias/";
const OMIE_ESTOQUE_URL = "https://app.omie.com.br/api/v1/estoque/consulta/";
const OMIE_MOV_URL = "https://app.omie.com.br/api/v1/estoque/movestoque/";

async function callOmie(url, payload) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await resp.json();
  if (data.faultstring) {
    throw new Error(data.faultstring);
  }
  return data;
}

// Le ou cria a configuracao do estoque. Singleton.
export async function getConfigEstoque() {
  let cfg = await prisma.configEstoque.findFirst();
  if (!cfg) {
    cfg = await prisma.configEstoque.create({
      data: { categoriasOmie: ["3.1"] },
    });
  }
  return cfg;
}

// Sincroniza produtos das categorias configuradas.
// Cria/atualiza EstoqueItem no banco. Retorna { criados, atualizados, total }.
export async function sincronizarProdutos() {
  const APP_KEY = process.env.OMIE_APP_KEY;
  const APP_SECRET = process.env.OMIE_APP_SECRET;
  if (!APP_KEY || !APP_SECRET) {
    throw new Error("OMIE_APP_KEY/SECRET nao configurados");
  }
  const cfg = await getConfigEstoque();
  const categorias = cfg.categoriasOmie || [];
  if (categorias.length === 0) {
    return { criados: 0, atualizados: 0, total: 0, msg: "Nenhuma categoria configurada" };
  }

  let criados = 0;
  let atualizados = 0;
  let total = 0;
  const errosDetalhes = [];

  // Estrategia: iterar por categoria configurada e PASSAR filtrar_apenas_familia
  // direto na chamada. Isso faz o Omie consultar SO os produtos daquela familia,
  // evitando o produto problematico (erro 4474) que esta em outra familia.
  //
  // Por categoria, tentamos 3 niveis em ordem:
  //   1) ListarProdutos com filtrar_apenas_familia — completo, com tudo
  //   2) ListarProdutosResumido com filtrar_apenas_familia — fallback sem
  //      descricao_familia, mas resiliente
  //   3) Se ambos falharem, pula a pagina e tenta a proxima (page-by-page tolerance)

  // 1) Familias — pra ter rotulo bonito da categoria (best-effort, nao bloqueia)
  const familiasMap = new Map();
  try {
    let p = 1;
    while (true) {
      const data = await callOmie(OMIE_FAMILIAS_URL, {
        call: "ListarFamilias",
        app_key: APP_KEY,
        app_secret: APP_SECRET,
        param: [{ pagina: p, registros_por_pagina: 100 }],
      });
      const lista = data.familia_cadastro || data.familias_cadastro || [];
      for (const f of lista) {
        const cod = String(f.codigo || f.codigo_familia || "");
        if (cod) familiasMap.set(cod, String(f.descricao || f.cDescricao || ""));
      }
      const tot = Number(data.total_de_paginas) || 1;
      if (p >= tot) break;
      p++;
      await new Promise((r) => setTimeout(r, 300));
    }
  } catch (e) {
    errosDetalhes.push(`ListarFamilias: ${e.message}`);
  }

  // 2) Pra cada categoria, busca os produtos com filtro
  for (const codigoFamilia of categorias) {
    const labelFamilia = familiasMap.get(codigoFamilia) || codigoFamilia;
    let pagina = 1;
    const TAMANHO = 50;
    let paginasFalhadas = 0;
    const MAX_FAIL_CONSECUTIVAS = 3;
    let totalPaginasEsperado = 1;

    while (true) {
      // Tenta ListarProdutos (rico) com filtro
      let data;
      let usouResumido = false;
      try {
        data = await callOmie(OMIE_PROD_URL, {
          call: "ListarProdutos",
          app_key: APP_KEY,
          app_secret: APP_SECRET,
          param: [{
            pagina,
            registros_por_pagina: TAMANHO,
            apenas_importado_api: "N",
            filtrar_apenas_familia: codigoFamilia,
          }],
        });
      } catch (e1) {
        // ListarProdutos quebrou nessa pagina — tenta o Resumido
        try {
          data = await callOmie(OMIE_PROD_URL, {
            call: "ListarProdutosResumido",
            app_key: APP_KEY,
            app_secret: APP_SECRET,
            param: [{
              pagina,
              registros_por_pagina: TAMANHO,
              apenas_importado_api: "N",
              filtrar_apenas_familia: codigoFamilia,
            }],
          });
          usouResumido = true;
        } catch (e2) {
          // Ambos falharam — pula pagina
          paginasFalhadas++;
          errosDetalhes.push(`Fam ${codigoFamilia} p${pagina}: ${e1.message} / resumido: ${e2.message}`);
          if (paginasFalhadas >= MAX_FAIL_CONSECUTIVAS) break;
          pagina++;
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
      }
      paginasFalhadas = 0;

      const lista = usouResumido
        ? (data.produto_servico_resumido || data.produto_resumido || [])
        : (data.produto_servico_cadastro || data.produto_cadastro || []);
      if (lista.length === 0) break;

      for (const p of lista) {
        total++;
        const codigoOmie = String(p.codigo || p.codigo_produto || "");
        if (!codigoOmie) continue;
        const r = await upsertEstoqueItem({
          codigoOmie,
          codigoIntegracao: p.codigo_produto_integracao || null,
          descricao: (p.descricao || "").trim(),
          unidade: (p.unidade || "UN").trim().toUpperCase(),
          categoriaOmie: codigoFamilia, // ja sabemos pelo filtro
          categoriaLabel: p.descricao_familia || labelFamilia || null,
          ativo: p.inativo === "S" ? false : true,
        });
        if (r === "criado") criados++;
        else if (r === "atualizado") atualizados++;
      }

      totalPaginasEsperado = Number(data.total_de_paginas) || 1;
      if (pagina >= totalPaginasEsperado) break;
      pagina++;
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  // Apos sync de produtos, atualiza CMC + qtd via ListarPosicaoEstoque
  await sincronizarPosicaoEstoque().catch((e) => errosDetalhes.push(`PosEstoque: ${e.message}`));

  await prisma.configEstoque.update({
    where: { id: cfg.id },
    data: { ultimaSincProd: new Date() },
  });

  return {
    criados, atualizados, total,
    familiasTotal: familiasMap.size,
    categoriasProcessadas: categorias,
    ...(errosDetalhes.length > 0 ? { erros: errosDetalhes.slice(0, 10) } : {}),
  };
}

// Helper: cria ou atualiza EstoqueItem. Retorna "criado" | "atualizado" | null.
async function upsertEstoqueItem(d) {
  if (!d.codigoOmie) return null;
  const existing = await prisma.estoqueItem.findUnique({ where: { codigoOmie: d.codigoOmie } });
  if (existing) {
    await prisma.estoqueItem.update({
      where: { id: existing.id },
      data: {
        descricao: d.descricao,
        unidade: d.unidade,
        categoriaOmie: d.categoriaOmie,
        categoriaLabel: d.categoriaLabel || existing.categoriaLabel || null,
        ativo: d.ativo,
        ultimaSincOmie: new Date(),
      },
    });
    return "atualizado";
  }
  await prisma.estoqueItem.create({
    data: {
      codigoOmie: d.codigoOmie,
      codigoIntegracao: d.codigoIntegracao,
      descricao: d.descricao,
      unidade: d.unidade,
      categoriaOmie: d.categoriaOmie,
      categoriaLabel: d.categoriaLabel,
      ativo: d.ativo,
      cmc: 0,
      qtdAtual: 0,
      ultimaSincOmie: new Date(),
    },
  });
  return "criado";
}

// Atualiza qtd e CMC dos EstoqueItem existentes via ListarPosicaoEstoque.
async function sincronizarPosicaoEstoque() {
  const APP_KEY = process.env.OMIE_APP_KEY;
  const APP_SECRET = process.env.OMIE_APP_SECRET;

  let pagina = 1;
  const TAMANHO = 100;
  const hoje = new Date().toISOString().slice(0, 10).split("-").reverse().join("/"); // dd/mm/yyyy

  while (true) {
    let data;
    try {
      data = await callOmie(OMIE_ESTOQUE_URL, {
        call: "ListarPosEstoque",
        app_key: APP_KEY,
        app_secret: APP_SECRET,
        param: [{
          nPagina: pagina,
          nRegPorPagina: TAMANHO,
          dDataPosicao: hoje,
        }],
      });
    } catch (e) {
      console.error("[sync estoque pos] falhou:", e.message);
      break;
    }

    const lista = data.produtos || [];
    if (lista.length === 0) break;

    for (const p of lista) {
      const codigoOmie = String(p.cCodigo || p.codigo || "");
      if (!codigoOmie) continue;
      const item = await prisma.estoqueItem.findUnique({ where: { codigoOmie } });
      if (!item) continue;  // Produto nao esta nas categorias configuradas
      const cmc = Number(p.nCMC || 0);
      const qtd = Number(p.nSaldo || p.nFisico || 0);
      await prisma.estoqueItem.update({
        where: { id: item.id },
        data: { cmc, qtdAtual: qtd, ultimaSincOmie: new Date() },
      });
    }

    const totalPaginas = Number(data.nTotPaginas) || 1;
    if (pagina >= totalPaginas) break;
    pagina++;
    await new Promise((r) => setTimeout(r, 500));
  }
}

// Sincroniza movimentacoes do Omie e cria EstoqueMovimentacao no nosso banco.
// Dedup via syncCodigoOmie. Retorna { entradas, saidas, total }.
export async function sincronizarMovimentacoes(diasAtras = 7) {
  const APP_KEY = process.env.OMIE_APP_KEY;
  const APP_SECRET = process.env.OMIE_APP_SECRET;
  if (!APP_KEY || !APP_SECRET) {
    throw new Error("OMIE_APP_KEY/SECRET nao configurados");
  }
  const cfg = await getConfigEstoque();

  const ate = new Date();
  const de = new Date();
  de.setDate(de.getDate() - diasAtras);
  const fmtDate = (d) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

  let entradas = 0;
  let saidas = 0;
  let pagina = 1;
  const TAMANHO = 200;

  while (true) {
    let data;
    try {
      data = await callOmie(OMIE_MOV_URL, {
        call: "ListarMovEstoque",
        app_key: APP_KEY,
        app_secret: APP_SECRET,
        param: [{
          nPagina: pagina,
          nRegPorPagina: TAMANHO,
          dDtInicial: fmtDate(de),
          dDtFinal: fmtDate(ate),
        }],
      });
    } catch (e) {
      console.error("[sync mov estoque] falhou:", e.message);
      break;
    }

    const lista = data.movimentos || [];
    if (lista.length === 0) break;

    for (const mov of lista) {
      const codigoOmie = String(mov.cCodProd || mov.codigo_produto || "");
      if (!codigoOmie) continue;
      const item = await prisma.estoqueItem.findUnique({ where: { codigoOmie } });
      if (!item) continue;

      const idMov = String(mov.nIdMov || mov.cCodIntMov || "");
      if (!idMov) continue;
      const syncCodigo = `omie-${idMov}`;
      // Dedup
      const existe = await prisma.estoqueMovimentacao.findUnique({
        where: { syncCodigoOmie: syncCodigo },
      }).catch(() => null);
      if (existe) continue;

      const tipoOmie = String(mov.cTipoMov || mov.cMovimento || "").toUpperCase();
      // Tipos Omie: "E" = entrada, "S" = saida, "A" = ajuste
      const tipo = tipoOmie.startsWith("E") ? "ENTRADA"
        : tipoOmie.startsWith("S") ? "SAIDA"
        : "AJUSTE";
      const origemOmie = tipo === "ENTRADA" ? "OMIE_NF" : tipo === "SAIDA" ? "OMIE_BAIXA" : "MANUAL";
      const qtd = Math.abs(Number(mov.nQtde || mov.quantidade || 0));
      if (qtd <= 0) continue;

      try {
        const created = await prisma.estoqueMovimentacao.create({
          data: {
            itemEstoqueId: item.id,
            tipo,
            origem: origemOmie,
            quantidade: qtd,
            cmcMomento: Number(mov.nCMC || item.cmc || 0),
            observacao: mov.cObservacao || mov.observacao || null,
            syncCodigoOmie: syncCodigo,
            createdAt: mov.dData ? parseOmieDate(mov.dData) : new Date(),
          },
        });
        if (tipo === "ENTRADA") entradas++;
        else if (tipo === "SAIDA") {
          saidas++;
          // Aplica alocacao FIFO automatica nas reservas ativas
          await aplicarAlocacaoMovimentacao(created.id).catch((e) => {
            console.error("[alocacao FIFO] falhou:", e?.message);
          });
        }
      } catch (e) {
        console.error("[mov create] falhou:", e.message);
      }
    }

    const totalPaginas = Number(data.nTotPaginas) || 1;
    if (pagina >= totalPaginas) break;
    pagina++;
    await new Promise((r) => setTimeout(r, 500));
  }

  await prisma.configEstoque.update({
    where: { id: cfg.id },
    data: { ultimaSincMov: new Date() },
  });

  return { entradas, saidas, total: entradas + saidas };
}

function parseOmieDate(s) {
  // formato dd/mm/yyyy → Date
  const m = String(s).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return new Date();
  return new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00`);
}
