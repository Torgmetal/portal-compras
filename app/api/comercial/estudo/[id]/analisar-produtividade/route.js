import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { join } from "path";

export const runtime = "nodejs";
export const maxDuration = 120;

function getAnthropicKey() {
  const envKey = process.env.ANTHROPIC_API_KEY;
  if (envKey && envKey.startsWith("sk-ant-")) return envKey;
  try {
    const envFile = readFileSync(join(process.cwd(), ".env.local"), "utf-8");
    const match = envFile.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    if (match) return match[1].trim();
  } catch { /* noop */ }
  return null;
}

// Mesmos tipos de obra definidos no front (AbaProdutividade.jsx)
const TIPOS_OBRA_REF = [
  { id: "TRELICADA_EXTRA_PESADA", label: "Treliçada Extra Pesada (100+ kg/m)", hhTon: 22.2, grupo: "Treliçada" },
  { id: "TRELICADA_PESADA",       label: "Treliçada Pesada (60–100 kg/m)",     hhTon: 28.6, grupo: "Treliçada" },
  { id: "TRELICADA_MEDIA",        label: "Treliçada Média (25–60 kg/m)",       hhTon: 45.5, grupo: "Treliçada" },
  { id: "TRELICADA_LEVE",         label: "Treliçada Leve (10–25 kg/m)",        hhTon: 66.7, grupo: "Treliçada" },
  { id: "TRELICADA_EXTRA_LEVE",   label: "Treliçada Extra Leve (0–10 kg/m)",   hhTon: 125,  grupo: "Treliçada" },
  { id: "ALMA_CHEIA_EXTRA_PESADA", label: "Alma Cheia Extra Pesada (100+ kg/m)", hhTon: 18.2, grupo: "Alma Cheia" },
  { id: "ALMA_CHEIA_PESADA",       label: "Alma Cheia Pesada (60–100 kg/m)",     hhTon: 22.2, grupo: "Alma Cheia" },
  { id: "ALMA_CHEIA_MEDIA",        label: "Alma Cheia Média (25–60 kg/m)",       hhTon: 28.6, grupo: "Alma Cheia" },
  { id: "ALMA_CHEIA_LEVE",         label: "Alma Cheia Leve (10–25 kg/m)",        hhTon: 40,   grupo: "Alma Cheia" },
  { id: "ALMA_CHEIA_EXTRA_LEVE",   label: "Alma Cheia Extra Leve (0–10 kg/m)",   hhTon: 66.7, grupo: "Alma Cheia" },
  { id: "SUPORTE_EXTRA_PESADO", label: "Suporte Extra Pesado (100+ kg/m)",  hhTon: 20,   grupo: "Suportes" },
  { id: "SUPORTE_PESADO",       label: "Suporte Pesado (60–100 kg/m)",      hhTon: 33.3, grupo: "Suportes" },
  { id: "SUPORTE_MEDIO",        label: "Suporte Médio (25–60 kg/m)",        hhTon: 50,   grupo: "Suportes" },
  { id: "SUPORTE_LEVE",         label: "Suporte Leve (10–25 kg/m)",         hhTon: 66.7, grupo: "Suportes" },
  { id: "SUPORTE_EXTRA_LEVE",   label: "Suporte Extra Leve (0–10 kg/m)",    hhTon: 100,  grupo: "Suportes" },
  { id: "SPOOL_PESADO", label: "Spool Pesado (14\"–24\")", hhTon: 66.7, grupo: "Spools" },
  { id: "SPOOL_MEDIO",  label: "Spool Médio (6\"–14\")",   hhTon: 76.9, grupo: "Spools" },
  { id: "SPOOL_LEVE",   label: "Spool Leve (até 6\")",     hhTon: 100,  grupo: "Spools" },
  { id: "GUARDA_CORPO", label: "Guarda-corpo",  hhTon: 41.7, grupo: "Acessos" },
  { id: "ESCADA",       label: "Escada",        hhTon: 45.5, grupo: "Acessos" },
  { id: "CORRIMAO",     label: "Corrimão",      hhTon: 55.6, grupo: "Acessos" },
];

