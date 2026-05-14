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

// Sincroniza produtos via ListarPosEstoque (endpoint de estoque, nao de cadastro).
// Isso contorna o erro 4474 que afeta os endpoints geral/produtos/.
//
// Estrategia:
//   1) ListarPosEstoque puxa cCodigo + cDescricao + cUnidade + nSaldo + nCMC
//      pra TODOS os produtos com posicao de estoque
//   2) ConsultarProduto (best-effort, individual) enriquece com codigo_familia
//      pra cada item. Os que erram (provavelmente o produto corrompido) ficam
//      sem categoria — usuario pode marcar manualmente depois
//   3) ListarFamilias (best-effort) traz o mapa codigo→descricao da familia
//
// Cria/atualiza EstoqueItem no banco. Retorna { criados, atualizados, total }.
export async function sincronizarProdutos() {
  const APP_KEY = process.env.OMIE_APP_KEY;
  const APP_SECRET = process.env.OMIE_APP_SECRET;
  if (!APP_KEY || !APP_SECRET) {
    throw new Error("OMIE_APP_KEY/SECRET nao configurados");
  }
  const cfg = await getConfigEstoque();
  const categorias = cfg.categoriasOmie || [];

  let criados = 0;
  let atualizados = 0;
  let total = 0;
  let estoqueTorgMarcados = 0;
  let enriquecidosFamilia = 0;
  let falhasConsulta = 0;
  const errosDetalhes = [];

  // Palavras-chave que marcam um produto como "Estoque Torg" (case-insensitive
  // match na descricao). Usado quando o Omie nao tem familias estruturadas.
  const palavrasChave = (cfg.palavrasChave || [])
    .map((p) => String(p || "").trim().toUpperCase())
    .filter(Boolean);
  const ehEstoqueTorg = (descricao) => {
    if (palavrasChave.length === 0) return false;
    const d = String(descricao || "").toUpperCase();
    return palavrasChave.some((p) => d.includes(p));
  };

  // 1) ListarFamilias (best-effort) pra ter rotulos das categorias
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

  // 2) ListarPosEstoque — fonte primaria (sobrevive ao 4474 pq nao toca no
  // cadastro de produtos, le da tabela de posicao de estoque)
  const itensImportados = []; // pra enriquecer categoria depois
  const hoje = new Date();
  const dDataPosicao = `${String(hoje.getDate()).padStart(2, "0")}/${String(hoje.getMonth() + 1).padStart(2, "0")}/${hoje.getFullYear()}`;

  let pagina = 1;
  const TAMANHO = 100;

  while (true) {
    let data;
    try {
      data = await callOmie(OMIE_ESTOQUE_URL, {
        call: "ListarPosEstoque",
        app_key: APP_KEY,
        app_secret: APP_SECRET,
        param: [{ nPagina: pagina, nRegPorPagina: TAMANHO, dDataPosicao }],
      });
    } catch (e) {
      errosDetalhes.push(`ListarPosEstoque p${pagina}: ${e.message}`);
      break;
    }

    const lista = data.produtos || [];
    if (lista.length === 0) break;

    for (const p of lista) {
      total++;
      const codigoOmie = String(p.cCodigo || "");
      if (!codigoOmie) continue;

      const cmc = Number(p.nCMC || 0);
      const qtd = Number(p.nSaldo || p.nFisico || 0);
      const descricao = String(p.cDescricao || "").trim();
      const flagEstoqueTorg = ehEstoqueTorg(descricao);
      if (flagEstoqueTorg) estoqueTorgMarcados++;

      const r = await upsertEstoqueItem({
        codigoOmie,
        codigoIntegracao: null,
        descricao,
        unidade: String(p.cUnidade || "UN").trim().toUpperCase(),
        categoriaOmie: "", // preenchido depois via ConsultarProduto
        categoriaLabel: null,
        estoqueTorg: flagEstoqueTorg,
        ativo: true,
        cmc,
        qtdAtual: qtd,
      });
      if (r === "criado") criados++;
      else if (r === "atualizado") atualizados++;

      itensImportados.push(codigoOmie);
    }

    const totalPaginas = Number(data.nTotPaginas) || 1;
    if (pagina >= totalPaginas) break;
    pagina++;
    await new Promise((r) => setTimeout(r, 400));
  }

  // 3) Enriquecer com categoria via ConsultarProduto (best-effort).
  // Pula os que erram (o produto corrompido vai estar aqui).
  // So consulta os que ainda nao tem categoria pra economizar chamadas em re-syncs.
  const semCategoria = await prisma.estoqueItem.findMany({
    where: {
      codigoOmie: { in: itensImportados },
      OR: [{ categoriaOmie: "" }, { categoriaOmie: null }],
    },
    select: { id: true, codigoOmie: true },
    take: 500, // throttle: max 500 ConsultarProduto por sync
  });

  for (const item of semCategoria) {
    try {
      const det = await callOmie(OMIE_PROD_URL, {
        call: "ConsultarProduto",
        app_key: APP_KEY,
        app_secret: APP_SECRET,
        param: [{ codigo: item.codigoOmie }],
      });
      const familia = String(det.codigo_familia || "");
      if (familia) {
        await prisma.estoqueItem.update({
          where: { id: item.id },
          data: {
            categoriaOmie: familia,
            categoriaLabel: det.descricao_familia || familiasMap.get(familia) || null,
          },
        });
        enriquecidosFamilia++;
      }
    } catch {
      falhasConsulta++;
      // Ignora — provavelmente o produto corrompido
    }
    await new Promise((r) => setTimeout(r, 100)); // throttle
  }

  await prisma.configEstoque.update({
    where: { id: cfg.id },
    data: { ultimaSincProd: new Date() },
  });

  return {
    criados,
    atualizados,
    total,
    estoqueTorgMarcados,
    enriquecidosFamilia,
    falhasConsulta,
    familiasTotal: familiasMap.size,
    palavrasChave: palavrasChave.length > 0 ? palavrasChave : ["(nenhuma configurada)"],
    ...(errosDetalhes.length > 0 ? { erros: errosDetalhes.slice(0, 10) } : {}),
  };
}

