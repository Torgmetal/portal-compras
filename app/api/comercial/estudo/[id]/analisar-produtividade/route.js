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

═══ REGRA FUNDAMENTAL: CLASSIFICACAO PELO KG/M DO PERFIL INDIVIDUAL ═══

A classificacao em faixas (Extra Pesada, Pesada, Media, Leve, Extra Leve) e determinada pelo PESO POR METRO LINEAR (kg/m) de cada perfil individual que compoe a peca — NAO pelo peso total da estrutura.

COMO DETERMINAR O kg/m DE CADA PERFIL:
- O numero no nome do perfil W indica o kg/m: W150X13 = 13 kg/m, W310X79 = 79 kg/m
- Cantoneiras L: calcular pela dimensao e espessura (ex: L 2"x1/4" ≈ 3.5 kg/m)
- Perfis U: U 4" ≈ 7.3 kg/m, U 8" ≈ 14.6 kg/m
- Tubos: Tubo Ø48x3mm ≈ 3.3 kg/m, Tubo Ø73x5mm ≈ 8.4 kg/m
- Chapas: converter espessura x largura para kg/m2 (aco = 7.850 kg/m3)

IMPACTO NA PRODUTIVIDADE:
- Perfis LEVES em trelicas = MUITAS pecas pequenas, muitos cortes, muitas soldas = DIFICIL de fabricar = ALTO Hh/ton
- Perfis PESADOS em alma cheia = poucas pecas grandes, menos operacoes = FACIL de fabricar = BAIXO Hh/ton
- Uma trelica de L 2"x1/4" (3.5 kg/m) e MUITO mais trabalhosa por tonelada que uma viga W310x79 (79 kg/m)

═══ TIPOS ESTRUTURAIS DA TORG METAL ═══

GRUPO: Trelicada (elementos com alma vazada / trelicas — banzos + diagonais + montantes)
As trelicas usam perfis leves (cantoneiras, tubos, U) e sao DIFICEIS de fabricar por ter muitas pecas por tonelada.
- TRELICADA_EXTRA_PESADA: perfis componentes >100 kg/m (raro em trelicas). Trelicas especiais de ponte rolante
- TRELICADA_PESADA: perfis componentes 60-100 kg/m. Trelicas de grandes vaos com perfis W pesados
- TRELICADA_MEDIA: perfis componentes 25-60 kg/m (ex: banzos W200x22.5, diagonais L 4"x1/2"). Trelicas pipe rack
- TRELICADA_LEVE: perfis componentes 10-25 kg/m (ex: banzos U 4"/W150x13, diagonais L 2"x1/4"). Trelicas cobertura
- TRELICADA_EXTRA_LEVE: perfis componentes <10 kg/m (ex: L 1"x1/8", Tubo Ø48). Trelicas leves, contraventamentos

GRUPO: Alma Cheia (vigas e colunas de perfil I/H — peca unica, sem alma vazada)
- ALMA_CHEIA_EXTRA_PESADA: perfil >100 kg/m (ex: W530x85, W610x101, VS600). Colunas principais, vigas de rolamento
- ALMA_CHEIA_PESADA: perfil 60-100 kg/m (ex: W310x79, W360x72, W410x85). Colunas, vigas principais
- ALMA_CHEIA_MEDIA: perfil 25-60 kg/m (ex: W200x46.1, W250x44.8, W310x44.5). Vigas, tesouras
- ALMA_CHEIA_LEVE: perfil 10-25 kg/m (ex: W200x22.5, W200x15). Vigas secundarias, longarinas
- ALMA_CHEIA_EXTRA_LEVE: perfil <10 kg/m (ex: W150x13). Tercas, travamentos leves

GRUPO: Suportes (estruturas de suporte de equipamentos e tubulacao)
- SUPORTE_EXTRA_PESADO: perfis >100 kg/m. Bases de equipamentos pesados
- SUPORTE_PESADO: perfis 60-100 kg/m. Suportes de vasos, caldeiras
- SUPORTE_MEDIO: perfis 25-60 kg/m. Suportes de equipamento, selas
- SUPORTE_LEVE: perfis 10-25 kg/m. Suportes de tubulacao, bercos
- SUPORTE_EXTRA_LEVE: perfis <10 kg/m. Misulas, cantoneiras, suportes simples

GRUPO: Spools (tubulacao industrial fabricada)
- SPOOL_PESADO: diametro 14"-24". Processo principal, adutoras
- SPOOL_MEDIO: diametro 6"-14". Processo, vapor
- SPOOL_LEVE: diametro ate 6". Utilidades, instrumentacao

GRUPO: Acessos (acessos industriais)
- GUARDA_CORPO: montantes, travessas, rodape. Plataformas, passarelas
- ESCADA: longarinas, degraus. Acesso entre niveis
- CORRIMAO: corrimao superior e intermediario. Escadas, rampas

═══ REGRAS DE CLASSIFICACAO ═══

1. Para CADA perfil/item do documento, identifique o kg/m do perfil (pelo nome: W150x13 = 13 kg/m)
2. Determine se a peca e trelica (alma vazada, multiplos perfis compostos) ou alma cheia (perfil unico I/H)
3. Use o kg/m do perfil para enquadrar na faixa correta (Extra Leve a Extra Pesada)
4. EXEMPLO: Uma trelica de cobertura com banzos L 3"x3/8" (8.6 kg/m) e diagonais L 2"x1/4" (3.5 kg/m):
   - Perfil medio: ~6 kg/m → Classificar como TRELICADA_EXTRA_LEVE (<10 kg/m)
   - Mesmo que a trelica inteira pese 5 toneladas, os perfis individuais sao leves
5. EXEMPLO: Uma coluna W310x79:
   - Perfil: 79 kg/m → Classificar como ALMA_CHEIA_PESADA (60-100 kg/m)
6. Chapas, grades de piso e outros itens: classificar pelo tipo mais proximo
7. Se o documento lista uma estrutura mista (ex: galpao com colunas W pesadas + trelicas de cobertura leves), SEPARE em tipos diferentes
8. O pesoKg de cada tipo e a soma dos pesos de TODOS os perfis classificados naquela faixa
9. NUNCA invente pesos — se nao tem informacao suficiente, use null no pesoKg

═══ FORMATO DE SAIDA ═══
Devolva APENAS JSON valido em <json></json>:

<json>
{
  "pesoTotalEstimado": "number ou null (kg total do projeto)",
  "observacoes": "string (notas sobre a analise, premissas adotadas, kg/m medio identificado por grupo)",
  "composicao": [
    {
      "tipoObraId": "string (ID exato da lista acima, ex: TRELICADA_LEVE)",
      "pesoKg": "number (peso total dos perfis classificados neste tipo, em kg)",
      "kgmMedio": "number (kg/m medio dos perfis deste grupo)",
      "elementosIdentificados": "string (lista dos perfis: ex 'L 3x3/8 (8.6 kg/m), L 2x1/4 (3.5 kg/m), U 4 (7.3 kg/m)')"
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
          kgmMedio: Number(c.kgmMedio) || null,
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
