import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";

const URL_RESUMO = "https://app.omie.com.br/api/v1/estoque/resumo/";
const URL_ESTOQUE = "https://app.omie.com.br/api/v1/estoque/consulta/";

export const runtime = "nodejs";
export const maxDuration = 15;

// GET /api/omie/preco-medio?codigo=XXXXX
// Busca CMC e ultimo preco de compra via ObterEstoqueProduto.
// Fallback pra ListarPosEstoque se a primeira falhar.
export async function GET(req) {
  try {
    await requireRole(["ADMIN", "COMPRAS"]);

    const { searchParams } = new URL(req.url);
    const codigo = searchParams.get("codigo");
    if (!codigo) {
      return NextResponse.json({ error: "Parametro 'codigo' obrigatorio" }, { status: 400 });
    }

    const appKey = process.env.OMIE_APP_KEY;
    const appSecret = process.env.OMIE_APP_SECRET;
    if (!appKey || !appSecret) {
      return NextResponse.json({ error: "Credenciais Omie nao configuradas" }, { status: 500 });
    }

    const d = new Date();
    const dataHoje = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

    // Tenta ObterEstoqueProduto primeiro (mais completo: CMC + ultimo preco)
    try {
      const resp = await fetch(URL_RESUMO, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          call: "ObterEstoqueProduto",
          app_key: appKey,
          app_secret: appSecret,
          param: [{ cCodigo: codigo, dDia: dataHoje }],
        }),
        signal: AbortSignal.timeout(8000),
      });
      const data = await resp.json();
      if (!data.faultstring) {
        return NextResponse.json({
          cmc: Number(data.nCMC || 0),
          precoUltCompra: Number(data.nPrecoUltComp || 0),
          dataUltCompra: data.dDtUltComp || null,
          saldo: Number(data.nFisico || data.nDisponivel || 0),
          descricao: data.cDescricao || "",
          unidade: data.cUnidade || "",
          codigo,
        });
      }
    } catch { /* fallback abaixo */ }

    // Fallback: ListarPosEstoque
    const resp2 = await fetch(URL_ESTOQUE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        call: "ListarPosEstoque",
        app_key: appKey,
        app_secret: appSecret,
        param: [{ nPagina: 1, nRegPorPagina: 10, dDataPosicao: dataHoje, cCodigo: codigo }],
      }),
      signal: AbortSignal.timeout(8000),
    });
    const data2 = await resp2.json();
    if (data2.faultstring) {
      return NextResponse.json({ error: data2.faultstring, cmc: null });
    }

    const produtos = data2.produtos || [];
    if (produtos.length === 0) {
      return NextResponse.json({ cmc: null, msg: "Produto nao encontrado no estoque Omie" });
    }

    const prod = produtos[0];
    return NextResponse.json({
      cmc: Number(prod.nCMC || 0),
      precoUltCompra: null,
      dataUltCompra: null,
      saldo: Number(prod.nSaldo || 0),
      descricao: prod.cDescricao || "",
      unidade: prod.cUnidade || "",
      codigo,
    });
  } catch (err) {
    console.error("preco-medio error:", err);
    return NextResponse.json({ error: err?.message || "Falha ao consultar preco", cmc: null });
  }
}
