// Perfis da OP que não têm material no CMR dela — e onde esse material está.
//
// Vitor (22/08/2026), sobre as peças sem R no data book da OP-067: "você não consegue preencher
// essa informação através dos certificados que te falei que estava na pasta?".
//
// ⚠ A PASTA NÃO PODE PREENCHER ISSO, e vale dizer por quê: os PDFs de lá são indexados POR R
// ("R 260787.pdf"). Eles dizem qual certificado pertence a um R — não qual peça consumiu qual R.
// Quem atribui R a peça é o consumo FIFO sobre o CMR (o registro de recebimento), não o arquivo.
//
// O que PREENCHE é o próprio CMR, quando o material existe mas está lançado em OUTRA OP — que é
// exatamente o caso do "material de estoque" que ele descreveu. Na OP-067, 391 das 520 marcas sem
// material são o mesmo perfil (TB 1.1/4" - DIN2440 LEVE), cuja entrada está sob a OP-079.
//
// ⚠ E O PORTAL PROPÕE, NÃO AFIRMA. Puxar sozinho o certificado de outra OP seria inventar
// rastreabilidade: ninguém além de quem separou o material sabe se aquele fardo é mesmo este.
// Por isso a rota devolve CANDIDATOS; quem confirma grava uma TrocaRastreabilidade (OP+perfil),
// que o motor de rastreio já respeita acima do FIFO — e aí um único registro resolve as 391.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { perfisSemMaterialDaOp } from "@/lib/rastreio-sem-material";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req) {
  try { await requireRole(["ADMIN", "QUALIDADE", "PCP", "PRODUCAO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const numero = new URL(req.url).searchParams.get("op");
  if (!numero) return NextResponse.json({ error: "Informe a OP." }, { status: 400 });

  const r = await perfisSemMaterialDaOp(numero);
  if (!r) return NextResponse.json({ error: "OP não encontrada." }, { status: 404 });
  return NextResponse.json(r);
}
