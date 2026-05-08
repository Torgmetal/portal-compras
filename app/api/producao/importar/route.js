import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import Anthropic from "@anthropic-ai/sdk";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isoWeekString, semanaInicio, semanaFim, parseSemana } from "@/lib/semana";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `Você é um assistente de PCP (Planejamento e Controle de Produção) de uma siderúrgica/serralheria (Torg Metal).
Seu trabalho é extrair, de planilhas/PDFs/imagens, o planejamento semanal de produção:

- Quantos kg de estrutura prevê produzir por semana
- Quantos kg foram efetivamente produzidos (se já houver)
- Por OP (Ordem de Produção, ex: "T083") quando informado

REGRAS:
- A "semana" pode vir como "Semana 19", "S19", "19/2026", data inicial (ex: 06/05/2026), etc. Converta pra ISO: "AAAA-WNN" (ex: "2026-W19").
- Se vier só data (segunda-feira): converta pra semana ISO daquela data.
- Reconhece notação brasileira: vírgula é decimal.
- Pesos sempre em kg. Se vier em toneladas (t/ton), multiplique por 1000.
- Se uma linha não tem OP especificada, devolva opNumero=null (será lançamento geral).
- Ignore linhas de cabeçalho, totais, observações.

FORMATO DE SAÍDA — APENAS JSON em <json></json>:
<json>
{
  "itens": [
    {
      "semana": "2026-W19",
      "opNumero": "T083" | null,
      "pesoPrevistoKg": 5000,
      "pesoRealizadoKg": 4800,
      "observacao": "string ou null"
    }
  ]
}
</json>`;

// Parser xlsx — espera colunas com headers em PT-BR
function parseXlsx(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });

  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
  const findCol = (row, candidates) => {
    for (const c of Object.keys(row)) {
      const k = norm(c);
      for (const cand of candidates) if (k.includes(cand)) return c;
    }
    return null;
  };

  if (rows.length === 0) return { itens: [] };

  // Detecta colunas pela primeira linha
  const sample = rows[0];
  const colSemana = findCol(sample, ["semana", "sem"]);
  const colOp = findCol(sample, ["numop", "op", "ordem"]);
  const colPesoPrev = findCol(sample, ["pesoprev", "previsto", "planejado", "prev"]);
  const colPesoReal = findCol(sample, ["pesoreal", "realizado", "produzido", "real"]);
  const colObs = findCol(sample, ["observacao", "obs"]);

  const itens = [];
  for (const r of rows) {
    const semanaRaw = r[colSemana];
    if (!semanaRaw) continue;

    let semana = null;
    // Se for Date (Excel converteu)
    if (semanaRaw instanceof Date) {
      semana = isoWeekString(semanaRaw);
    } else {
      const s = String(semanaRaw).trim();
      // Formatos: "2026-W19" / "W19" / "S19" / "19/2026"
      let m = s.match(/^(\d{4})[-_W ]*W?(\d{1,2})$/i);
      if (m) semana = `${m[1]}-W${String(m[2]).padStart(2, "0")}`;
      else if ((m = s.match(/^[WS](\d{1,2})\/?(\d{4})?$/i))) {
        const ano = m[2] || new Date().getFullYear();
        semana = `${ano}-W${String(m[1]).padStart(2, "0")}`;
      } else if ((m = s.match(/^(\d{1,2})\/(\d{4})$/))) {
        semana = `${m[2]}-W${String(m[1]).padStart(2, "0")}`;
      } else {
        // Tenta parsear como data
        const d = new Date(s);
        if (!isNaN(d)) semana = isoWeekString(d);
      }
    }
    if (!semana) continue;

    const opNum = colOp ? String(r[colOp] || "").trim() || null : null;
    const peso = (v) => {
      const n = parseFloat(String(v || "0").replace(",", "."));
      return isNaN(n) ? 0 : n;
    };

    itens.push({
      semana,
      opNumero: opNum,
      pesoPrevistoKg: colPesoPrev ? peso(r[colPesoPrev]) : 0,
      pesoRealizadoKg: colPesoReal ? peso(r[colPesoReal]) : 0,
      observacao: colObs ? String(r[colObs] || "").trim() || null : null,
    });
  }

  return { itens };
}

// Parser via IA (Claude Haiku) pra PDF/imagem
async function parseWithAI({ pdfBase64, imageBase64, imageType }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { error: "ANTHROPIC_API_KEY não configurada" };
  }
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const content = [];
  if (pdfBase64) {
    const c = pdfBase64.includes(",") ? pdfBase64.split(",")[1] : pdfBase64;
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: c } });
  }
  if (imageBase64) {
    const c = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;
    content.push({ type: "image", source: { type: "base64", media_type: imageType || "image/jpeg", data: c } });
  }
  content.push({ type: "text", text: "Extraia o planejamento semanal de produção e retorne JSON conforme schema." });

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
  });

  const raw = message.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
  const tagged = raw.match(/<json>([\s\S]*?)<\/json>/i);
  const json = tagged ? tagged[1].trim() : raw.substring(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  try {
    return JSON.parse(json);
  } catch {
    return { error: "IA retornou JSON inválido", rawPreview: raw.slice(0, 400) };
  }
}

export async function POST(req) {
  try {
    await requireRole(["ADMIN", "PRODUCAO", "COMERCIAL", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { fileBase64, mimeType, fileName } = body;
  if (!fileBase64) return NextResponse.json({ error: "fileBase64 obrigatório" }, { status: 400 });

  let resultado;
  try {
    if (
      mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      mimeType === "application/vnd.ms-excel" ||
      /\.(xlsx|xls|csv)$/i.test(fileName || "")
    ) {
      const c = fileBase64.includes(",") ? fileBase64.split(",")[1] : fileBase64;
      const buffer = Buffer.from(c, "base64");
      resultado = parseXlsx(buffer);
    } else if (mimeType === "application/pdf" || /\.pdf$/i.test(fileName || "")) {
      resultado = await parseWithAI({ pdfBase64: fileBase64 });
    } else if ((mimeType || "").startsWith("image/")) {
      resultado = await parseWithAI({ imageBase64: fileBase64, imageType: mimeType });
    } else {
      return NextResponse.json({ error: "Formato não suportado. Use xlsx, pdf ou imagem." }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: "Falha ao processar: " + e.message }, { status: 500 });
  }

  if (resultado.error) {
    return NextResponse.json({ error: resultado.error }, { status: 502 });
  }

  // Resolve OP IDs pelos números
  const itens = resultado.itens || [];
  const opNumeros = [...new Set(itens.map((i) => i.opNumero).filter(Boolean))];
  const ops = opNumeros.length > 0
    ? await prisma.oP.findMany({
        where: { numero: { in: opNumeros } },
        select: { id: true, numero: true },
      })
    : [];
  const opMap = Object.fromEntries(ops.map((o) => [o.numero, o.id]));

  // Adiciona dataInicio/Fim e opId
  const itensComDatas = itens.map((it) => {
    const p = parseSemana(it.semana);
    return {
      ...it,
      opId: it.opNumero ? opMap[it.opNumero] || null : null,
      opEncontrada: it.opNumero ? !!opMap[it.opNumero] : null,
      dataInicio: p ? semanaInicio(p.ano, p.semana).toISOString() : null,
      dataFim: p ? semanaFim(p.ano, p.semana).toISOString() : null,
    };
  });

  return NextResponse.json({ itens: itensComDatas });
}
