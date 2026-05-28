// POST /api/rh/documentos/importar — importa documentos de planilha Excel
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import * as XLSX from "xlsx";

export const maxDuration = 60;

const norm = (s) => (s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Mapear categoria do texto livre para enum
const CATEGORIA_MAP = {
  "saude": "SAUDE_SEGURANCA",
  "seguranca": "SAUDE_SEGURANCA",
  "saude / seguranca": "SAUDE_SEGURANCA",
  "saude/seguranca": "SAUDE_SEGURANCA",
  "pessoal": "PESSOAL",
  "treinamento": "TREINAMENTO",
  "empresa": "EMPRESA",
  "licenca": "EMPRESA",
  "empresa / licencas": "EMPRESA",
  "empresa/licencas": "EMPRESA",
};

// Mapear tipo do texto livre para chave
const TIPO_MAP = {
  "aso": "ASO",
  "nr-10": "NR_10", "nr 10": "NR_10", "nr10": "NR_10",
  "nr-12": "NR_12", "nr 12": "NR_12", "nr12": "NR_12",
  "nr-33": "NR_33", "nr 33": "NR_33", "nr33": "NR_33",
  "nr-35": "NR_35", "nr 35": "NR_35", "nr35": "NR_35",
  "ppra": "PPRA", "pcmso": "PCMSO",
  "cnh": "CNH", "passaporte": "PASSAPORTE",
  "certidao": "CERTIDAO", "rg": "RG",
  "certificado": "CERTIFICADO", "certificado de curso": "CERTIFICADO",
  "treinamento nr": "TREINAMENTO_NR", "integracao": "INTEGRACAO",
  "alvara": "ALVARA", "licenca ambiental": "LICENCA_AMBIENTAL",
  "avcb": "AVCB", "iso": "ISO",
  "licenca de funcionamento": "LICENCA_FUNCIONAMENTO", "licenca funcionamento": "LICENCA_FUNCIONAMENTO",
};

function parseData(val) {
  if (!val) return null;
  if (typeof val === "number") {
    const epoch = new Date(1899, 11, 30);
    const d = new Date(epoch.getTime() + val * 86400000);
    return isNaN(d.getTime()) ? null : d;
  }
  const s = String(val).trim();
  const brMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (brMatch) {
    const d = new Date(`${brMatch[3]}-${brMatch[2].padStart(2, "0")}-${brMatch[1].padStart(2, "0")}`);
    return isNaN(d.getTime()) ? null : d;
  }
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export async function POST(req) {
  try {
    const user = await requireRole(["ADMIN", "RH"]);

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file) {
      return NextResponse.json({ success: false, error: "Nenhum arquivo enviado" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) {
      return NextResponse.json({ success: false, error: "Planilha vazia" }, { status: 400 });
    }

    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: "Nenhuma linha de dados encontrada" }, { status: 400 });
    }

    // Cache de funcionários para vincular
    const funcionarios = await prisma.funcionario.findMany({
      where: { ativo: true },
      select: { id: true, nome: true, matricula: true },
    });

    const mapHeader = (row) => {
      const keys = Object.keys(row);
      const find = (...terms) => {
        for (const t of terms) {
          const k = keys.find((k) => norm(k).includes(norm(t)));
          if (k) return row[k];
        }
        return "";
      };
      return {
        nome: find("nome", "documento"),
        categoria: find("categoria"),
        tipo: find("tipo"),
        funcionario: find("funcionario", "funcionário"),
        dataEmissao: find("emissao", "emissão"),
        dataValidade: find("validade", "vencimento"),
        orgaoEmissor: find("orgao", "órgão", "emissor"),
        numeroDocumento: find("numero", "número", "protocolo"),
        observacao: find("observacao", "observação", "obs"),
      };
    };

    // Resolver funcionário por nome ou matrícula
    function resolverFuncionario(texto) {
      if (!texto) return null;
      const s = String(texto).trim();
      if (!s) return null;
      // Busca por matrícula exata
      const porMatricula = funcionarios.find((f) => f.matricula && f.matricula === s);
      if (porMatricula) return porMatricula.id;
      // Busca por nome (contém)
      const sNorm = norm(s);
      const porNome = funcionarios.find((f) => norm(f.nome).includes(sNorm) || sNorm.includes(norm(f.nome)));
      if (porNome) return porNome.id;
      return null;
    }

    const resultados = [];
    let criados = 0;
    let erros = 0;

    for (let i = 0; i < rows.length; i++) {
      const lineNum = i + 2;
      const raw = mapHeader(rows[i]);

      const nome = String(raw.nome).trim();
      if (!nome) {
        resultados.push({ linha: lineNum, erro: "Nome vazio — linha ignorada" });
        erros++;
        continue;
      }

      // Categoria
      const catTexto = norm(raw.categoria);
      let categoria = null;
      for (const [key, val] of Object.entries(CATEGORIA_MAP)) {
        if (catTexto.includes(key)) { categoria = val; break; }
      }
      if (!categoria) {
        resultados.push({ linha: lineNum, nome, erro: `Categoria inválida: "${raw.categoria}". Use: Saúde / Segurança, Pessoal, Treinamento, ou Empresa / Licenças` });
        erros++;
        continue;
      }

      // Tipo
      const tipoTexto = norm(raw.tipo);
      const tipo = TIPO_MAP[tipoTexto] || (tipoTexto ? "OUTRO" : "OUTRO");

      // Funcionário
      const funcTexto = String(raw.funcionario).trim();
      let funcionarioId = null;
      if (funcTexto) {
        funcionarioId = resolverFuncionario(funcTexto);
        if (!funcionarioId) {
          resultados.push({ linha: lineNum, nome, erro: `Funcionário não encontrado: "${funcTexto}"` });
          erros++;
          continue;
        }
      }

      const dataEmissao = parseData(raw.dataEmissao);
      const dataValidade = parseData(raw.dataValidade);
      const orgaoEmissor = String(raw.orgaoEmissor).trim() || null;
      const numeroDocumento = String(raw.numeroDocumento).trim() || null;
      const observacao = String(raw.observacao).trim() || null;

      try {
        await prisma.documento.create({
          data: { nome, tipo, categoria, funcionarioId, dataEmissao, dataValidade, orgaoEmissor, numeroDocumento, observacao },
        });
        criados++;
        resultados.push({ linha: lineNum, nome, ok: true });
      } catch (e) {
        erros++;
        resultados.push({ linha: lineNum, nome, erro: e.message?.slice(0, 100) });
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "IMPORTAR_DOCUMENTOS",
        entity: "Documento",
        entityId: "bulk",
        diff: { total: rows.length, criados, erros },
      },
    });

    return NextResponse.json({ success: true, total: rows.length, criados, erros, detalhes: resultados });
  } catch (e) {
    console.error("Erro importar documentos:", e);
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
