// GET /api/diagnostico-omie?numero=233&tipo=VENDA
// Endpoint de diagnostico — testa varias formas de buscar pedido/OS no Omie
// e retorna tudo que tentou e o que voltou. Util pra descobrir o filtro correto.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OMIE_VENDA_URL = "https://app.omie.com.br/api/v1/produtos/pedido/";
const OMIE_OS_URL = "https://app.omie.com.br/api/v1/servicos/os/";

async function callOmie(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "COMERCIAL", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const numero = (searchParams.get("numero") || "").trim();
  const tipo = (searchParams.get("tipo") || "VENDA").toUpperCase();
  if (!numero) {
    return NextResponse.json({ error: "Informe ?numero=XXX&tipo=VENDA|SERVICO" }, { status: 400 });
  }

  const APP_KEY = process.env.OMIE_APP_KEY;
  const APP_SECRET = process.env.OMIE_APP_SECRET;
  if (!APP_KEY || !APP_SECRET) {
    return NextResponse.json({ error: "Credenciais Omie nao configuradas." }, { status: 500 });
  }

  const tentativas = [];

  if (tipo === "VENDA") {
    // Tenta varios filtros pra Pedido de Venda — DEDUPLICA e adiciona delay
    // entre chamadas pra nao acionar "Consumo redundante" do Omie.
    const filtrosBrutos = [
      { numero_pedido: numero },
      ...(numero.includes("/") ? [{ numero_pedido: numero.split("/")[0] }] : []),
      ...(Number(numero.replace(/\D/g, "")) > 0
        ? [{ codigo_pedido: Number(numero.replace(/\D/g, "")) }]
        : []),
    ];
    // Dedupe por JSON
    const filtros = [];
    const vistos = new Set();
    for (const f of filtrosBrutos) {
      const key = JSON.stringify(f);
      if (!vistos.has(key)) {
        vistos.add(key);
        filtros.push(f);
      }
    }
    for (const f of filtros) {
      const r = await callOmie(OMIE_VENDA_URL, {
        call: "ConsultarPedido",
        app_key: APP_KEY,
        app_secret: APP_SECRET,
        param: [f],
      });
      tentativas.push({
        filtro: f,
        httpStatus: r.status,
        sucesso: !!r.data?.pedido_venda_produto?.cabecalho,
        faultstring: r.data?.faultstring || null,
        topKeys: Object.keys(r.data || {}).slice(0, 10),
        cabecalhoExtract: r.data?.pedido_venda_produto?.cabecalho ? {
          numero_pedido: r.data.pedido_venda_produto.cabecalho.numero_pedido,
          codigo_pedido: r.data.pedido_venda_produto.cabecalho.codigo_pedido,
          etapa: r.data.pedido_venda_produto.cabecalho.etapa,
        } : null,
      });
      // Se ja achou, para
      if (r.data?.pedido_venda_produto?.cabecalho) break;
      // Delay 4s entre tentativas pra evitar REDUNDANT
      await new Promise((r) => setTimeout(r, 4000));
    }

    // Tenta tambem ListarPedidos pra ver se acha o pedido por outros campos
    const lista = await callOmie(OMIE_VENDA_URL, {
      call: "ListarPedidos",
      app_key: APP_KEY,
      app_secret: APP_SECRET,
      param: [{
        pagina: 1,
        registros_por_pagina: 5,
        filtrar_por_numero_pedido_de: numero,
        filtrar_por_numero_pedido_ate: numero,
      }],
    });
    tentativas.push({
      filtro: { LISTAR: { de: numero, ate: numero } },
      httpStatus: lista.status,
      sucesso: (lista.data?.pedido_venda_produto || []).length > 0,
      faultstring: lista.data?.faultstring || null,
      total: lista.data?.total_de_registros || 0,
      primeiros: (lista.data?.pedido_venda_produto || []).slice(0, 3).map((p) => ({
        numero: p.cabecalho?.numero_pedido,
        codigo: p.cabecalho?.codigo_pedido,
      })),
    });
  } else {
    // Tenta varios filtros pra Ordem de Servico
    const filtros = [
      { cNumOS: numero },
      { nCodOS: Number(numero.replace(/\D/g, "")) || 0 },
    ];
    for (const f of filtros) {
      if (f.nCodOS === 0) continue;
      const r = await callOmie(OMIE_OS_URL, {
        call: "ConsultarOS",
        app_key: APP_KEY,
        app_secret: APP_SECRET,
        param: [f],
      });
      tentativas.push({
        filtro: f,
        httpStatus: r.status,
        sucesso: !!r.data?.Cabecalho || !!r.data?.cabecalho,
        faultstring: r.data?.faultstring || null,
        topKeys: Object.keys(r.data || {}).slice(0, 10),
      });
    }
  }

  return NextResponse.json({
    numero, tipo,
    tentativas,
    sugestao: tentativas.find((t) => t.sucesso)
      ? "✅ Algum filtro funcionou — veja qual"
      : "❌ Nenhum filtro encontrou. Confirme se o número existe no Omie e em qual menu.",
  });
}
