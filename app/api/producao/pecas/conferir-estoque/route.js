// POST /api/producao/pecas/conferir-estoque
// Confere estoque físico (EstoqueFisico) vs barras necessárias para peças de uma OP.
// Atualiza statusEstoque de cada PecaConjunto (DISPONIVEL | PARCIAL | INDISPONIVEL).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";
import { parsePerfil, calcularResumoBarras } from "@/lib/maquina-corte";

const schema = z.object({
  opNumero: z.string().min(1, "opNumero obrigatório"),
});

/**
 * Normaliza a descrição do perfil para criar uma chave de comparação.
 * PecaConjunto.descricao = "W410X46.1" → chave = "W|410X46.1"
 * EstoqueFisico perfil="W", bitola="410X46.1" → chave = "W|410X46.1"
 *
 * Para CHAPAS (CH): estoque guarda apenas a espessura como bitola (ex: "12.5"),
 * mas a peça tem espessura × largura (ex: "CH12.50X396").
 * A chave da chapa usa só a espessura normalizada: "CH|12.5"
 */
function normalizarChave(tipo, bitola) {
  const t = (tipo || "").toUpperCase();
  const b = (bitola || "").toUpperCase().replace(/\s+/g, "").replace(",", ".");
  // Chapas: normalizar bitola como float (espessura só)
  if (t === "CH" || t === "CHX") {
    const esp = parseFloat(b);
    return `${t}|${isNaN(esp) ? b : esp}`;
  }
  return `${t}|${b}`;
}

/**
 * Extrai a chave de estoque a partir da descrição da peça (PecaConjunto).
 * Ex: "W410X46.1" → "W|410X46.1"
 *     "CH12.50X396" → "CH|12.5" (só espessura, para casar com estoque)
 *     "L50X50X5" → "L|50X50X5"
 */
function chaveFromDescricao(descricao) {
  if (!descricao) return null;
  const d = descricao.trim().toUpperCase().replace(/\s+/g, "");

  // Chapas: usar parsePerfil para extrair espessura e ignorar a largura
  const perfil = parsePerfil(descricao);
  if (perfil && (perfil.tipo === "CH")) {
    const esp = perfil.espessuraMm;
    return `CH|${isNaN(esp) ? 0 : esp}`;
  }

  // Demais perfis: tipo + restante da string
  const m = d.match(/^(CHX|CH|TB|FR|FC|HP|W|U|L|H|C)/);
  if (!m) return null;

  const tipo = m[1];
  const resto = d.slice(tipo.length);
  return normalizarChave(tipo, resto);
}

