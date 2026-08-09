// GET /api/rh/treinamentos/certificados — cruza os certificados dos Prontuários (SharePoint)
// com os funcionários e agrupa por NR. A aba de Treinamentos usa isso: ao clicar num
// treinamento, mostra quem fez aquela NR e a data do certificado. Acesso ADMIN/RH.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { escanearCertificados } from "@/lib/prontuario-certificados";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const primeiroUltimo = (s) => { const p = norm(s).split(" ").filter(Boolean); return p.length >= 2 ? `${p[0]} ${p[p.length - 1]}` : norm(s); };

export async function GET() {
  try { await requireRole(["ADMIN", "RH"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const [certs, funcs] = await Promise.all([
    escanearCertificados(),
    prisma.funcionario.findMany({ select: { nome: true, cargo: { select: { nome: true } }, setor: { select: { nome: true } } } }),
  ]);

  // índice de funcionários por nome normalizado (+ fallback primeiro/último)
  const porNome = new Map(), porPU = new Map();
  for (const f of funcs) { porNome.set(norm(f.nome), f); porPU.set(primeiroUltimo(f.nome), f); }
  const casar = (colab) => porNome.get(norm(colab)) || porPU.get(primeiroUltimo(colab)) || null;

  // dedup por (pessoa|nr): mantém o certificado MAIS RECENTE
  const map = new Map();
  let semNr = 0;
  for (const c of certs) {
    if (!c.nr || !c.colab) { if (!c.nr) semNr++; continue; }
    const f = casar(c.colab);
    const nome = f?.nome || c.colab;
    const key = `${c.nr}|${norm(nome)}`;
    const prev = map.get(key);
    if (!prev || (c.data && (!prev.data || c.data > prev.data))) {
      map.set(key, { nr: c.nr, nome, cargo: f?.cargo?.nome || null, setor: f?.setor?.nome || null, empresa: c.empresa, vinculado: !!f, data: c.data, arquivo: c.arquivo });
    }
  }

  const porNr = {};
  for (const v of map.values()) {
    (porNr[v.nr] = porNr[v.nr] || []).push(v);
  }
  for (const nr of Object.keys(porNr)) {
    porNr[nr].sort((a, b) => (b.data || "").localeCompare(a.data || "") || a.nome.localeCompare(b.nome));
  }

  return NextResponse.json({
    porNr,
    totalCertificados: certs.length,
    pessoasComCertificado: new Set([...map.values()].map((v) => norm(v.nome))).size,
    semNrReconhecida: semNr,
    geradoEm: new Date().toISOString(),
  });
}
