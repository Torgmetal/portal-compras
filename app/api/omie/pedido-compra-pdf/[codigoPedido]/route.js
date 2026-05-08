import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";

// GET — chama a API do Omie pra gerar o link temporario do PDF do pedido
// de compra, e redireciona o usuario direto pra ele.
//
// Endpoint Omie: /api/v1/produtos/pedidocompra/ com call='ObterImpressaoPedCompra'
// Retorna { cLinkDownload: "https://app.omie.com.br/resources/temp/.../pedido_de_compra_X.pdf?..." }
//
// O link gerado e temporario (token de sessao expira em alguns minutos),
// por isso geramos a cada clique.
export async function GET(_req, { params }) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const codigoPedido = Number(params.codigoPedido);
  if (!codigoPedido) {
    return NextResponse.json({ error: "codigoPedido invalido" }, { status: 400 });
  }

  const appKey = process.env.OMIE_APP_KEY;
  const appSecret = process.env.OMIE_APP_SECRET;
  if (!appKey || !appSecret) {
    return NextResponse.json(
      { error: "Credenciais Omie nao configuradas (OMIE_APP_KEY/OMIE_APP_SECRET)." },
      { status: 500 }
    );
  }

  // Tenta multiplas variacoes do nome do call e dos parametros — Omie tem
  // documentacao inconsistente entre versoes
  const tentativas = [
    {
      url: "https://app.omie.com.br/api/v1/produtos/pedidocompra/",
      call: "ObterImpressaoPedCompra",
      param: { nCodPed: codigoPedido },
    },
    {
      url: "https://app.omie.com.br/api/v1/produtos/pedidocompra/",
      call: "GerarPedCompraPDF",
      param: { nCodPed: codigoPedido },
    },
    {
      url: "https://app.omie.com.br/api/v1/produtos/pedidocompra/",
      call: "ImpressaoPedCompra",
      param: { nCodPed: codigoPedido },
    },
  ];

  let ultimaResposta = null;
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
      const data = await res.json();
      ultimaResposta = { call: t.call, status: res.status, data };

      if (res.ok && (data.cLinkDownload || data.linkDownload || data.url || data.cUrl)) {
        const link = data.cLinkDownload || data.linkDownload || data.url || data.cUrl;
        // Redireciona o navegador direto pro PDF
        return NextResponse.redirect(link, 302);
      }
      // Se nao tem link mas tem dados, tenta proximo call
    } catch (e) {
      ultimaResposta = { call: t.call, erro: e.message };
    }
  }

  return NextResponse.json(
    {
      error: "Nao foi possivel gerar o PDF do pedido. Tente abrir manualmente no Omie.",
      detalhes: ultimaResposta,
    },
    { status: 502 }
  );
}