export async function POST(request) {
  try {
    await requireRole(["ADMIN", "PRODUCAO", "COMERCIAL"]);

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message },
        { status: 400 }
      );
    }

    const { opNumero } = parsed.data;

    // 1. Buscar croquis da OP (peças que precisam de material)
    const pecas = await prisma.pecaConjunto.findMany({
      where: {
        opNumero,
        OR: [
          { tipoPeca: "CROQUI" },
          { tipoPeca: null },
        ],
        descricao: { not: null },
      },
      select: {
        id: true,
        marca: true,
        descricao: true,
        material: true,
        qte: true,
        pesoUnitKg: true,
        pesoTotalKg: true,
        comprimentoMm: true,
        maquina: true,
        qteProduzida: true,
        status: true,
      },
    });

    if (pecas.length === 0) {
      return NextResponse.json(
        { success: false, error: "Nenhuma peça encontrada para essa OP" },
        { status: 404 }
      );
    }

    // 2. Buscar estoque físico atual (sheet ESTOQUE_01)
    const estoqueFisico = await prisma.estoqueFisico.findMany({
      where: { sheet: "ESTOQUE_01" },
    });

    // 3. Agregar estoque por chave (perfil|bitola)
    const estoqueMap = {};
    for (const item of estoqueFisico) {
      const chave = normalizarChave(item.perfil, item.bitola);
      if (!estoqueMap[chave]) {
        estoqueMap[chave] = {
          perfil: item.perfil,
          bitola: item.bitola,
          aco: item.aco,
          qtdTotal: 0,
          pesoTotal: 0,
          comprimento: item.comprimento,
        };
      }
      estoqueMap[chave].qtdTotal += item.qtd;
      estoqueMap[chave].pesoTotal += item.peso;
    }

    // 4. Calcular barras necessárias por perfil (usando calcularResumoBarras)
    const resumo = calcularResumoBarras(pecas);

    // 5. Montar resultado da conferência por perfil
    const conferencia = [];
    const statusPorDescricao = {}; // descricao → statusEstoque

    for (const [maq, dados] of Object.entries(resumo)) {
      for (const [descricao, pf] of Object.entries(dados.perfis)) {
        const chave = chaveFromDescricao(descricao);
        const estoque = chave ? estoqueMap[chave] : null;
        const barrasDisponiveis = estoque ? estoque.qtdTotal : 0;
        const barrasNecessarias = pf.barras || 0;

        let status;
        if (barrasDisponiveis >= barrasNecessarias) {
          status = "DISPONIVEL";
        } else if (barrasDisponiveis > 0) {
          status = "PARCIAL";
        } else {
          status = "INDISPONIVEL";
        }

        statusPorDescricao[descricao] = status;

        conferencia.push({
          perfil: descricao,
          tipo: pf.tipo,
          maquina: maq,
          barrasNecessarias,
          barrasDisponiveis,
          status,
          pesoEstoque: estoque ? estoque.pesoTotal : 0,
          acoEstoque: estoque?.aco || null,
        });
      }

      // Chapas — verificar por peso/qtd
      if (maq === "LASER_CHAPA" && dados.pecas > 0) {
        // Para chapas, agrupar peças por descricao
        const chapasPecas = pecas.filter((p) => {
          const perfil = parsePerfil(p.descricao);
          return perfil && perfil.tipo === "CH" && p.maquina === "LASER_CHAPA";
        });

        const chapasPorDesc = {};
        for (const ch of chapasPecas) {
          const desc = ch.descricao || "Chapa";
          if (!chapasPorDesc[desc]) chapasPorDesc[desc] = { qte: 0, peso: 0 };
          chapasPorDesc[desc].qte += ch.qte || 1;
          chapasPorDesc[desc].peso += ch.pesoTotalKg || 0;
        }

        for (const [desc, info] of Object.entries(chapasPorDesc)) {
          const chave = chaveFromDescricao(desc);
          const estoque = chave ? estoqueMap[chave] : null;
          const qtdDisponivel = estoque ? estoque.qtdTotal : 0;

          let status;
          if (qtdDisponivel >= info.qte) {
            status = "DISPONIVEL";
          } else if (qtdDisponivel > 0) {
            status = "PARCIAL";
          } else {
            status = "INDISPONIVEL";
          }

          statusPorDescricao[desc] = status;

          conferencia.push({
            perfil: desc,
            tipo: "CH",
            maquina: "LASER_CHAPA",
            barrasNecessarias: info.qte,
            barrasDisponiveis: qtdDisponivel,
            status,
            pesoEstoque: estoque ? estoque.pesoTotal : 0,
            acoEstoque: estoque?.aco || null,
          });
        }
      }
    }

    // 6. Atualizar statusEstoque de cada peça no banco
    const updates = [];
    for (const p of pecas) {
      const desc = p.descricao || "";
      const novoStatus = statusPorDescricao[desc] || "INDISPONIVEL";
      updates.push(
        prisma.pecaConjunto.update({
          where: { id: p.id },
          data: { statusEstoque: novoStatus },
        })
      );
    }

    // Também atualizar CONJUNTOS — status = pior status dos seus croquis
    const conjuntos = await prisma.pecaConjunto.findMany({
      where: { opNumero, tipoPeca: "CONJUNTO" },
      select: { id: true },
    });
    if (conjuntos.length > 0) {
      const conjuntoIds = conjuntos.map((c) => c.id);
      const relacoes = await prisma.conjuntoCroqui.findMany({
        where: { conjuntoId: { in: conjuntoIds } },
        select: { conjuntoId: true, croquiId: true },
      });

      // Map croquiId → statusEstoque
      const statusCroquiMap = {};
      for (const p of pecas) {
        statusCroquiMap[p.id] = statusPorDescricao[p.descricao || ""] || "INDISPONIVEL";
      }

      // Para cada conjunto, pegar o pior status dos seus croquis
      const conjuntoStatus = {};
      for (const r of relacoes) {
        const st = statusCroquiMap[r.croquiId];
        if (!st) continue;
        const atual = conjuntoStatus[r.conjuntoId];
        if (!atual || prioridadeStatus(st) > prioridadeStatus(atual)) {
          conjuntoStatus[r.conjuntoId] = st;
        }
      }

      for (const [cjId, status] of Object.entries(conjuntoStatus)) {
        updates.push(
          prisma.pecaConjunto.update({
            where: { id: cjId },
            data: { statusEstoque: status },
          })
        );
      }
    }

    // Executar updates em batches
    for (let i = 0; i < updates.length; i += 50) {
      await prisma.$transaction(updates.slice(i, i + 50));
    }

    // 7. Resumo
    const totalDisponivel = conferencia.filter((c) => c.status === "DISPONIVEL").length;
    const totalParcial = conferencia.filter((c) => c.status === "PARCIAL").length;
    const totalIndisponivel = conferencia.filter((c) => c.status === "INDISPONIVEL").length;

    return NextResponse.json({
      success: true,
      opNumero,
      conferencia,
      resumo: {
        totalPerfis: conferencia.length,
        disponivel: totalDisponivel,
        parcial: totalParcial,
        indisponivel: totalIndisponivel,
      },
      pecasAtualizadas: updates.length,
    });
  } catch (e) {
    console.error("Erro conferir estoque:", e);
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// Prioridade: INDISPONIVEL > PARCIAL > DISPONIVEL (pior ganha)
function prioridadeStatus(st) {
  if (st === "INDISPONIVEL") return 3;
  if (st === "PARCIAL") return 2;
  if (st === "DISPONIVEL") return 1;
  return 0;
}
