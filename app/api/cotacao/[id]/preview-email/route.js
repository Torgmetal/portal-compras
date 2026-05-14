// GET /api/cotacao/:id/preview-email — retorna pagina HTML pronta pra copiar
// e colar no Outlook/Gmail. Util quando Resend nao esta configurado: o usuario
// abre essa pagina em nova aba, da Ctrl+A + Ctrl+C, cola no Outlook em modo HTML
// e o link sai como hiperlink clicavel.
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "COMPRAS"]);
  } catch {
    return new Response("Sem permissao.", { status: 403 });
  }

  const cot = await prisma.cotacao.findUnique({
    where: { id: params.id },
    include: {
      rm: { select: { numero: true, descricao: true } },
      itens: { include: { rmItem: { select: { rmId: true } } } },
    },
  });
  if (!cot) return new Response("Cotacao nao encontrada.", { status: 404 });

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://workspace-torg.vercel.app";
  const link = `${baseUrl}/fornecedores/c/${cot.token}`;

  // RMs envolvidas (multi-RM consolidada)
  const rmIds = Array.from(new Set(cot.itens.map((i) => i.rmItem?.rmId).filter(Boolean)));
  let numerosRMs = [cot.rm?.numero].filter(Boolean);
  if (rmIds.length > 1) {
    const rms = await prisma.rM.findMany({
      where: { id: { in: rmIds } },
      select: { numero: true },
      orderBy: { numero: "asc" },
    });
    numerosRMs = rms.map((r) => r.numero);
  }
  const rotuloRMs = numerosRMs.length === 1 ? `RM ${numerosRMs[0]}` : `RMs ${numerosRMs.join(", ")}`;
  const totalItens = cot.itens.length;
  const prazoTxt = cot.prazoResposta
    ? new Date(cot.prazoResposta).toLocaleDateString("pt-BR")
    : null;
  const subject = `Solicitacao de Cotacao - ${rotuloRMs} (Torg Metal)`;
  const mailtoBody = encodeURIComponent(
    `Ola ${cot.fornecedorNome},\n\nSolicitamos cotacao para o material da ${rotuloRMs}.\nAcesse o link abaixo (unico e privado) pra enviar sua proposta:\n\n${link}\n\nItens: ${totalItens}${prazoTxt ? `\nPrazo: ${prazoTxt}` : ""}${cot.observacao ? `\nObservacao: ${cot.observacao}` : ""}\n\nAtenciosamente,\nEquipe de Compras - Torg Metal`
  );
  const mailtoSubject = encodeURIComponent(subject);
  const mailtoHref = `mailto:${cot.fornecedorEmail}?subject=${mailtoSubject}&body=${mailtoBody}`;

  // Pagina contem 2 partes:
  // 1) Header com instrucoes + botoes (NAO copiado pro email)
  // 2) "Cartao" com o email pronto pra copiar (contem o link HTML clicavel)
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Email pronto — ${escapeHtml(cot.fornecedorNome)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; background: #f7fafc; margin: 0; padding: 20px; color: #2d3748; }
    .header { max-width: 700px; margin: 0 auto 16px; background: #fff8e6; border: 1px solid #f6e05e; border-radius: 10px; padding: 16px 20px; }
    .header h1 { color: #744210; margin: 0 0 6px; font-size: 16px; }
    .header p { margin: 0; font-size: 13px; color: #744210; line-height: 1.5; }
    .header ol { margin: 8px 0 0 18px; padding: 0; font-size: 13px; color: #744210; }
    .actions { max-width: 700px; margin: 0 auto 16px; display: flex; gap: 8px; flex-wrap: wrap; }
    .actions button, .actions a { font-family: inherit; cursor: pointer; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 600; border: 0; display: inline-flex; align-items: center; gap: 6px; }
    .btn-copy { background: #1976d2; color: white; }
    .btn-copy:hover { background: #1565c0; }
    .btn-outlook { background: white; color: #1976d2; border: 1px solid #90caf9; }
    .subject-box { max-width: 700px; margin: 0 auto 8px; background: #edf2f7; border-radius: 6px; padding: 10px 14px; font-size: 13px; }
    .subject-box strong { color: #4a5568; margin-right: 6px; }
    #email-content { max-width: 700px; margin: 0 auto; background: white; border-radius: 10px; padding: 32px; border: 1px solid #e2e8f0; }
    .toast { position: fixed; top: 20px; right: 20px; background: #38a169; color: white; padding: 12px 20px; border-radius: 6px; font-size: 14px; opacity: 0; transition: opacity 0.3s; pointer-events: none; }
    .toast.show { opacity: 1; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📋 Email pronto pra copiar</h1>
    <p>Esse template tem o link como hiperlink HTML (clicavel). Como usar:</p>
    <ol>
      <li>Clica em <strong>"Copiar email completo"</strong> abaixo</li>
      <li>Abre o Outlook e cria nova mensagem para <code>${escapeHtml(cot.fornecedorEmail || "")}</code></li>
      <li>Cola no corpo (Ctrl+V). O link sai como hiperlink clicavel</li>
      <li>Coloca o assunto: <em>${escapeHtml(subject)}</em></li>
      <li>Envia</li>
    </ol>
  </div>

  <div class="actions">
    <button class="btn-copy" onclick="copiarEmail()">📋 Copiar email completo (HTML)</button>
    <button class="btn-copy" style="background:#388e3c" onclick="copiarLink()">🔗 Copiar so o link</button>
    <a class="btn-outlook" href="${mailtoHref}">📧 Abrir no Outlook (mailto)</a>
  </div>

  <div class="subject-box">
    <strong>Assunto:</strong>${escapeHtml(subject)}
  </div>
  <div class="subject-box">
    <strong>Para:</strong>${escapeHtml(cot.fornecedorEmail || "")}
  </div>

  <div id="email-content">
    <p>Ola <strong>${escapeHtml(cot.fornecedorNome)}</strong>,</p>
    <p>Estamos solicitando sua cotacao para o material listado na <strong>${escapeHtml(rotuloRMs)}</strong>.</p>
    <p>Acesse o link abaixo pra ver os itens e enviar sua proposta. O link e <strong>unico e privado</strong>, nao precisa de login:</p>
    <p style="text-align: center; margin: 28px 0;">
      <a href="${link}" style="background: #1976d2; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block;">
        Abrir cotacao
      </a>
    </p>
    <p style="color: #718096; font-size: 13px;">
      Ou copie e cole esse endereco no navegador:<br>
      <a href="${link}" style="color: #1976d2; word-break: break-all;">${link}</a>
    </p>
    <table style="width: 100%; border-collapse: collapse; margin: 24px 0; font-size: 14px;">
      <tr><td style="padding: 6px 0; color: #718096;">Total de itens</td><td style="padding: 6px 0;"><strong>${totalItens}</strong></td></tr>
      ${prazoTxt ? `<tr><td style="padding: 6px 0; color: #718096;">Prazo de resposta</td><td style="padding: 6px 0;"><strong>${prazoTxt}</strong></td></tr>` : ""}
      ${cot.observacao ? `<tr><td style="padding: 6px 0; color: #718096; vertical-align: top;">Observacao</td><td style="padding: 6px 0;">${escapeHtml(cot.observacao)}</td></tr>` : ""}
    </table>
    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;">
    <p style="color: #a0aec0; font-size: 13px;">
      Atenciosamente,<br>
      <strong>Equipe de Compras — Torg Metal</strong>
    </p>
  </div>

  <div id="toast" class="toast">Copiado!</div>

  <script>
    function mostrarToast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 2000);
    }

    async function copiarEmail() {
      const el = document.getElementById('email-content');
      const html = el.innerHTML;
      const text = el.innerText;
      try {
        const blob = new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        });
        await navigator.clipboard.write([blob]);
        mostrarToast("✓ Email copiado (HTML). Cole no Outlook!");
      } catch (e) {
        // Fallback: copia so o texto via Selection
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(range);
        try {
          document.execCommand("copy");
          mostrarToast("✓ Conteudo copiado");
        } catch {
          mostrarToast("Selecione tudo manualmente (Ctrl+A) e copie");
        }
      }
    }

    async function copiarLink() {
      try {
        await navigator.clipboard.writeText(${JSON.stringify(link)});
        mostrarToast("✓ Link copiado");
      } catch {
        mostrarToast("Use Ctrl+C apos selecionar o link");
      }
    }
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