// Helper: cria ou atualiza EstoqueItem. Retorna "criado" | "atualizado" | null.
// Se cmc/qtdAtual vierem definidos, atualiza tambem. Senao preserva o valor atual.
async function upsertEstoqueItem(d) {
  if (!d.codigoOmie) return null;
  const existing = await prisma.estoqueItem.findUnique({ where: { codigoOmie: d.codigoOmie } });
  if (existing) {
    const updateData = {
      descricao: d.descricao || existing.descricao,
      unidade: d.unidade || existing.unidade,
      ativo: d.ativo !== undefined ? d.ativo : existing.ativo,
      ultimaSincOmie: new Date(),
    };
    // So sobrescreve categoria se veio com valor (preserva o que ja tem)
    if (d.categoriaOmie) updateData.categoriaOmie = d.categoriaOmie;
    if (d.categoriaLabel) updateData.categoriaLabel = d.categoriaLabel;
    if (d.estoqueTorg !== undefined) updateData.estoqueTorg = d.estoqueTorg;
    if (d.cmc !== undefined) updateData.cmc = d.cmc;
    if (d.qtdAtual !== undefined) updateData.qtdAtual = d.qtdAtual;
    await prisma.estoqueItem.update({ where: { id: existing.id }, data: updateData });
    return "atualizado";
  }
  await prisma.estoqueItem.create({
    data: {
      codigoOmie: d.codigoOmie,
      codigoIntegracao: d.codigoIntegracao || null,
      descricao: d.descricao || "",
      unidade: d.unidade || "UN",
      categoriaOmie: d.categoriaOmie || "",
      categoriaLabel: d.categoriaLabel || null,
      estoqueTorg: d.estoqueTorg !== undefined ? d.estoqueTorg : false,
      ativo: d.ativo !== undefined ? d.ativo : true,
      cmc: d.cmc !== undefined ? d.cmc : 0,
      qtdAtual: d.qtdAtual !== undefined ? d.qtdAtual : 0,
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
