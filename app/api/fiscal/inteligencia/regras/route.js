import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAcesso } from "@/lib/session";
import { catalogoDeRegras, regraPorId } from "@/lib/fiscal/catalogo-regras";
import { decisoesVigentes, decidir } from "@/lib/fiscal/validacao-regras";
import { SITUACAO, situacaoDaRegra } from "@/lib/fiscal/politica-regras";

// A VALIDAÇÃO DAS REGRAS — o que a contabilidade conferiu, e o que ainda não.
//
// ⚠⚠ AS REGRAS NÃO SÃO EDITÁVEIS AQUI, E ISSO É DELIBERADO. O briefing pede um "motor de regras em
// tabela"; o que existe é a VALIDAÇÃO em tabela. Regra em banco sai do alcance do PR, do lint, do
// teste e da revisão — uma linha errada passaria a mudar em silêncio o que o portal manda emitir,
// que é o oposto de *"NÃO INVENTE REGRAS"*. Autoria de regra pela contabilidade fica fora desta
// entrega, e está escrito na tela.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const negado = (e) => NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });

const esquema = z.object({
  regraId: z.string().min(1).max(200),
  estado: z.enum([SITUACAO.VALIDADA, SITUACAO.CONTESTADA]),
  // ⚠⚠ A IMPRESSÃO VEM DA TELA, não é recalculada aqui: ela atesta a versão que a pessoa LEU.
  // Recalcular no servidor carimbaria a versão do instante do clique, que pode já ser outra.
  impressao: z.string().length(16),
  fonte: z.string().trim().max(200).optional().nullable(),
  ressalva: z.string().trim().max(1000).optional().nullable(),
}).superRefine((v, ctx) => {
  // ⚠ Contestar sem dizer por quê deixa o próximo sem nada para resolver — e a contestação BLOQUEIA
  // a ficha, então ela precisa ser explicável.
  if (v.estado === SITUACAO.CONTESTADA && !v.ressalva) {
    ctx.addIssue({ code: "custom", message: "Escreva o que está errado — a contestação bloqueia a orientação." });
  }
});

export async function GET() {
  try {
    await requireAcesso({ modulos: ["FISCAL", "FINANCEIRO"] });
  } catch (e) { return negado(e); }

  const catalogo = catalogoDeRegras();
  const decisoes = await decisoesVigentes();
  return NextResponse.json({
    success: true,
    // ⚠ A indisponibilidade viaja: a tela precisa poder dizer "não verifiquei", e não "está tudo certo".
    disponivel: decisoes !== null,
    regras: catalogo.map((r) => ({
      id: r.id, tipo: r.tipo, titulo: r.titulo, contexto: r.contexto,
      impressao: r.impressao, conteudo: r.conteudo,
      situacao: situacaoDaRegra(r, decisoes?.get(r.id), { disponivel: decisoes !== null }),
    })),
  });
}

export async function POST(req) {
  let user;
  try {
    user = await requireAcesso({ modulos: ["FISCAL", "FINANCEIRO"] });
  } catch (e) { return negado(e); }

  let body;
  try {
    body = esquema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ success: false, error: e.issues?.[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const regra = regraPorId(body.regraId);
  if (!regra) return NextResponse.json({ success: false, error: "Regra desconhecida." }, { status: 404 });
  // ⚠⚠ A TELA ESTAVA VENDO OUTRA VERSÃO. Conferir um texto e gravar o atestado sobre outro é
  // exatamente o que a impressão digital existe para impedir — 409, não "grava assim mesmo".
  if (regra.impressao !== body.impressao) {
    return NextResponse.json({ success: false, error: "O conteúdo desta regra mudou enquanto você conferia — recarregue e leia a versão atual." }, { status: 409 });
  }

  try {
    return NextResponse.json({ success: true, decisao: await decidir(body, user) });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 400 });
  }
}
