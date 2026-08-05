// POST /api/engenharia/listas/avisar-revisao — dispara o aviso de revisão de uma
// lista (LE/LPC) aos destinatários selecionados (usuários da Torg).
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/session";
import { sendEmail } from "@/lib/email";
import { cabecalhoEmail } from "@/lib/email-layout";
import { escapeHtml, textoParaHtml } from "@/lib/html";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  tipo: z.enum(["LE", "LPC"]),
  opNumero: z.string().min(1),
  obra: z.string().optional().nullable(),
  revisao: z.string().max(20).optional().nullable(), // ex.: "R01"
  ehRevisao: z.boolean().optional().default(false), // false = 1ª importação da lista
  arquivo: z.string().max(300).optional().nullable(), // nome do arquivo que subiu (ex.: T83F-LPC_R01.xlsx)
  mudancas: z.string().max(2000).optional().nullable(), // o que mudou (quem importou descreve)
  diff: z.object({ // diff automático (marcas)
    nIncluidas: z.number().optional(), nRemovidas: z.number().optional(), nAlteradas: z.number().optional(),
    incluidas: z.array(z.object({ marca: z.string() }).passthrough()).optional(),
    removidas: z.array(z.object({ marca: z.string() }).passthrough()).optional(),
    alteradas: z.array(z.object({ marca: z.string() }).passthrough()).optional(),
  }).optional().nullable(),
  destinatarios: z.array(z.string().email()).min(1).max(200),
});

const NOME = { LE: "Lista de Expedição (LE)", LPC: "Lista de Peças por Conjunto (LPC)" };

