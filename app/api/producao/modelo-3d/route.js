// GET /api/producao/modelo-3d?opId=…            → os modelos IFC que a obra tem
// GET /api/producao/modelo-3d?opId=…&rel=…      → baixa um deles (o visualizador consome daqui)
//
// Vitor (03/09/2026): "quero que vejam dentro do portal deles, não quero que seja através de um
// link — eles precisam ver na tela do nosso portal".
//
// ⚠⚠ O ARQUIVO É NOSSO, E É POR ISSO QUE ISTO EXISTE. O IFC mora no SharePoint da Torg, não dentro
// do Trimble. Servindo daqui, o cliente abre o modelo da obra dele pelo token que já recebe — sem
// conta, sem cadastro, sem dividir licença de ninguém. E, mais importante: o clique fica no nosso
// código, que é o que permite ligar a peça ao R, ao croqui e ao andamento na fábrica.
//
// ⚠ SÓ LEITURA, e só dentro da pasta da OP: o `rel` é validado contra o inventário, nunca
// concatenado cru num caminho. Sem isso, um `rel` com "../" viraria uma porta para o SharePoint
// inteiro (mesmo cuidado de lib/blob-url).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { inventarioEngenharia } from "@/lib/pasta-engenharia";
import { downloadFileByPath, acharPastaOp } from "@/lib/sharepoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROLES = ["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO", "ENGENHARIA", "QUALIDADE", "COMERCIAL"];

// ⚠ Teto de tamanho. Um modelo de obra inteira pode passar de 100MB, e a função serverless não
// carrega isso — nem o navegador do usuário abriria. Medido na OP-089: 5,6 MB para 572 conjuntos,
// então 60MB dá muita folga; acima disso o certo é a Engenharia publicar o modelo por frente.
const TETO_MB = 60;

export async function GET(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { searchParams } = new URL(req.url);
  const opId = searchParams.get("opId");
  const rel = searchParams.get("rel");
  if (!opId) return NextResponse.json({ error: "Informe a OP." }, { status: 400 });

  const op = await prisma.oP.findUnique({ where: { id: opId }, select: { id: true, numero: true, cliente: true, obra: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada." }, { status: 404 });

  const inv = await inventarioEngenharia(op.numero);
  if (!inv.achou) return NextResponse.json({ error: inv.erro || "Pasta da OP não encontrada." }, { status: 404 });

  const modelos = (inv.ifc || []).map((a) => ({
    nome: a.nome,
    // ⚠ o `rel` é a chave que o cliente devolve para pedir o arquivo — e é ele que validamos.
    rel: a.rel ? `${a.rel}/${a.nome}` : a.nome,
    kb: a.kb ?? null, em: a.em || null,
    grande: (a.kb || 0) > TETO_MB * 1024,
  })).sort((a, b) => String(b.em).localeCompare(String(a.em)));

  // ── listagem ──
  if (!rel) {
    // ⚠⚠ O ANDAMENTO DE CADA MARCA VAI JUNTO, e é o que dá sentido ao 3D. Ver a obra em cinza não
    // diz nada a ninguém; o que o setor quer enxergar é o que já passou e o que falta. Vem na
    // listagem, e não a cada clique, porque o visualizador pinta a cena INTEIRA de uma vez — pedir
    // marca por marca seriam centenas de idas ao servidor para montar uma tela.
    //
    // ⚠ O ESTÁGIO REAL VEM DO APONTAMENTO, não do `status` gravado: aquele só anda até o corte
    // (ver lib/peca-setor-real). Peça sem apontamento é "a fazer", e é a maioria.
    const pecas = await prisma.pecaConjunto.findMany({
      where: { opId, naLPC: true },
      select: { marca: true, status: true },
    });
    const apont = await prisma.$queryRaw`
      SELECT "opSka", "setor", max("dataInicio") ult
      FROM "MesApontamento" WHERE "opId" = ${opId} GROUP BY 1, 2`;
    // opSka contém a marca ("T89C21-P3" traz "T89C21"): casa pelo maior nome que estiver dentro
    const marcas = [...new Set(pecas.map((p) => p.marca).filter(Boolean))]
      .sort((a, b) => b.length - a.length);
    const setorDe = new Map();
    for (const a of apont) {
      const ska = String(a.opSka || "").toUpperCase();
      const m = marcas.find((x) => ska.includes(x.toUpperCase()));
      if (!m) continue;
      const g = setorDe.get(m);
      const d = a.ult ? a.ult.toISOString() : "";
      if (!g || d > g.ult) setorDe.set(m, { setor: a.setor, ult: d });
    }
    const estados = {};
    for (const m of marcas) {
      const s = String(setorDe.get(m)?.setor || "").toLowerCase();
      estados[m] = !s ? "parado"
        : /pintura|acabamento/.test(s) ? "pronta"
        : "andando";
    }
    return NextResponse.json({
      op: { id: op.id, numero: op.numero, cliente: op.cliente, obra: op.obra },
      modelos, tetoMb: TETO_MB, estados,
      resumo: {
        marcas: marcas.length,
        prontas: Object.values(estados).filter((x) => x === "pronta").length,
        andando: Object.values(estados).filter((x) => x === "andando").length,
      },
    });
  }

  // ── download de um modelo ──
  // ⚠⚠ SÓ O QUE ESTÁ NO INVENTÁRIO. Comparação exata contra a lista que acabamos de montar: o
  // caminho nunca vem do que o navegador mandou, vem daqui.
  const escolhido = modelos.find((m) => m.rel === rel);
  if (!escolhido) return NextResponse.json({ error: "Modelo não encontrado nesta OP." }, { status: 404 });
  if (escolhido.grande) {
    return NextResponse.json({
      error: `O modelo tem ${(escolhido.kb / 1024).toFixed(0)} MB — acima do limite de ${TETO_MB} MB. Peça à Engenharia para publicar o modelo por frente.`,
    }, { status: 413 });
  }

  const base = await acharPastaOp(op.numero);
  if (!base) return NextResponse.json({ error: "Pasta da OP não encontrada." }, { status: 404 });
  const caminho = `${base}/2. Engenharia/2.5 Projetos/${escolhido.rel}`;

  let buf;
  try { buf = await downloadFileByPath({ driveId: process.env.SHAREPOINT_DRIVE_ID, fullPath: caminho }); }
  catch (e) { return NextResponse.json({ error: "Falha ao baixar o modelo: " + (e?.message || "erro") }, { status: 502 }); }

  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(buf.length),
      // ⚠ o IFC de uma revisão não muda: cachear no navegador evita baixar 5 MB a cada abertura da
      // tela. Uma revisão nova muda o nome do arquivo, então o cache não mascara atualização.
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename="${encodeURIComponent(escolhido.nome)}"`,
    },
  });
}
