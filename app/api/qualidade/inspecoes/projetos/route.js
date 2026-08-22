// GET — os PDFs de projeto da OP, para escolher já na ABERTURA do relatório.
//
// Vitor (22/08/2026), olhando a tela de criar com "Conjunto / Peças avulsas": "não trouxe os
// projetos de montagem".
//
// Ele está certo, e o furo é conceitual: na pré-montagem não se escolhe PEÇA, se escolhe PROJETO.
// A lista de peças vem da LPC (marcas do Tekla) e o diagrama de montagem não está lá — ele é o
// desenho do arranjo, não de uma peça. Escolher peça naquela tela nunca traria o diagrama.
//
// As raízes são as mesmas da §02 do data book, que já sabem achar as duas arrumações de pasta que
// convivem na Torg (molde novo e "2.5.5 Cliente (ENC ###)").
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { PERFIS_CAMPO } from "@/lib/qualidade-campo";
import { resolverPastasDaSecao, listarPasta } from "@/lib/databook-pastas";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Varre a pasta e as subpastas atrás de PDF. Fundo raso: projeto não fica a cinco níveis. */
async function pdfsDaPasta(driveId, path, nivel = 0, achados = []) {
  if (nivel > 2 || achados.length >= 400) return achados;
  const c = await listarPasta(driveId, path).catch(() => null);
  if (!c) return achados;
  for (const a of c.arquivos || []) {
    if (/\.pdf$/i.test(a.nome)) achados.push({ nome: a.nome.replace(/\.pdf$/i, ""), caminho: a.path });
  }
  for (const p of c.pastas || []) {
    if (/obsolet/i.test(p.nome)) continue;
    await pdfsDaPasta(driveId, p.path, nivel + 1, achados);
  }
  return achados;
}

export async function GET(req) {
  try { await requireRole(PERFIS_CAMPO); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const url = new URL(req.url);
  const opNumero = String(url.searchParams.get("opNumero") || "").trim();
  const familia = url.searchParams.get("familia") === "conjunto" ? "conjunto" : "montagem";
  if (!opNumero) return NextResponse.json({ error: "OP obrigatória" }, { status: 400 });

  const { driveId, fontes, erros } = await resolverPastasDaSecao("02", opNumero);
  if (!driveId || !fontes.length) {
    return NextResponse.json({ projetos: [], erro: erros?.[0] || "Pasta de projetos não encontrada." });
  }

  const rx = familia === "conjunto" ? /conjunto/i : /montagem/i;
  const raizes = fontes.filter((f) => rx.test(f.label));
  if (!raizes.length) return NextResponse.json({ projetos: [], erro: `Nenhuma pasta de ${familia} nesta OP.` });

  const achados = [];
  for (const r of raizes) await pdfsDaPasta(driveId, r.path, 0, achados);

  // ⚠ o mesmo desenho aparece nas duas arrumações (molde novo e pasta do cliente). Dedup pelo
  // NOME: o inspetor não deve escolher entre duas linhas idênticas sem saber a diferença.
  const vistos = new Set();
  const projetos = achados.filter((p) => {
    const k = p.nome.toUpperCase();
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  }).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));

  return NextResponse.json({ projetos, total: projetos.length });
}
