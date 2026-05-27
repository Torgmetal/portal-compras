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
  let zerados = 0;
  let reativados = 0;
  let enriquecidos = 0;
  let total = 0;
  let fonteUsada = "ListarPosEstoque+ObterEstoque";
  const errosDetalhes = [];
  // codigosImportados usado apenas no Caminho A (ListarProdutos)
  const codigosImportados = [];

  const TAMANHO = 100;

  // ── REPARO: reativa produtos que foram incorretamente desativados por syncs ──
  // Fase 3 anterior desativava produtos ao saírem do posEstoque (estoque=0).
  // Isso é errado: produto com estoque zero deve continuar visível no catálogo.
  // Este bloco recupera os produtos desativados automaticamente.
  try {
    const rep = await prisma.estoqueItem.updateMany({
      where: { ativo: false },
      data: { ativo: true },
    });
    reativados = rep.count;
  } catch { /* ignora se falhar */ }

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
      param: [{ pagina: 1, registros_por_pagina: 1 }],
    });
    const camposRetornados = Object.keys(teste).join(", ");
    const listasTeste = teste.produto_servico_cadastro || [];
    if (listasTeste.length > 0) {
      listarProdutosOk = true;
    } else {
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
          param: [{ pagina, registros_por_pagina: TAMANHO }],
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
    // ── CAMINHO B: ListarPosEstoque + ObterEstoqueProduto ─────────────────
    // PASSO 1: coleta TODOS os dados da API sem escrever no banco ainda
    // PASSO 2: descoberta via ObterEstoqueProduto (todos os prefixos)
    // PASSO 3: bulk upsert no banco (uma transação, muito mais rapido)
    // PASSO 4: enriquecimento de familia via ConsultarProduto (20/sync)
    fonteUsada = "ListarPosEstoque+ObterEstoque";

    const hoje = new Date();
    const dDataPosicao = `${String(hoje.getDate()).padStart(2, "0")}/${String(hoje.getMonth() + 1).padStart(2, "0")}/${hoje.getFullYear()}`;

    // ── PASSO 1: Coleta posEstoque (sem gravar no banco) ──────────────────
    // Mapa codigoOmie → { descricao, unidade, cmc, qtdAtual, nCodProd }
    const coletadosPosEstoque = new Map(); // codigoOmie → dados completos

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
        coletadosPosEstoque.set(codigoOmie, {
          codigoOmie,
          descricao: String(p.cDescricao || "").trim(),
          unidade:   String(p.cUnidade   || "UN").trim().toUpperCase(),
          cmc:     Number(p.nCMC   || 0),
          qtdAtual: Number(p.nSaldo ?? p.nFisico ?? 0),
          nCodProd: Number(p.nCodProd || 0),
        });
      }

      const totalPaginas = Number(data.nTotPaginas) || Number(data.total_de_paginas) || 1;
      if (pagina >= totalPaginas || lista.length < TAMANHO) break;
      pagina++;
      await new Promise((r) => setTimeout(r, 300));
    }

    // ── PASSO 2: Descoberta via ObterEstoqueProduto ───────────────────────
    // Contorna o erro 4474 do ListarProdutos. Retorna ate 50 produtos por chamada.
    // Busca por TODOS os prefixos de 3 chars encontrados no posEstoque +
    // prefixos alpha fixos (DV, ARM, SRV, TP, MLB) para cobrir produtos
    // que nunca apareceram no posEstoque (qty=0 historicamente).
    // Nao filtra por categoria — pega TUDO do catalogo Omie.
    const OMIE_RESUMO_URL = "https://app.omie.com.br/api/v1/estoque/resumo/";

    // Prefixos numericos dos produtos ja coletados (ex: "901", "160", "181")
    const prefixosNumericos = [
      ...new Set(
        [...coletadosPosEstoque.keys()]
          .map((c) => c.slice(0, 3))
          .filter((p) => /^\d{3}$/.test(p))
      ),
    ];
    // Prefixos alpha conhecidos para produtos que podem estar fora do posEstoque
    const prefixosAlpha = ["DV0", "DV1", "ARM", "SRV", "TP0", "MLB", "101", "102", "103", "104", "105"];

    // Une todos, sem duplicatas, max 25 termos por sync
    const MAX_TERMOS = 25;
    const termosBusca = [...new Set([...prefixosNumericos, ...prefixosAlpha])].slice(0, MAX_TERMOS);

    // Produtos descobertos via ObterEstoqueProduto que NAO estao no posEstoque
    const coletadosObterEstoque = new Map(); // codigoOmie → { descricao, unidade, nIdProduto }

    for (const termo of termosBusca) {
      try {
        const data = await callOmie(OMIE_RESUMO_URL, {
          call: "ObterEstoqueProduto",
          app_key: APP_KEY,
          app_secret: APP_SECRET,
          param: [{ xCodigo: termo }],
        });
        const lista = data.listaProduto || [];
        for (const p of lista) {
          const codigoOmie = String(p.cCodigo || "").trim();
          if (!codigoOmie || coletadosPosEstoque.has(codigoOmie)) continue;
          if (!coletadosObterEstoque.has(codigoOmie)) {
            coletadosObterEstoque.set(codigoOmie, {
              codigoOmie,
              descricao: String(p.cDescricao || "").trim(),
              unidade:   String(p.cUnidade   || "UN").trim().toUpperCase(),
              nIdProduto: Number(p.nIdProduto || 0),
            });
          }
        }
      } catch { /* ignora — endpoint opcional */ }
      await new Promise((r) => setTimeout(r, 250));
    }

    // ── PASSO 3: Bulk upsert no banco ─────────────────────────────────────
    // Busca produtos existentes em UMA query (muito mais rapido que findUnique por item)
    const todosCodigos = [
      ...coletadosPosEstoque.keys(),
      ...coletadosObterEstoque.keys(),
    ];
    const existentes = await prisma.estoqueItem.findMany({
      where: { codigoOmie: { in: todosCodigos } },
      select: { codigoOmie: true },
    });
    const existentesSet = new Set(existentes.map((e) => e.codigoOmie));

    // Cria novos em batch
    const paraCreate = [];
    for (const [cod, d] of coletadosPosEstoque) {
      if (!existentesSet.has(cod)) {
        paraCreate.push({
          codigoOmie: cod, descricao: d.descricao, unidade: d.unidade,
          cmc: d.cmc, qtdAtual: d.qtdAtual, ativo: true,
          categoriaOmie: "", categoriaLabel: null, estoqueTorg: false,
          ultimaSincOmie: new Date(),
        });
      }
    }
    for (const [cod, d] of coletadosObterEstoque) {
      if (!existentesSet.has(cod)) {
        paraCreate.push({
          codigoOmie: cod, descricao: d.descricao, unidade: d.unidade,
          cmc: 0, qtdAtual: 0, ativo: true,
          categoriaOmie: "", categoriaLabel: null, estoqueTorg: false,
          ultimaSincOmie: new Date(),
        });
      }
    }
    if (paraCreate.length > 0) {
      await prisma.estoqueItem.createMany({ data: paraCreate, skipDuplicates: true });
      criados = paraCreate.length;
    }

    // Atualiza existentes do posEstoque em transacao batch
    const updatesPos = [...coletadosPosEstoque.entries()]
      .filter(([cod]) => existentesSet.has(cod))
      .map(([, d]) =>
        prisma.estoqueItem.updateMany({
          where: { codigoOmie: d.codigoOmie },
          data: {
            descricao: d.descricao, unidade: d.unidade,
            cmc: d.cmc, qtdAtual: d.qtdAtual, ativo: true,
            ultimaSincOmie: new Date(),
          },
        })
      );
    if (updatesPos.length > 0) {
      await prisma.$transaction(updatesPos);
      atualizados = updatesPos.length;
    }
    total = coletadosPosEstoque.size + criados;

    // ── PASSO 3b: Zera qtdAtual dos que nao apareceram no posEstoque hoje ─
    // Produtos fora do posEstoque simplesmente tem estoque=0 — mantem ativo=true.
    const codigosComEstoqueHoje = new Set(coletadosPosEstoque.keys());
    const zeradosResult = await prisma.estoqueItem.updateMany({
      where: {
        codigoOmie: { notIn: [...codigosComEstoqueHoje] },
        ativo: true,
        qtdAtual: { gt: 0 },
      },
      data: { qtdAtual: 0 },
    });
    zerados = zeradosResult.count;

    // ── PASSO 4: Enriquecimento de familia via ConsultarProduto ──────────
    // Processa apenas produtos sem familia (categoriaOmie=""), 20 por sync.
    // Usa nCodProd do posEstoque ou nIdProduto do ObterEstoque como chave.
    const prodInternos = [...coletadosPosEstoque.values()]
      .filter((d) => d.nCodProd)
      .map((d) => ({ codigoOmie: d.codigoOmie, nCodProd: d.nCodProd }));

    // Inclui produtos descobertos via ObterEstoque (usam nIdProduto como nCodProd)
    for (const d of coletadosObterEstoque.values()) {
      if (d.nIdProduto) prodInternos.push({ codigoOmie: d.codigoOmie, nCodProd: d.nIdProduto });
    }

    const LOTE_FAMILIA = 20;
    const semFamiliaRows = await prisma.estoqueItem.findMany({
      where: { codigoOmie: { in: prodInternos.map((p) => p.codigoOmie) }, categoriaOmie: "" },
      select: { codigoOmie: true },
    });
    const codigosSemFamilia = new Set(semFamiliaRows.map((r) => r.codigoOmie));
    const semFamiliaTotal = codigosSemFamilia.size;

    const paraEnriquecer = prodInternos
      .filter(({ codigoOmie }) => codigosSemFamilia.has(codigoOmie))
      .slice(0, LOTE_FAMILIA);

    for (const { codigoOmie, nCodProd } of paraEnriquecer) {
      try {
        const det = await callOmie(OMIE_PROD_URL, {
          call: "ConsultarProduto",
          app_key: APP_KEY,
          app_secret: APP_SECRET,
          param: [{ codigo_produto: nCodProd }],
        });
        const familiaLabel = String(det.descricao_familia || "").trim();
        const familiaCode  = String(det.codigo_familia   || "").trim();
        if (familiaLabel || familiaCode) {
          const estoqueTorg = /mat[eé]ria[\s_-]*prima/i.test(familiaLabel);
          await prisma.estoqueItem.updateMany({
            where: { codigoOmie },
            data: { categoriaOmie: familiaCode, categoriaLabel: familiaLabel || null, estoqueTorg },
          });
          enriquecidos++;
        }
      } catch { /* produto indisponivel — ignora */ }
      await new Promise((r) => setTimeout(r, 150));
    }

    if (semFamiliaTotal > LOTE_FAMILIA) {
      errosDetalhes.push(
        `Famílias: ${enriquecidos} esta sync, ${semFamiliaTotal - LOTE_FAMILIA} restantes — sincronize novamente.`
      );
    }
  }

  // ── FASE 2 (Caminho A apenas): ListarPosEstoque atualiza qtd ────────────
  // No Caminho B o posEstoque ja foi processado no Passo 1+3.
  if (listarProdutosOk && codigosImportados.length > 0) {
    const hoje = new Date();
    const dDataPosicao = `${String(hoje.getDate()).padStart(2, "0")}/${String(hoje.getMonth() + 1).padStart(2, "0")}/${hoje.getFullYear()}`;
    let pagina = 1;
    const qtdUpdates = [];

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
        qtdUpdates.push(prisma.estoqueItem.updateMany({
          where: { codigoOmie },
          data: { qtdAtual: Number(p.nSaldo ?? p.nFisico ?? 0), cmc: Number(p.nCMC || 0), ultimaSincOmie: new Date() },
        }));
      }
      const totalPaginas = Number(data.nTotPaginas) || Number(data.total_de_paginas) || 1;
      if (pagina >= totalPaginas || lista.length < TAMANHO) break;
      pagina++;
      await new Promise((r) => setTimeout(r, 300));
    }
    if (qtdUpdates.length > 0) await prisma.$transaction(qtdUpdates);

    // Zera produtos fora do posEstoque
    if (codigosImportados.length > 0) {
      const result = await prisma.estoqueItem.updateMany({
        where: { codigoOmie: { notIn: codigosImportados }, ativo: true, qtdAtual: { gt: 0 } },
        data: { qtdAtual: 0 },
      });
      zerados = result.count;
    }
  }

  await prisma.configEstoque.update({
    where: { id: cfg.id },
    data: { ultimaSincProd: new Date() },
  });

  return {
    criados,
    atualizados,
    zerados,
    reativados,
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
