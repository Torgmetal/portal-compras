import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { join } from "path";
import { matchItensComOmie } from "@/lib/match-omie";

export const runtime = "nodejs";
export const maxDuration = 120;

// Fallback: se ANTHROPIC_API_KEY estiver vazia (processo pai override),
// ler diretamente do .env.local
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

// Maximo de docs por lote (cada PDF pode ter ~1-5MB em base64)
const MAX_DOCS_POR_LOTE = 5;

const SYSTEM_PROMPT = `Voce e um engenheiro orcamentista de uma metalurgica (Torg Metal) especializada em estruturas metalicas.
Seu trabalho e analisar documentos de projetos (PDFs, planilhas, listas de materiais, desenhos tecnicos, e-mails de clientes) e extrair todos os itens de material com seus pesos para um levantamento de peso de projeto (EPC - Estudo de Precificacao Comercial).

REGRAS DE EXTRACAO:

1. IDENTIFICAR PERFIS E MATERIAIS:
   - Perfis laminados: W150X13, W200X15, W310X52, HP200X53, etc.
   - Perfis U/UE dobrados: U100X50X3, UE200X75X25X3, etc.
   - Cantoneiras L: L3"X1/4", L100X100X8, etc.
   - Tubos: TUBO RED 2"SCH40, TUBO QUAD100X100X3, TUBO RET120X60X3, etc.
   - Chapas: CHAPA#9,50, CHAPA#12,50, CHAPA XADREZ#6,30, etc.
   - Barras: BARRA CHATA 1/2"X3", BARRA RED 1", BARRA ROSCADA 3/4", etc.
   - Grades de piso: GS-A4-304, GS-B2-306, etc.
   - Degraus: SMD-303-30/100, etc.
   - Telas, fixadores, etc.

2. PARA CADA ITEM EXTRAIR:
   - descricao: nome exato do perfil/material como aparece no documento
   - setor: area/setor da obra (FRONTAL, TRASEIRA, COBERTURA, PLATAFORMA, etc.) se disponivel
   - tipoMaterial: um dos valores: PERFIL_W, PERFIL_U, PERFIL_L, TUBO_REDONDO, TUBO_QUADRADO, TUBO_RETANGULAR, CHAPA, BARRA_REDONDA, BARRA_CHATA, BARRA_QUADRADA, BARRA_ROSCADA, TELA, GRADE_PISO, DEGRAU, OUTRO
   - norma: ASTM A572 Gr.50, ASTM A36, SAE 1020, DIN 2440, etc. se mencionada
   - comprimento: em metros (converter de mm se necessario). Se for chapa, a area em m2
   - pesoUnitario: kg por metro (ou kg/m2 para chapas). Se o documento der peso total e comprimento, calcule: pesoUnit = pesoTotal / comprimento
   - quantidade: numero de pecas/barras
   - pesoTotal: peso total em kg. Se nao informado diretamente, calcule: pesoUnitario x comprimento x quantidade (ou pesoUnitario x quantidade se nao tem comprimento)

3. NOTACAO BRASILEIRA:
   - Virgula e decimal: "7,50" = 7.50
   - Ponto e milhar: "1.234,56" = 1234.56
   - Aspas duplas/simples sao polegadas: 3/4", 1.1/2"

4. AGRUPAR ITENS IGUAIS:
   - Se o mesmo perfil aparece varias vezes no mesmo setor, agrupe somando quantidades
   - Mas mantenha setores separados (mesmo perfil em FRONTAL e TRASEIRA = 2 linhas)

5. PESO TOTAL DO PROJETO:
   - Se o documento mencionar um peso total da estrutura, informe no campo pesoTotalProjeto
   - Composicao tipica de peso por tipo: informe no campo composicao se disponivel

6. NAO INVENTAR:
   - Se um dado nao esta no documento, use null
   - Se nao tem certeza da norma, use null
   - Se o documento nao e tecnico/de projeto, retorne itens vazio

FORMATO DE SAIDA:
Devolva APENAS um JSON valido envolvido em <json></json>:

<json>
{
  "pesoTotalProjeto": "number ou null (kg total mencionado no documento)",
  "composicao": "string ou null (ex: 95% Perfis W, 3% U/UE, 2% L)",
  "observacoes": "string ou null (notas relevantes sobre o projeto)",
  "itens": [
    {
      "descricao": "string",
      "setor": "string ou null",
      "tipoMaterial": "string (enum TipoMaterial)",
      "norma": "string ou null",
      "comprimento": "number ou null (metros ou m2)",
      "pesoUnitario": "number (kg/m ou kg/m2)",
      "quantidade": "number",
      "pesoTotal": "number (kg)"
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

// Baixa um arquivo do Blob e converte para base64
async function fetchBlobAsBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar ${url}: ${res.status}`);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}

