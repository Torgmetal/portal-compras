import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

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
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    csv: "text/csv",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  return map[tipo?.toLowerCase()] || "application/octet-stream";
}

export async function POST(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { success: false, error: "ANTHROPIC_API_KEY nao configurada no servidor" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { docIds, textoExtra } = body; // docIds opcionais, textoExtra = contexto adicional

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
    const docsParaAnalisar = docs.filter((d) => tiposSuportados.includes(d.tipo?.toLowerCase()));

    if (docsParaAnalisar.length === 0 && !textoExtra) {
      return NextResponse.json(
        { success: false, error: "Nenhum documento suportado encontrado. Envie PDFs ou imagens para analise." },
        { status: 400 }
      );
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Montar conteudo da mensagem
    const content = [];

    // Adicionar documentos
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
        // Pula documentos que falharem no download
        console.error(`Falha ao processar ${doc.nome}:`, err.message);
      }
    }

    // Contexto do projeto
    const contexto = [
      `PROJETO: EPC-${estudo.orcamento.numero}`,
      `CLIENTE: ${estudo.orcamento.cliente}`,
      estudo.orcamento.obra ? `OBRA: ${estudo.orcamento.obra}` : null,
      estudo.referencia ? `REFERENCIA: ${estudo.referencia}` : null,
      estudo.itensPerso?.length > 0
        ? `ITENS JA CADASTRADOS (${estudo.itensPerso.length}): ${estudo.itensPerso.map(i => i.descricao).join(", ")}`
        : "NENHUM ITEM CADASTRADO AINDA",
    ].filter(Boolean).join("\n");

    content.push({
      type: "text",
      text: `${contexto}\n\n${textoExtra ? `CONTEXTO ADICIONAL DO USUARIO:\n${textoExtra}\n\n` : ""}Analise os documentos acima e extraia TODOS os itens de material com seus pesos para o levantamento do projeto. Retorne o JSON conforme o schema do system prompt.`,
    });

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
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
    const itens = (resultado.itens || []).map((item, idx) => ({
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
          modelo: "claude-sonnet-4-20250514",
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
      },
    });
  } catch (e) {
    console.error("Erro na analise IA:", e);
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
