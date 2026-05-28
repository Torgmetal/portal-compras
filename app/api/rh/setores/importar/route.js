// POST /api/rh/setores/importar — importa setores de planilha Excel
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import * as XLSX from "xlsx";

export const maxDuration = 30;

const norm = (s) => (s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

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

    // Mapear cabeçalhos flexíveis
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
        nome: find("nome", "setor", "departamento"),
        sigla: find("sigla", "abreviação", "abreviacao"),
        cor: find("cor", "color", "hex"),
      };
    };

    // Cache de setores existentes
    const existentes = await prisma.setor.findMany({ where: { ativo: true } });
    const cache = new Set(existentes.map((s) => norm(s.nome)));

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

      if (cache.has(norm(nome))) {
        resultados.push({ linha: lineNum, nome, erro: "Setor já existe" });
        erros++;
        continue;
      }

      const sigla = String(raw.sigla).trim().toUpperCase().slice(0, 6) || null;
      const cor = String(raw.cor).trim() || null;

      try {
        await prisma.setor.create({ data: { nome, sigla, cor } });
        cache.add(norm(nome));
        criados++;
        resultados.push({ linha: lineNum, nome, ok: true });
      } catch (e) {
        erros++;
        resultados.push({ linha: lineNum, nome, erro: e.code === "P2002" ? "Nome duplicado" : e.message?.slice(0, 100) });
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "IMPORTAR_SETORES",
        entity: "Setor",
        entityId: "bulk",
        diff: { total: rows.length, criados, erros },
      },
    });

    return NextResponse.json({ success: true, total: rows.length, criados, erros, detalhes: resultados });
  } catch (e) {
    console.error("Erro importar setores:", e);
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