function getMediaType(tipo) {
  const map = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
  };
  return map[tipo?.toLowerCase()] || "application/octet-stream";
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
    const { docIds, textoExtra, lote, loteSize } = body;
    // lote = indice do lote atual (0-based)
    // loteSize = quantos docs por lote (default MAX_DOCS_POR_LOTE)

    // Buscar estudo com orcamento e documentos
    const estudo = await prisma.propostaEstudo.findUnique({
      where: { id },
      include: {
        orcamento: { select: { numero: true, cliente: true, obra: true } },
        documentos: { orderBy: { criadoEm: "desc" } },
        itensPerso: { select: { descricao: true, pesoTotal: true } },
      },
    });

    if (!estudo) {
      return NextResponse.json({ success: false, error: "Estudo nao encontrado" }, { status: 404 });
    }

    // Filtrar documentos a analisar
    let docs = estudo.documentos;
    if (docIds?.length) {
      docs = docs.filter((d) => docIds.includes(d.id));
    }

    // Tipos suportados para enviar ao Claude
    const tiposSuportados = ["pdf", "png", "jpg", "jpeg"];
    const todosDocsSuportados = docs.filter((d) => tiposSuportados.includes(d.tipo?.toLowerCase()));

    if (todosDocsSuportados.length === 0 && !textoExtra) {
      return NextResponse.json(
        { success: false, error: "Nenhum documento suportado encontrado. Envie PDFs ou imagens para analise." },
        { status: 400 }
      );
    }

    // Paginacao por lotes
    const tamLote = Math.min(loteSize || MAX_DOCS_POR_LOTE, MAX_DOCS_POR_LOTE);
    const loteAtual = lote ?? 0;
    const totalLotes = Math.ceil(todosDocsSuportados.length / tamLote);
    const inicio = loteAtual * tamLote;
    const docsParaAnalisar = todosDocsSuportados.slice(inicio, inicio + tamLote);

    // Se nao tem docs neste lote (lote invalido), retornar vazio
    if (docsParaAnalisar.length === 0 && !textoExtra) {
      return NextResponse.json({
        success: true,
        data: {
          itens: [],
          pesoTotalProjeto: null,
          composicao: null,
          observacoes: null,
          docsAnalisados: [],
          paginacao: { loteAtual, totalLotes, totalDocs: todosDocsSuportados.length, concluido: true },
        },
      });
    }

    const anthropic = new Anthropic({ apiKey });

    // Montar conteudo da mensagem
    const content = [];

    // Adicionar documentos do lote atual
    for (const doc of docsParaAnalisar) {
      try {
        const base64 = await fetchBlobAsBase64(doc.blobUrl);
        const mediaType = getMediaType(doc.tipo);

        if (doc.tipo === "pdf") {
          content.push({
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: base64 },
          });
        } else {
          content.push({
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          });
        }
        content.push({
          type: "text",
          text: `[Documento: ${doc.nome} | Categoria: ${doc.categoria || "geral"}]`,
        });
      } catch (err) {
        console.error(`Falha ao processar ${doc.nome}:`, err.message);
      }
    }

    // Se nenhum doc foi carregado com sucesso
    if (content.length === 0 && !textoExtra) {
      return NextResponse.json({
        success: true,
        data: {
          itens: [],
          pesoTotalProjeto: null,
          composicao: null,
          observacoes: "Falha ao baixar documentos deste lote",
          docsAnalisados: [],
          paginacao: { loteAtual, totalLotes, totalDocs: todosDocsSuportados.length, concluido: loteAtual >= totalLotes - 1 },
        },
      });
    }

    // Contexto do projeto
    const contexto = [
      `PROJETO: EPC-${estudo.orcamento.numero}`,
      `CLIENTE: ${estudo.orcamento.cliente}`,
      estudo.orcamento.obra ? `OBRA: ${estudo.orcamento.obra}` : null,
      estudo.referencia ? `REFERENCIA: ${estudo.referencia}` : null,
      totalLotes > 1 ? `LOTE ${loteAtual + 1} de ${totalLotes} (${docsParaAnalisar.length} documentos neste lote)` : null,
    ].filter(Boolean).join("\n");

    content.push({
      type: "text",
      text: `${contexto}\n\n${textoExtra ? `CONTEXTO ADICIONAL DO USUARIO:\n${textoExtra}\n\n` : ""}Analise os documentos acima e extraia TODOS os itens de material com seus pesos para o levantamento do projeto. Retorne o JSON conforme o schema do system prompt.`,
    });

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 16000,
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

    // Sanitizar itens
    const itensBrutos = (resultado.itens || []).map((item, idx) => ({
      descricao: String(item.descricao || "").trim(),
      setor: item.setor || null,
      tipoMaterial: item.tipoMaterial || "OUTRO",
      norma: item.norma || null,
      comprimento: item.comprimento != null ? Number(item.comprimento) : null,
      pesoUnitario: Number(item.pesoUnitario) || 0,
      quantidade: Math.max(1, Math.round(Number(item.quantidade) || 1)),
      pesoTotal: Number(item.pesoTotal) || 0,
      ordem: idx,
    })).filter((i) => i.descricao && i.pesoTotal > 0);

    // Vincular com cadastro Omie (best-effort)
    let itens;
    try {
      itens = await matchItensComOmie(itensBrutos);
    } catch (err) {
      console.error("Erro no match Omie (continuando sem vinculacao):", err.message);
      itens = itensBrutos.map((i) => ({ ...i, codigoOmie: null, descricaoOmie: null, custoUnitario: null }));
    }

    // Log
    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "ANALISAR_IA",
        entity: "PropostaEstudo",
        entityId: id,
        diff: {
          docsAnalisados: docsParaAnalisar.map((d) => d.nome),
          itensExtraidos: itens.length,
          pesoTotalProjeto: resultado.pesoTotalProjeto,
          modelo: "claude-sonnet-4-6",
          lote: loteAtual,
          totalLotes,
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        itens,
        pesoTotalProjeto: resultado.pesoTotalProjeto,
        composicao: resultado.composicao,
        observacoes: resultado.observacoes,
        docsAnalisados: docsParaAnalisar.map((d) => d.nome),
        paginacao: {
          loteAtual,
          totalLotes,
          totalDocs: todosDocsSuportados.length,
          concluido: loteAtual >= totalLotes - 1,
        },
      },
    });
  } catch (e) {
    console.error("Erro na analise IA:", e);
    // Se for erro de tamanho, dar mensagem amigavel
    if (e.message?.includes("maximum size") || e.message?.includes("request_too_large")) {
      return NextResponse.json(
        { success: false, error: "Documentos muito grandes. Tente selecionar menos documentos ou use a analise por lotes." },
        { status: 413 }
      );
    }
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
