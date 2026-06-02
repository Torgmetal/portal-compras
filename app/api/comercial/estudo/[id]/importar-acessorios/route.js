import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import * as XLSX from "xlsx";
import { isComposicaoAreas, parseComposicaoAreas } from "@/lib/parse-composicao-areas";

export const runtime = "nodejs";
export const maxDuration = 30;

// Mapeamento de nomes de coluna para campos do modelo (importacao generica)
const COLUMN_MAP = {
  categoria: "categoria", cat: "categoria", tipo: "categoria", type: "categoria",
  descricao: "descricao", "descrição": "descricao", description: "descricao",
  item: "descricao", material: "descricao", produto: "descricao", nome: "descricao",
  especificacao: "especificacao", "especificação": "especificacao", espec: "especificacao",
  spec: "especificacao", detalhe: "especificacao", detalhes: "especificacao",
  unidade: "unidade", unid: "unidade", un: "unidade", unit: "unidade",
  quantidade: "quantidade", qtd: "quantidade", qtde: "quantidade",
  qty: "quantidade", quant: "quantidade",
  observacao: "observacao", "observação": "observacao", obs: "observacao",
  nota: "observacao", notas: "observacao",
};

const CATEGORIA_MAP = {
  telha: "TELHA", telhas: "TELHA", calha: "CALHA", calhas: "CALHA",
  rufo: "RUFO", rufos: "RUFO", grade: "GRADE_PISO", "grade de piso": "GRADE_PISO",
  "grade piso": "GRADE_PISO", grating: "GRADE_PISO", galvanizacao: "GALVANIZACAO",
  "galvanização": "GALVANIZACAO", galvanizar: "GALVANIZACAO", "steel deck": "STEEL_DECK",
  steeldeck: "STEEL_DECK", deck: "STEEL_DECK", policarbonato: "POLICARBONATO",
  isolamento: "ISOLAMENTO", "la de vidro": "ISOLAMENTO", "la de rocha": "ISOLAMENTO",
  outro: "OUTRO", outros: "OUTRO",
};

function normalizeCategoria(val) {
  if (!val) return "OUTRO";
  const v = val.toString().trim().toLowerCase();
  if (["TELHA", "CALHA", "RUFO", "GRADE_PISO", "GALVANIZACAO", "STEEL_DECK", "POLICARBONATO", "ISOLAMENTO", "OUTRO"].includes(val.toUpperCase())) {
    return val.toUpperCase();
  }
  return CATEGORIA_MAP[v] || "OUTRO";
}

function normalizeHeader(header) {
  if (!header) return null;
  const h = header.toString().toLowerCase().trim()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
  for (const [key, field] of Object.entries(COLUMN_MAP)) {
    const keyNorm = key.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
    if (h === keyNorm || h.includes(keyNorm)) return field;
  }
  return null;
}

// Parse generico (planilha com colunas nomeadas)
function parseGenerico(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { itens: [], erros: ["Planilha vazia"] };

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  if (rows.length === 0) return { itens: [], erros: ["Nenhuma linha encontrada"] };

  const headers = Object.keys(rows[0]);
  const colMapping = {};
  for (const header of headers) {
    const field = normalizeHeader(header);
    if (field && !colMapping[field]) colMapping[field] = header;
  }

  if (!colMapping.descricao) {
    return { itens: [], erros: ["Coluna de descricao nao encontrada. A planilha precisa ter uma coluna chamada 'Descricao', 'Item', 'Material' ou 'Produto'."] };
  }

  const itens = [];
  let ordem = 0;
  for (const row of rows) {
    const descricao = (row[colMapping.descricao] || "").toString().trim();
    if (!descricao) continue;
    itens.push({
      categoria: normalizeCategoria(colMapping.categoria ? row[colMapping.categoria] : null),
      descricao,
      especificacao: colMapping.especificacao ? (row[colMapping.especificacao] || "").toString().trim() || null : null,
      unidade: colMapping.unidade ? (row[colMapping.unidade] || "").toString().trim() || "un" : "un",
      quantidade: colMapping.quantidade ? (parseFloat(row[colMapping.quantidade]) || 0) : 0,
      custoUnitario: null,
      observacao: colMapping.observacao ? (row[colMapping.observacao] || "").toString().trim() || null : null,
      ordem: ordem++,
    });
  }

  return { itens, erros: itens.length === 0 ? ["Nenhum item valido encontrado"] : [] };
}

export async function POST(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const preview = searchParams.get("preview") === "true";

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file) {
      return NextResponse.json({ success: false, error: "Arquivo nao enviado" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Auto-detect formato
    const isCompAreas = isComposicaoAreas(buffer);
    const { itens, erros } = isCompAreas
      ? parseComposicaoAreas(buffer)
      : parseGenerico(buffer);

    if (erros.length > 0 && itens.length === 0) {
      return NextResponse.json({ success: false, error: erros[0] }, { status: 400 });
    }

    // Se preview, retornar itens sem salvar
    if (preview) {
      return NextResponse.json({
        success: true,
        preview: true,
        formato: isCompAreas ? "composicao-areas" : "generico",
        data: itens,
        avisos: erros,
      });
    }

    // Salvar itens no banco
    const ultimo = await prisma.acessorioItem.findFirst({
      where: { estudoId: id },
      orderBy: { ordem: "desc" },
      select: { ordem: true },
    });
    let proxOrdem = (ultimo?.ordem ?? -1) + 1;

    const itensParaCriar = itens.map((item) => ({
      estudoId: id,
      categoria: item.categoria,
      descricao: item.descricao,
      especificacao: item.especificacao || null,
      unidade: item.unidade || "un",
      quantidade: item.quantidade || 0,
      custoUnitario: item.custoUnitario || null,
      observacao: item.observacao || null,
      ordem: proxOrdem++,
    }));

    await prisma.acessorioItem.createMany({ data: itensParaCriar });

    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "IMPORTAR_ACESSORIOS",
        entity: "AcessorioItem",
        entityId: id,
        diff: {
          arquivo: file.name,
          formato: isCompAreas ? "composicao-areas" : "generico",
          itensImportados: itensParaCriar.length,
        },
      },
    });

    const todos = await prisma.acessorioItem.findMany({
      where: { estudoId: id },
      orderBy: { ordem: "asc" },
    });

    return NextResponse.json({
      success: true,
      data: todos,
      importados: itensParaCriar.length,
    }, { status: 201 });
  } catch (e) {
    if (e.issues) {
      return NextResponse.json({ success: false, error: e.issues[0]?.message }, { status: 400 });
    }
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