const SYSTEM_PROMPT = `Voce e um engenheiro orcamentista da Torg Metal, metalurgica especializada em estruturas metalicas industriais.
Seu trabalho e analisar documentos de projeto (PDFs de listas de materiais, BOM, desenhos tecnicos, planilhas Tekla/Advance Steel) e CLASSIFICAR os elementos estruturais nos tipos padrao da fabrica, estimando o peso de cada tipo.

═══ TIPOS ESTRUTURAIS DA TORG METAL (classifique cada elemento em UM destes) ═══

GRUPO: Treliçada (elementos com alma vazada / treliças)
- TRELICADA_EXTRA_PESADA: perfis >100 kg/m (ex: W360x122, W410x149, VS600). Treliças especiais, pontes rolantes
- TRELICADA_PESADA: perfis 60-100 kg/m (ex: W250x73, W310x79, HP310x79). Treliças principais, pórticos
- TRELICADA_MEDIA: perfis 25-60 kg/m (ex: L 4"x1/2", U 8", W200x22.5). Treliças pipe rack
- TRELICADA_LEVE: perfis 10-25 kg/m (ex: L 2"x1/4", U 4", W150x13). Treliças cobertura, travamentos
- TRELICADA_EXTRA_LEVE: perfis <10 kg/m (ex: L 1"x1/8", Tubo Ø48). Treliças leves, suportes tubulares

GRUPO: Alma Cheia (vigas e colunas de perfil I/H)
- ALMA_CHEIA_EXTRA_PESADA: perfis >100 kg/m (ex: W530x85, W610x101). Colunas principais, vigas de rolamento
- ALMA_CHEIA_PESADA: perfis 60-100 kg/m (ex: W310x79, W360x72). Colunas, vigas principais
- ALMA_CHEIA_MEDIA: perfis 25-60 kg/m (ex: W200x46.1, W250x44.8). Vigas principais, tesouras
- ALMA_CHEIA_LEVE: perfis 10-25 kg/m (ex: W200x22.5, W200x31.3). Vigas secundárias, longarinas
- ALMA_CHEIA_EXTRA_LEVE: perfis <10 kg/m (ex: W150x13). Terças, travamentos leves

GRUPO: Suportes (estruturas de suporte de equipamentos e tubulação)
- SUPORTE_EXTRA_PESADO: >100 kg/m. Bases de equipamentos pesados
- SUPORTE_PESADO: 60-100 kg/m. Suportes de vasos, caldeiras
- SUPORTE_MEDIO: 25-60 kg/m. Suportes de equipamento, selas
- SUPORTE_LEVE: 10-25 kg/m. Suportes de tubulação, berços
- SUPORTE_EXTRA_LEVE: <10 kg/m. Mísulas, cantoneiras, suportes simples

GRUPO: Spools (tubulação industrial fabricada)
- SPOOL_PESADO: diâmetro 14"-24". Processo principal, adutoras
- SPOOL_MEDIO: diâmetro 6"-14". Processo, vapor
- SPOOL_LEVE: diâmetro até 6". Utilidades, instrumentação

GRUPO: Acessos (acessos industriais)
- GUARDA_CORPO: montantes, travessas, rodapé. Plataformas, passarelas
- ESCADA: longarinas, degraus. Acesso entre níveis
- CORRIMAO: corrimão superior e intermediário. Escadas, rampas

═══ REGRAS ═══

1. Analise TODOS os elementos do projeto e classifique cada um no tipo mais adequado
2. Se o documento tem lista de materiais com pesos, use os pesos informados
3. Se nao tem pesos, estime baseado no perfil/dimensao e quantidade
4. Agrupe por tipo e some os pesos
5. O peso por metro (kg/m) determina a faixa (Extra Leve a Extra Pesada)
6. Chapas, grades de piso, degraus e acessos devem ser classificados no tipo mais proximo
7. Se nao conseguir classificar, use o grupo mais proximo baseado na funcao do elemento
8. NUNCA invente pesos — se nao tem informacao suficiente, use null no pesoKg

═══ FORMATO DE SAIDA ═══
Devolva APENAS JSON valido em <json></json>:

<json>
{
  "pesoTotalEstimado": "number ou null (kg total do projeto)",
  "observacoes": "string (notas sobre a analise, dificuldades, premissas adotadas)",
  "composicao": [
    {
      "tipoObraId": "string (ID exato da lista acima, ex: ALMA_CHEIA_MEDIA)",
      "pesoKg": "number (peso total deste tipo em kg)",
      "elementosIdentificados": "string (resumo dos elementos que compõem este tipo)"
    }
  ]
}
</json>`;

