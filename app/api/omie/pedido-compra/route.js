import { NextResponse } from "next/server";
import { criarPedidoOmie } from "@/lib/omie-pedido-compra";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request) {
  try {
    const body = await request.json();
    const result = await criarPedidoOmie(body);
    if (result.error) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("omie pedido-compra error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
