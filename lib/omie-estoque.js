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
// sincronizarProdutos — estratégia adaptativa:
//
//   TENTA primeiro ListarProdutos (catálogo completo + família inclusa).
//   Se retornar 0 produtos (endpoint com erro 4474 silencioso nesta conta),
//   cai automaticamente em FALLBACK: ListarPosEstoque como fonte de produtos
//   + ConsultarProduto por ID interno (nCodProd) para enriquecer família.
//
//   Em qualquer cenário:
//   - FASE 2: ListarPosEstoque atualiza qtdAtual + CMC
//   - FASE 3: Marca ativo=false produtos ausentes do Omie
export async function sincronizarProdutos() {
  const APP_KEY = process.env.OMIE_APP_KEY;
  const APP_SECRET = process.env.OMIE_APP_SECRET;
  if (!APP_KEY || !APP_SECRET) {
    throw new Error("OMIE_APP_KEY/SECRET nao configurados");
  }
  const cfg = await getConfigEstoque();

  let criados = 0;
  let atualizados = 0;
  let desativados = 0;
  let enriquecidos = 0;
  let total = 0;
  let fonteUsada = "ListarProdutos";
  const errosDetalhes = [];
  const codigosImportados = [];

  const TAMANHO = 100;

  // ── FASE 1 (tentativa): ListarProdutos — catálogo completo + família ──────
  // Testa página 1 com 1 item para confirmar se o endpoint funciona nesta conta.
  // Muitas contas Omie têm erro 4474 que silencia ListarProdutos (retorna []
  // sem lançar exceção). Se isso acontecer, caímos no fallback.
  let listarProdutosOk = false;
  try {
    const teste = await callOmie(OMIE_PROD_URL, {
      call: "ListarProdutos",
      app_key: APP_KEY,
      app_secret: APP_SECRET,
      param: [{ pagina: 1, registros_por_pagina: 1, apenas_importado_api: "N" }],
    });
    const camposRetornados = Object.keys(teste).join(", ");
    const listasTeste = teste.produto_servico_cadastro || [];
    if (listasTeste.length > 0) {
      listarProdutosOk = true;
    } else {
      // Endpoint respondeu mas sem produtos — registra campos reais da resposta
      errosDetalhes.push(`ListarProdutos retornou vazio (campos: ${camposRetornados}). Usando fallback.`);
    }
  } catch (e) {
    errosDetalhes.push(`ListarProdutos indisponível: ${e.message}. Usando fallback.`);
  }

  if (listarProdutosOk) {
    // ── CAMINHO A: ListarProdutos funciona ────────────────────────────────
    fonteUsada = "ListarProdutos";
    let pagina = 1;

    while (true) {
      let data;
      try {
        data = await callOmie(OMIE_PROD_URL, {
          call: "ListarProdutos",
          app_key: APP_KEY,
          app_secret: APP_SECRET,
          param: [{ pagina, registros_por_pagina: TAMANHO, apenas_importado_api: "N" }],
        });
      } catch (e) {
        errosDetalhes.push(`ListarProdutos p${pagina}: ${e.message}`);
        break;
      }

      const lista = data.produto_servico_cadastro || [];
      if (lista.length === 0) break;

      for (const p of lista) {
        if (p.inativo === "S") continue;
        const codigoOmie = String(p.codigo || "").trim();
        if (!codigoOmie) continue;

        total++;
        const familiaLabel = String(p.descricao_familia || "").trim();
        const familiaCode  = String(p.codigo_familia  || "").trim();
        const estoqueTorg  = /mat[eé]ria[\s_-]*prima/i.test(familiaLabel);

        const r = await upsertEstoqueItem({
          codigoOmie,
          codigoIntegracao: String(p.codigo_integracao || "").trim() || null,
          descricao:     String(p.descricao || "").trim(),
          unidade:       String(p.unidade   || "UN").trim().toUpperCase(),
          categoriaOmie: familiaCode,
          categoriaLabel: familiaLabel || null,
          estoqueTorg,
          ativo: true,
        });
        if (r === "criado")       criados++;
        else if (r === "atualizado") atualizados++;
        codigosImportados.push(codigoOmie);
      }

      const totalPaginas = Number(data.total_de_paginas) || Number(data.nTotPaginas) || 1;
      if (pagina >= totalPaginas || lista.length < TAMANHO) break;
      pagina++;
      await new Promise((r) => setTimeout(r, 350));
    }
  } else {
    // ── CAMINHO B: Fallback — ListarPosEstoque como fonte de produtos ─────
    // ListarPosEstoque retorna produtos com histórico de estoque (nSaldo + nCMC).
    // Para cada produto, busca família via ConsultarProduto usando nCodProd
    // (ID interno do Omie — mais robusto que o código externo).
    fonteUsada = "ListarPosEstoque";
    const hoje = new Date();
    const dDataPosicao = `${String(hoje.getDate()).padStart(2, "0")}/${String(hoje.getMonth() + 1).padStart(2, "0")}/${hoje.getFullYear()}`;
    // Map nCodProd → codigoOmie para enriquecimento de família depois
    const prodInternos = []; // [{ codigoOmie, nCodProd }]

    let pagina = 1;
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
        const codigoOmie = String(p.cCodigo || "").trim();
        if (!codigoOmie) continue;

        total++;
        const r = await upsertEstoqueItem({
          codigoOmie,
          codigoIntegracao: null,
          descricao: String(p.cDescricao || "").trim(),
          unidade:   String(p.cUnidade || "UN").trim().toUpperCase(),
          categoriaOmie: null, // preenchido abaixo via ConsultarProduto
          categoriaLabel: null,
          estoqueTorg: false,  // calculado abaixo após conhecer a família
          ativo: true,
          cmc:     Number(p.nCMC   || 0),
          qtdAtual: Number(p.nSaldo ?? p.nFisico ?? 0),
        });
        if (r === "criado")       criados++;
        else if (r === "atualizado") atualizados++;
        codigosImportados.push(codigoOmie);

        const nCodProd = Number(p.nCodProd || 0);
        if (nCodProd) prodInternos.push({ codigoOmie, nCodProd });
      }

      const totalPaginas = Number(data.nTotPaginas) || Number(data.total_de_paginas) || 1;
      if (pagina >= totalPaginas || lista.length < TAMANHO) break;
      pagina++;
      await new Promise((r) => setTimeout(r, 350));
    }

    // Enriquecer família via ConsultarProduto por ID interno (nCodProd).
    // Usa ID interno pois o código externo (cCodigo) pode estar corrompido.
    // Limita a 300 consultas por sync para não esgotar o timeout.
    for (const { codigoOmie, nCodProd } of prodInternos.slice(0, 300)) {
      try {
        const det = await callOmie(OMIE_PROD_URL, {
          call: "ConsultarProduto",
          app_key: APP_KEY,
          app_secret: APP_SECRET,
          param: [{ codigo_produto: nCodProd }],
        });
        const familiaLabel = String(det.descricao_familia || "").trim();
        const familiaCode  = String(det.codigo_familia  || "").trim();
        if (familiaLabel || familiaCode) {
          const estoqueTorg = /mat[eé]ria[\s_-]*prima/i.test(familiaLabel);
          await prisma.estoqueItem.updateMany({
            where: { codigoOmie },
            data: { categoriaOmie: familiaCode, categoriaLabel: familiaLabel || null, estoqueTorg },
          });
          enriquecidos++;
        }
      } catch {
        // Produto corrompido ou indisponível — ignora
      }
      await new Promise((r) => setTimeout(r, 80));
    }
  }

  // ── FASE 2: ListarPosEstoque → atualiza qtdAtual + CMC ───────────────────
  // Só roda se usamos ListarProdutos (Caminho A) — no Caminho B já veio do loop.
  if (listarProdutosOk && codigosImportados.length > 0) {
    const hoje = new Date();
    const dDataPosicao = `${String(hoje.getDate()).padStart(2, "0")}/${String(hoje.getMonth() + 1).padStart(2, "0")}/${hoje.getFullYear()}`;
    let pagina = 1;

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
        const codigoOmie = String(p.cCodigo || "").trim();
        if (!codigoOmie) continue;
        await prisma.estoqueItem.updateMany({
          where: { codigoOmie },
          data: {
            qtdAtual:       Number(p.nSaldo ?? p.nFisico ?? 0),
            cmc:            Number(p.nCMC   || 0),
            ultimaSincOmie: new Date(),
          },
        });
      }

      const totalPaginas = Number(data.nTotPaginas) || Number(data.total_de_paginas) || 1;
      if (pagina >= totalPaginas || lista.length < TAMANHO) break;
      pagina++;
      await new Promise((r) => setTimeout(r, 350));
    }
  }

  // ── FASE 3: Desativar produtos ausentes do Omie ───────────────────────────
  if (codigosImportados.length > 0) {
    const result = await prisma.estoqueItem.updateMany({
      where: { codigoOmie: { notIn: codigosImportados }, ativo: true },
      data: { ativo: false },
    });
    desativados = result.count;
  }

  await prisma.configEstoque.update({
    where: { id: cfg.id },
    data: { ultimaSincProd: new Date() },
  });

  return {
    criados,
    atualizados,
    desativados,
    total,
    enriquecidos,
    fonteUsada,
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
