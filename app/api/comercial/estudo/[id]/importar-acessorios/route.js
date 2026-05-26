import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import * as XLSX from "xlsx";

export const runtime = "nodejs";
export const maxDuration = 30;

// Mapeamento de nomes de coluna para campos do modelo
const COLUMN_MAP = {
  // Categoria
  categoria: "categoria",
  cat: "categoria",
  tipo: "categoria",
  type: "categoria",
  // Descricao
  descricao: "descricao",
  descrição: "descricao",
  description: "descricao",
  item: "descricao",
  material: "descricao",
  produto: "descricao",
  nome: "descricao",
  // Especificacao
  especificacao: "especificacao",
  especificação: "especificacao",
  espec: "especificacao",
  spec: "especificacao",
  detalhe: "especificacao",
  detalhes: "especificacao",
  // Unidade
  unidade: "unidade",
  unid: "unidade",
  un: "unidade",
  unit: "unidade",
  // Quantidade
  quantidade: "quantidade",
  qtd: "quantidade",
  qtde: "quantidade",
  qty: "quantidade",
  quant: "quantidade",
  // Observacao
  observacao: "observacao",
  observação: "observacao",
  obs: "observacao",
  nota: "observacao",
  notas: "observacao",
};

// Mapeamento de categorias (texto livre → enum)
const CATEGORIA_MAP = {
  telha: "TELHA",
  telhas: "TELHA",
  calha: "CALHA",
  calhas: "CALHA",
  rufo: "RUFO",
  rufos: "RUFO",
  grade: "GRADE_PISO",
  "grade de piso": "GRADE_PISO",
  "grade piso": "GRADE_PISO",
  grating: "GRADE_PISO",
  galvanizacao: "GALVANIZACAO",
  galvanização: "GALVANIZACAO",
  galvanizar: "GALVANIZACAO",
  "steel deck": "STEEL_DECK",
  steeldeck: "STEEL_DECK",
  deck: "STEEL_DECK",
  policarbonato: "POLICARBONATO",
  isolamento: "ISOLAMENTO",
  "la de vidro": "ISOLAMENTO",
  "la de rocha": "ISOLAMENTO",
  outro: "OUTRO",
  outros: "OUTRO",
};

function normalizeCategoria(val) {
  if (!val) return "OUTRO";
  const v = val.toString().trim().toLowerCase();
  // Direto do enum
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
  // Busca no mapa
  for (const [key, field] of Object.entries(COLUMN_MAP)) {
    const keyNorm = key.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
    if (h === keyNorm || h.includes(keyNorm)) return field;
  }
  return null;
}

export async function POST(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file) {
      return NextResponse.json({ success: false, error: "Arquivo nao enviado" }, { status: 400 });
    }

    // Ler arquivo
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });

    // Usar primeira aba
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json({ success: false, error: "Planilha vazia" }, { status: 400 });
    }

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: "Nenhuma linha encontrada na planilha" }, { status: 400 });
    }

    // Mapear colunas
    const headers = Object.keys(rows[0]);
    const colMapping = {};
    for (const header of headers) {
      const field = normalizeHeader(header);
      if (field && !colMapping[field]) {
        colMapping[field] = header;
      }
    }

    if (!colMapping.descricao) {
      return NextResponse.json(
        { success: false, error: "Coluna de descricao nao encontrada. A planilha precisa ter uma coluna chamada 'Descricao', 'Item', 'Material' ou 'Produto'." },
        { status: 400 }
      );
    }

    // Obter proxima ordem
    const ultimo = await prisma.acessorioItem.findFirst({
      where: { estudoId: id },
      orderBy: { ordem: "desc" },
      select: { ordem: true },
    });
    let proxOrdem = (ultimo?.ordem ?? -1) + 1;

    // Converter linhas para itens
    const itensParaCriar = [];
    for (const row of rows) {
      const descricao = (row[colMapping.descricao] || "").toString().trim();
      if (!descricao) continue; // pular linhas sem descricao

      const item = {
        estudoId: id,
        descricao,
        categoria: normalizeCategoria(colMapping.categoria ? row[colMapping.categoria] : null),
        especificacao: colMapping.especificacao ? (row[colMapping.especificacao] || "").toString().trim() || null : null,
        unidade: colMapping.unidade ? (row[colMapping.unidade] || "").toString().trim() || "un" : "un",
        quantidade: colMapping.quantidade ? (parseFloat(row[colMapping.quantidade]) || 0) : 0,
        observacao: colMapping.observacao ? (row[colMapping.observacao] || "").toString().trim() || null : null,
        ordem: proxOrdem++,
      };

      itensParaCriar.push(item);
    }

    if (itensParaCriar.length === 0) {
      return NextResponse.json({ success: false, error: "Nenhum item valido encontrado na planilha" }, { status: 400 });
    }

    // Criar itens no banco
    await prisma.acessorioItem.createMany({ data: itensParaCriar });

    // Audit log
    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "IMPORTAR_ACESSORIOS",
        entity: "AcessorioItem",
        entityId: id,
        diff: { arquivo: file.name, itensImportados: itensParaCriar.length },
      },
    });

    // Retornar todos os itens atualizados
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
    console.error("Erro ao importar acessorios:", e);
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
