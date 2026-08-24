// GET ?q= — busca transportadoras (clientes do Omie) por nome, p/ o frete da remessa.
// Devolve nCodTransp (código no Omie), nome, cnpj, uf. Só ADMIN/FISCAL/FINANCEIRO.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { omieCall } from "@/lib/omie-call";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ROLES = ["ADMIN", "FISCAL", "FINANCEIRO"];
const URL_CLIENTES = "https://app.omie.com.br/api/v1/geral/clientes/";

export async function GET(req) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ transportadoras: [] });

  try {
    // razao_social faz busca PARCIAL (contains) no Omie.
    const res = await omieCall(URL_CLIENTES, "ListarClientes", {
      pagina: 1, registros_por_pagina: 20, apenas_importado_api: "N", clientesFiltro: { razao_social: q },
    });
    const transportadoras = (res.clientes_cadastro || [])
      .filter((c) => c.inativo !== "S")
      .map((c) => ({
        nCodTransp: c.codigo_cliente_omie,
        nome: c.nome_fantasia || c.razao_social,
        razaoSocial: c.razao_social,
        cnpj: c.cnpj_cpf || null,
        uf: c.estado || null,
      }));
    return NextResponse.json({ transportadoras });
  } catch (e) {
    return NextResponse.json({ error: e.message, transportadoras: [] }, { status: 502 });
  }
}
