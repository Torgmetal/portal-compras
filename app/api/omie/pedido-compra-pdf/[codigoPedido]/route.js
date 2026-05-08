import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";

// GET — chama a API do Omie pra gerar o link temporario do PDF do pedido
// de compra, e redireciona o usuario direto pra ele.
//
// Se a API do Omie nao expoe geracao de PDF de pedido de compra (algumas
// versoes nao tem esse call), o endpoint cai no fallback: redireciona pro
// modulo Compras do tenant Torg, onde o usuario clica no pedido manualmente.

const OMIE_TENANT = process.env.NEXT_PUBLIC_OMIE_TENANT || "torg-5mos4yik";
const OMIE_FALLBACK_URL = `https://app.omie.com.br/gestao/${OMIE_TENANT}/#COM`;

export async function GET(req, { params }) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const codigoPedido = Number(params.codigoPedido);
  if (!codigoPedido) {
    return NextResponse.redirect(OMIE_FALLBACK_URL, 302);
  }

  const appKey = process.env.OMIE_APP_KEY;
  const appSecret = process.env.OMIE_APP_SECRET;
  if (!appKey || !appSecret) {
    return NextResponse.redirect(OMIE_FALLBACK_URL, 302);
  }

  // Tenta multiplas variacoes do call e parametros — Omie tem documentacao
  // inconsistente entre versoes. Cada tentativa vai com diferentes nomes
  // de campo (nCodPed, codigo_pedido_omie, codigoPedido).
  const tentativas = [
    { url: "https://app.omie.com.br/api/v1/produtos/pedidocompra/", call: "ObterImpressaoPedCompra", param: { nCodPed: codigoPedido } },
    { url: "https://app.omie.com.br/api/v1/produtos/pedidocompra/", call: "ObterImpressaoPedCompra", param: { codigo_pedido_omie: codigoPedido } },
    { url: "https://app.omie.com.br/api/v1/produtos/pedidocompra/", call: "GerarPedCompraPDF", param: { nCodPed: codigoPedido } },
    { url: "https://app.omie.com.br/api/v1/produtos/pedidocompra/", call: "GerarPedidoCompraPDF", param: { nCodPed: codigoPedido } },
    { url: "https://app.omie.com.br/api/v1/produtos/pedidocompra/", call: "ImprimirPedCompra", param: { nCodPed: codigoPedido } },
    { url: "https://app.omie.com.br/api/v1/produtos/pedidocompra/", call: "ImpressaoPedCompra", param: { nCodPed: codigoPedido } },
    { url: "https://app.omie.com.br/api/v1/produtos/relatorios/", call: "GerarPedidoCompra", param: { nCodPed: codigoPedido } },
  ];

  const debug = req.nextUrl.searchParams.get("debug") === "1";
  const tentativasLog = [];

  for (const t of tentativas) {
    try {
      const res = await fetch(t.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          call: t.call,
          app_key: appKey,
          app_secret: appSecret,
          param: [t.param],
        }),
      });
      const data = await res.json().catch(() => ({}));
      tentativasLog.push({ call: t.call, paramKey: Object.keys(t.param)[0], status: res.status, dataKeys: Object.keys(data || {}) });

      if (res.ok) {
        const link = data.cLinkDownload || data.linkDownload || data.url || data.cUrl || data.link;
        if (link && typeof link === "string" && link.startsWith("http")) {
          return NextResponse.redirect(link, 302);
        }
      }
    } catch (e) {
      tentativasLog.push({ call: t.call, erro: e.message });
    }
  }

  // Nenhuma variante funcionou — modo debug retorna JSON, modo normal redireciona pro modulo Compras
  if (debug) {
    return NextResponse.json({
      error: "Nenhuma variante de call do Omie funcionou — fallback pra listagem.",
      fallback: OMIE_FALLBACK_URL,
      tentativas: tentativasLog,
    }, { status: 502 });
  }

  return NextResponse.redirect(OMIE_FALLBACK_URL, 302);
}
