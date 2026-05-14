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

  // Estrategia em 2 niveis:
  // 1) ListarFamilias pra mapear codigo da familia → descricao
  // 2) ListarProdutos (preferido) OU fallback ListarProdutosResumido se quebrar
  let usouFallback = false;

  // 1) Familias — pra ter rotulo bonito da categoria
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

  // 2) Tenta ListarProdutos primeiro (mais completo).
  // Tolerante a erros — se uma pagina falhar, pula pra proxima.
  // Se TODAS as paginas iniciais falharem, cai pro fallback.
  let pagina = 1;
  let paginasFalhadas = 0;
  let paginasOK = 0;
  const TAMANHO = 20;
  const MAX_FAIL_CONSECUTIVAS = 5;

  // Loop ListarProdutos completo
  while (true) {
    let data;
    try {
      data = await callOmie(OMIE_PROD_URL, {
        call: "ListarProdutos",
        app_key: APP_KEY,
        app_secret: APP_SECRET,
        param: [{ pagina, registros_por_pagina: TAMANHO, apenas_importado_api: "N" }],
      });
      paginasFalhadas = 0;
      paginasOK++;
    } catch (e) {
      paginasFalhadas++;
      errosDetalhes.push(`ListarProdutos p${pagina}: ${e.message}`);
      // Se logo no inicio ja falhou 3 paginas seguidas, troca pra fallback
      if (paginasOK === 0 && paginasFalhadas >= 3) {
        usouFallback = true;
        break;
      }
      if (paginasFalhadas >= MAX_FAIL_CONSECUTIVAS) break;
      pagina++;
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }

    const lista = data.produto_servico_cadastro || data.produto_cadastro || [];
    if (lista.length === 0) break;

    const relevantes = lista.filter((p) => {
      const cat = String(p.codigo_familia || p.cCodFamilia || "").trim();
      return categorias.some((c) => cat === c || cat.startsWith(c));
    });

    for (const p of relevantes) {
      total++;
      const codigoOmie = String(p.codigo || p.codigo_produto || "");
      if (!codigoOmie) continue;
      const r = await upsertEstoqueItem({
        codigoOmie,
        codigoIntegracao: p.codigo_produto_integracao || null,
        descricao: (p.descricao || "").trim(),
        unidade: (p.unidade || "UN").trim().toUpperCase(),
        categoriaOmie: String(p.codigo_familia || ""),
        categoriaLabel: p.descricao_familia || familiasMap.get(String(p.codigo_familia)) || null,
        ativo: p.inativo === "S" ? false : true,
      });
      if (r === "criado") criados++;
      else if (r === "atualizado") atualizados++;
    }

    const totalPaginas = Number(data.total_de_paginas) || 1;
    if (pagina >= totalPaginas) break;
    pagina++;
    await new Promise((r) => setTimeout(r, 500));
  }

  // 3) Fallback: ListarProdutosResumido (sem familia) + ConsultarProduto pra cada
  // pra descobrir familia. Mais lento mas sobrevive a cadastros zoados.
  if (usouFallback) {
    errosDetalhes.push("Caiu pra ListarProdutosResumido (cadastro problematico no Omie)");
    let p = 1;
    while (true) {
      let data;
      try {
        data = await callOmie(OMIE_PROD_URL, {
          call: "ListarProdutosResumido",
          app_key: APP_KEY,
          app_secret: APP_SECRET,
          param: [{ pagina: p, registros_por_pagina: 50, apenas_importado_api: "N" }],
        });
      } catch (e) {
        errosDetalhes.push(`ListarProdutosResumido p${p}: ${e.message}`);
        break;
      }
      const lista = data.produto_servico_resumido || data.produto_resumido || [];
      if (lista.length === 0) break;

      for (const prod of lista) {
        // ConsultarProduto pra pegar familia (best-effort, individual)
        let familia = "";
        let familiaDesc = "";
        try {
          const det = await callOmie(OMIE_PROD_URL, {
            call: "ConsultarProduto",
            app_key: APP_KEY,
            app_secret: APP_SECRET,
            param: [{ codigo_produto: Number(prod.codigo_produto) || 0 }],
          });
          familia = String(det.codigo_familia || "");
          familiaDesc = String(det.descricao_familia || "");
        } catch { /* ignora — produto fica sem familia */ }

        // So salva se bater na categoria configurada
        if (!categorias.some((c) => familia === c || familia.startsWith(c))) continue;

        total++;
        const r = await upsertEstoqueItem({
          codigoOmie: String(prod.codigo || ""),
          codigoIntegracao: null,
          descricao: (prod.descricao || "").trim(),
          unidade: (prod.unidade || "UN").trim().toUpperCase(),
          categoriaOmie: familia,
          categoriaLabel: familiaDesc || familiasMap.get(familia) || null,
          ativo: prod.inativo === "S" ? false : true,
        });
        if (r === "criado") criados++;
        else if (r === "atualizado") atualizados++;
        await new Promise((r) => setTimeout(r, 200)); // throttle do ConsultarProduto
      }
      const totalPaginas = Number(data.total_de_paginas) || 1;
      if (p >= totalPaginas) break;
      p++;
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
    fallback: usouFallback,
    familiasTotal: familiasMap.size,
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
