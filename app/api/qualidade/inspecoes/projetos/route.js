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
  // ⚠⚠ "AMBOS" É O PADRÃO. Vitor (03/09/2026): "preciso que permita que eu possa criar um relatório
  // mesmo que eu não selecione se é um conjunto ou um diagrama de montagem". Antes o parâmetro só
  // aceitava um dos dois, e a tela obrigava escolher ANTES de ver a lista — quem não sabia de cabeça
  // em qual pasta o desenho vivia ficava travado num palpite. Agora as duas famílias entram juntas
  // por padrão, cada projeto marcado com a sua, e o filtro por família fica como refinamento
  // opcional, não como porta de entrada.
  const fam = String(url.searchParams.get("familia") || "").toLowerCase();
  const familias = fam === "conjunto" || fam === "montagem" ? [fam] : ["conjunto", "montagem"];
  if (!opNumero) return NextResponse.json({ error: "OP obrigatória" }, { status: 400 });

  const { driveId, fontes, erros } = await resolverPastasDaSecao("02", opNumero);
  if (!driveId || !fontes.length) {
    return NextResponse.json({ projetos: [], erro: erros?.[0] || "Pasta de projetos não encontrada." });
  }

  const projetos = [];
  const erroPorFamilia = [];
  for (const familia of familias) {
    const rx = familia === "conjunto" ? /conjunto/i : /montagem/i;
    const raizes = fontes.filter((f) => rx.test(f.label));
    if (!raizes.length) { erroPorFamilia.push(familia); continue; }

    const achados = [];
    for (const r of raizes) await pdfsDaPasta(driveId, r.path, 0, achados);

    // ⚠ o mesmo desenho aparece nas duas arrumações (molde novo e pasta do cliente). Dedup pelo
    // NOME: o inspetor não deve escolher entre duas linhas idênticas sem saber a diferença. O dedup
    // é DENTRO da família — conjunto e montagem são pastas diferentes, e um nome igual entre elas
    // não é a mesma coisa duas vezes.
    const vistos = new Set();
    for (const p of achados) {
      const k = p.nome.toUpperCase();
      if (vistos.has(k)) continue;
      vistos.add(k);
      projetos.push({ ...p, familia });
    }
  }
  projetos.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));

  if (!projetos.length) {
    return NextResponse.json({
      projetos: [],
      erro: erroPorFamilia.length === familias.length
        ? `Nenhuma pasta de ${familias.join(" ou ")} nesta OP.`
        : "Nenhum PDF encontrado nessas pastas desta OP.",
    });
  }
  return NextResponse.json({ projetos, total: projetos.length });
}