function extractJsonFromResponse(text) {
  const tagged = text.match(/<json>([\s\S]*?)<\/json>/i);
  if (tagged) return tagged[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.substring(start, end + 1);
  return text;
}

async function fetchBlobAsBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar ${url}: ${res.status}`);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}

export async function POST(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;

    const apiKey = getAnthropicKey();
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "ANTHROPIC_API_KEY nao configurada no servidor" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { docIds, pdfBase64, imageBase64, imageType, textoExtra } = body;

    // Buscar estudo
    const estudo = await prisma.propostaEstudo.findUnique({
      where: { id },
      include: {
        orcamento: { select: { numero: true, cliente: true, obra: true } },
        documentos: { orderBy: { criadoEm: "desc" } },
      },
    });
    if (!estudo) {
      return NextResponse.json({ success: false, error: "Estudo nao encontrado" }, { status: 404 });
    }

    const anthropic = new Anthropic({ apiKey });
    const content = [];

    // Modo 1: docs ja uploadados (por ID)
    if (docIds?.length) {
      const docs = estudo.documentos.filter((d) => docIds.includes(d.id));
      const tiposSuportados = ["pdf", "png", "jpg", "jpeg"];
      const docsValidos = docs.filter((d) => tiposSuportados.includes(d.tipo?.toLowerCase()));

      for (const doc of docsValidos.slice(0, 5)) {
        try {
          const base64 = await fetchBlobAsBase64(doc.blobUrl);
          if (doc.tipo === "pdf") {
            content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } });
          } else {
            content.push({ type: "image", source: { type: "base64", media_type: `image/${doc.tipo}`, data: base64 } });
          }
          content.push({ type: "text", text: `[Documento: ${doc.nome}]` });
        } catch (err) {
          console.error(`Falha ao processar ${doc.nome}:`, err.message);
        }
      }
    }

    // Modo 2: arquivo enviado direto (base64)
    if (pdfBase64) {
      const cleanB64 = pdfBase64.includes(",") ? pdfBase64.split(",")[1] : pdfBase64;
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: cleanB64 } });
    }
    if (imageBase64) {
      const cleanB64 = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;
      content.push({ type: "image", source: { type: "base64", media_type: imageType || "image/jpeg", data: cleanB64 } });
    }

    if (content.length === 0 && !textoExtra) {
      return NextResponse.json(
        { success: false, error: "Envie pelo menos um documento (PDF ou imagem) para analise." },
        { status: 400 }
      );
    }

    // Contexto do projeto
    const contexto = [
      `PROJETO: EPC-${estudo.orcamento.numero}`,
      `CLIENTE: ${estudo.orcamento.cliente}`,
      estudo.orcamento.obra ? `OBRA: ${estudo.orcamento.obra}` : null,
    ].filter(Boolean).join("\n");

    content.push({
      type: "text",
      text: `${contexto}\n\n${textoExtra ? `CONTEXTO ADICIONAL:\n${textoExtra}\n\n` : ""}Analise os documentos de projeto acima e classifique TODOS os elementos estruturais nos tipos padrao da Torg Metal, informando o peso estimado de cada tipo. Retorne o JSON conforme o schema do system prompt.`,
    });

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    });

    const rawText = message.content[0]?.text || "";
    const jsonStr = extractJsonFromResponse(rawText);

    let resultado;
    try {
      resultado = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json(
        { success: false, error: "IA retornou resposta invalida. Tente novamente.", raw: rawText.substring(0, 500) },
        { status: 422 }
      );
    }

    // Sanitizar e enriquecer composicao com dados da tabela TORG
    const composicao = (resultado.composicao || [])
      .filter((c) => c.tipoObraId && c.pesoKg > 0)
      .map((c) => {
        const tipo = TIPOS_OBRA_REF.find((t) => t.id === c.tipoObraId);
        return {
          tipoObraId: c.tipoObraId,
          label: tipo?.label || c.tipoObraId,
          grupo: tipo?.grupo || "Outro",
          pesoKg: Math.round(Number(c.pesoKg) || 0),
          hhTon: tipo?.hhTon || 0,
          elementosIdentificados: c.elementosIdentificados || "",
        };
      });

    // Calcular media ponderada
    const pesoTotalMix = composicao.reduce((s, c) => s + c.pesoKg, 0);
    const hhTonPonderado = pesoTotalMix > 0
      ? composicao.reduce((s, c) => s + (c.hhTon * c.pesoKg), 0) / pesoTotalMix
      : 0;

    // Audit log
    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "ANALISAR_PRODUTIVIDADE_IA",
        entity: "PropostaEstudo",
        entityId: id,
        diff: {
          tiposIdentificados: composicao.length,
          pesoTotalEstimado: resultado.pesoTotalEstimado,
          hhTonPonderado: Math.round(hhTonPonderado * 10) / 10,
          modelo: "claude-sonnet-4-6",
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        composicao,
        pesoTotalEstimado: resultado.pesoTotalEstimado,
        pesoTotalMix,
        hhTonPonderado: Math.round(hhTonPonderado * 10) / 10,
        observacoes: resultado.observacoes || "",
        _meta: {
          model: message.model,
          inputTokens: message.usage?.input_tokens,
          outputTokens: message.usage?.output_tokens,
        },
      },
    });
  } catch (e) {
    console.error("Erro na analise produtividade IA:", e);
    if (e.message?.includes("maximum size") || e.message?.includes("request_too_large")) {
      return NextResponse.json(
        { success: false, error: "Documento muito grande. Tente um arquivo menor ou com menos paginas." },
        { status: 413 }
      );
    }
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