export async function POST(req) {
  let user;
  try { user = await requireRole(["ADMIN", "ENGENHARIA", "PCP", "PLANEJAMENTO", "PRODUCAO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const nomeLista = NOME[body.tipo];
  const ehRev = !!body.ehRevisao;
  const obraTxt = body.obra ? ` — ${escapeHtml(body.obra)}` : "";
  const revTxt = body.revisao ? ` (${escapeHtml(body.revisao)})` : "";
  const arqTxt = body.arquivo && body.arquivo.trim() ? body.arquivo.trim() : "";
  const arquivoBloco = arqTxt
    ? `<p style="margin:10px 0 0;font-size:13px;color:#334155;">Arquivo que subiu ao portal: <b>${escapeHtml(arqTxt)}</b></p>`
    : "";
  const mudancasBloco = body.mudancas && body.mudancas.trim()
    ? `<div style="margin-top:14px;padding:12px 14px;background:#fffbeb;border-left:4px solid #F4801F;border-radius:4px;">
         <p style="margin:0 0 4px;font-weight:700;font-size:13px;color:#92400e;">${ehRev ? "O que mudou nesta revisão" : "Observação"}</p>
         <p style="margin:0;white-space:pre-wrap;">${textoParaHtml(body.mudancas.trim())}</p>
       </div>`
    : "";

  const d = body.diff;
  const temDiff = !!(d && (d.nIncluidas || d.nRemovidas || d.nAlteradas));
  const listaMarcas = (arr, lim = 12) => {
    const ms = (arr || []).map((x) => escapeHtml(x.marca)).slice(0, lim);
    const extra = (arr || []).length - ms.length;
    return ms.join(", ") + (extra > 0 ? ` … (+${extra})` : "");
  };
  // Bloco "o que mudou": na revisão mostra incluídas/removidas/alteradas vs a versão
  // anterior; na 1ª importação (lista nova) mostra o resumo do que foi importado.
  const diffBloco = temDiff
    ? `<div style="margin-top:14px;padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;">
         <p style="margin:0 0 6px;font-weight:700;font-size:13px;">${ehRev ? "O que mudou vs a revisão anterior" : "O que veio nesta lista"}</p>
         <p style="margin:0 0 6px;font-size:13px;">${ehRev
            ? `<b>${d.nIncluidas || 0}</b> incluídas · <b>${d.nRemovidas || 0}</b> removidas · <b>${d.nAlteradas || 0}</b> alteradas`
            : `<b>${d.nIncluidas || 0}</b> marcas importadas`}</p>
         ${ehRev && d.nIncluidas ? `<p style="margin:2px 0;font-size:12px;color:#065f46;"><b>Incluídas:</b> ${listaMarcas(d.incluidas)}</p>` : ""}
         ${ehRev && d.nRemovidas ? `<p style="margin:2px 0;font-size:12px;color:#991b1b;"><b>Removidas:</b> ${listaMarcas(d.removidas)}</p>` : ""}
         ${ehRev && d.nAlteradas ? `<p style="margin:2px 0;font-size:12px;color:#92400e;"><b>Alteradas:</b> ${listaMarcas(d.alteradas)}</p>` : ""}
         <p style="margin:6px 0 0;font-size:11px;color:#94a3b8;">Detalhe completo na aba "Revisao" da planilha no servidor.</p>
       </div>`
    : "";

  let html, text, subject;
  if (ehRev) {
    // Revisão: e-mail ALARMANTE — faixa vermelha, "OBSOLETA", assunto com ⚠.
    html = `${cabecalhoEmail("&#9888; Revisão de lista — ATENÇÃO")}
      <div style="background:#DC2626;color:#ffffff;padding:16px 24px;text-align:center;">
        <p style="margin:0;font-size:19px;font-weight:800;letter-spacing:.3px;">&#9888; ${escapeHtml(nomeLista)} REVISADA${revTxt}</p>
        <p style="margin:7px 0 0;font-size:13px;opacity:.95;">A versão anterior está <b>OBSOLETA</b> — use somente a mais recente.</p>
      </div>
      <div style="padding:20px 24px;font-size:15px;color:#111;line-height:1.6;">
        <p>A <b>${escapeHtml(nomeLista)}</b> da <b>OP ${escapeHtml(body.opNumero)}</b>${obraTxt} foi <b style="color:#DC2626;">revisada${revTxt}</b>.</p>
        ${arquivoBloco}
        <div style="background:#FEF2F2;border:1px solid #FECACA;border-left:4px solid #DC2626;border-radius:6px;padding:12px 14px;margin:12px 0;color:#991B1B;font-weight:700;">&#9940; Pare de usar a revisão anterior e atualize o acompanhamento do seu setor com esta versão.</div>
        ${diffBloco}
        ${mudancasBloco}
        <p style="color:#64748b;font-size:12px;margin-top:18px;">Aviso disparado por ${escapeHtml(user.name || user.email || "")} pelo Workspace Torg (Portal de Engenharia).</p>
      </div>`;
    text = `*** ATENÇÃO — REVISÃO DE LISTA ***\n\nA ${nomeLista} da OP ${body.opNumero}${body.obra ? " — " + body.obra : ""} foi REVISADA${body.revisao ? " " + body.revisao : ""}.${arqTxt ? "\nArquivo que subiu ao portal: " + arqTxt : ""}\nA versão anterior está OBSOLETA — pare de usá-la e use a mais recente.${temDiff ? `\n\nMudanças: ${d.nIncluidas || 0} incluídas, ${d.nRemovidas || 0} removidas, ${d.nAlteradas || 0} alteradas.` : ""}${body.mudancas && body.mudancas.trim() ? "\n\nO que mudou:\n" + body.mudancas.trim() : ""}`;
    subject = `⚠ REVISÃO${body.revisao ? " " + body.revisao : ""} — ${nomeLista} da OP ${body.opNumero}`;
  } else {
    html = `${cabecalhoEmail("Lista importada — " + escapeHtml(nomeLista))}
      <div style="padding:20px 24px;font-size:14px;color:#111;line-height:1.6;">
        <p>Foi importada a <b>${escapeHtml(nomeLista)}${revTxt}</b> da <b>OP ${escapeHtml(body.opNumero)}</b>${obraTxt}.</p>
        <p>Por favor, considerem a <b>versão mais recente</b> da lista no acompanhamento do setor de vocês.</p>
        ${arquivoBloco}
        ${diffBloco}
        ${mudancasBloco}
        <p style="color:#64748b;font-size:12px;margin-top:18px;">Aviso disparado por ${escapeHtml(user.name || user.email || "")} pelo Workspace Torg (Portal de Engenharia).</p>
      </div>`;
    text = `Lista importada${body.revisao ? " " + body.revisao : ""} — ${nomeLista} da OP ${body.opNumero}${body.obra ? " — " + body.obra : ""}. Considerem a versão mais recente da lista.${arqTxt ? "\nArquivo que subiu ao portal: " + arqTxt : ""}${temDiff ? `\n${d.nIncluidas || 0} marcas importadas.` : ""}${body.mudancas && body.mudancas.trim() ? "\n\nObservação:\n" + body.mudancas.trim() : ""}`;
    subject = `[Torg] ${nomeLista} importada${body.revisao ? " " + body.revisao : ""} — OP ${body.opNumero}`;
  }

  const r = await sendEmail({ to: body.destinatarios, subject, html, text, replyTo: user.email || undefined });
  if (!r.ok) return NextResponse.json({ error: r.error || "Falha ao enviar o e-mail." }, { status: 502 });
  return NextResponse.json({ ok: true, enviados: body.destinatarios.length });
}
