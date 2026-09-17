// ─── A PLANILHA DA CONFERÊNCIA CHEGA SOZINHA NO PCP ──────────────────────────
//
// Matheus (17/09/2026): "quando o operador finalizar uma inspeção e clicar em Finalizar, o portal
// automaticamente envie um relatório em Excel para o e-mail pcp@torg.com.br — dessa forma ela vai
// usar essa relação para realizar romaneios e outros relatórios".
//
// ⚠⚠ O ANEXO É O MESMO ARQUIVO DO BOTÃO "EXCEL" DA TELA, gerado pelo mesmo `montarRelatorio`. Um
// segundo relatório "para o e-mail" seria duas versões da mesma conferência divergindo na primeira
// vez que alguém mudasse uma coluna — e quem recebe por e-mail não teria como saber qual das duas
// está certa.
//
// ⚠⚠ ENVIAR NUNCA PODE DERRUBAR O FINALIZAR. O operador está no pátio, no celular, com o caminhão
// esperando: se o Resend estiver fora do ar, a conferência TEM de encerrar assim mesmo. O erro vai
// para o log e para o AuditLog; o trabalho dele não volta atrás por causa de um e-mail.
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { cabecalhoEmail } from "@/lib/email-layout";
import { escapeHtml } from "@/lib/html";
import { saldosDaOP } from "@/lib/conferencia-peca";
import { montarRelatorio, nomeDoArquivo } from "@/lib/conferencia-relatorio";
import { fmtOP } from "@/lib/utils";
import { dataHoraBR } from "@/lib/data-br";
import { log } from "@/lib/log";

const registro = log("conferencia-email");

// ⚠ Destino em env com valor padrão: o endereço foi dado pelo Matheus e não muda toda semana, mas
// trocar quem recebe não pode exigir deploy. Vários destinos separados por vírgula.
const DESTINO = process.env.CONFERENCIA_PECA_EMAIL || "pcp@torg.com.br";

const kg = (n) => `${Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;

function corpoDoEmail(rel) {
  const r = rel.resumo;
  const op = fmtOP(rel.op.numero);
  const linha = (rotulo, valor) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#576D7E;font-size:13px;">${rotulo}</td>
     <td style="padding:4px 0;color:#002945;font-size:13px;font-weight:600;">${valor}</td></tr>`;
  return `${cabecalhoEmail("Conferência de peça finalizada", `${op} · ${escapeHtml(rel.op.cliente || rel.op.obra || "")}`)}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;font-family:Arial,sans-serif;">
      <tr><td style="padding:24px;background:#ffffff;">
        <p style="margin:0 0 16px;font-size:14px;color:#002945;line-height:1.6;">
          A planilha em anexo traz a relação de peças desta conferência — marca, descrição,
          quantidade, peso e as observações do operador — para montar o romaneio.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          ${linha("Conferida por", escapeHtml(rel.sessao.finalizadaPorNome || rel.sessao.iniciadaPorNome || "—"))}
          ${linha("Finalizada em", rel.sessao.finalizadaEm ? dataHoraBR(rel.sessao.finalizadaEm) : "—")}
          ${linha("Marcas", `${r.marcas}`)}
          ${linha("Peças conferidas", `${r.conferido} de ${r.previsto}${r.percentual != null ? ` (${r.percentual}%)` : ""}`)}
          ${linha("Peso conferido", kg(r.pesoConferidoKg))}
        </table>
        ${r.pendente ? `<p style="margin:16px 0 0;padding:12px;background:#FEF3C7;border-left:4px solid #F4801F;font-size:13px;color:#7C2D12;line-height:1.5;">
          <b>Atenção:</b> ${r.saldo} peça(s) não conferida(s) — ${r.naoConferidas} marca(s) sem nenhum lançamento e ${r.parciais} parcial(is).
          O romaneio montado a partir desta planilha não cobre a obra inteira.
        </p>` : ""}
      </td></tr>
    </table>`;
}

/**
 * Monta e envia a planilha da conferência ao PCP. Nunca lança.
 *
 * @param {{id:string, opId:string, opNumero:string}} sessao a conferência recém-finalizada
 * @returns {Promise<{enviado:boolean, motivo?:string}>}
 */
export async function enviarConferenciaAoPcp(sessao) {
  try {
    const saldos = await saldosDaOP(prisma, sessao.opId);
    // ⚠ Obra sem Lista de Expedição não tem relação de peças para enviar — e um e-mail com planilha
    // vazia treina o destinatário a ignorar os próximos.
    if (!saldos) return { enviado: false, motivo: "OP sem Lista de Expedição" };

    const lancamentos = await prisma.conferenciaPecaItem.findMany({
      where: { conferenciaId: sessao.id },
      orderBy: { criadoEm: "desc" },
      select: { id: true, marca: true, qte: true, observacao: true, criadoEm: true, criadoPorNome: true },
    });

    const rel = montarRelatorio({ sessao, op: saldos.op, marcas: saldos.marcas, lancamentos });
    const { gerarConferenciaExcel } = await import("@/lib/conferencia-peca-excel");
    const buf = await gerarConferenciaExcel(rel);
    const nome = nomeDoArquivo(rel, "xlsx");

    await sendEmail({
      to: DESTINO.split(",").map((e) => e.trim()).filter(Boolean),
      subject: `Conferência de peça finalizada — ${fmtOP(rel.op.numero)}${rel.op.cliente ? ` · ${rel.op.cliente}` : ""}`,
      html: corpoDoEmail(rel),
      attachments: [{ filename: nome, content: Buffer.from(buf).toString("base64") }],
    });
    return { enviado: true, arquivo: nome };
  } catch (e) {
    registro.erro("falha ao enviar a conferência ao PCP:", e?.message);
    return { enviado: false, motivo: e?.message || "falha ao enviar" };
  }
}
