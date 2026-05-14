// GET /api/cotacao/:id/preview-email — retorna pagina HTML pronta pra copiar
// e colar no Outlook/Gmail. Util quando Resend nao esta configurado.
//
// FLUXO: usuario abre a pagina -> clica em "Copiar email" gigante ->
// vai no Outlook -> Ctrl+V no corpo. O link sai clicavel.
//
// PROIBIDO mailto: porque mailto so transporta texto puro, destrui o
// hiperlink. Era a fonte do bug que o usuario reportou.
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

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Email pronto - ${escapeHtml(cot.fornecedorNome)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      background: #f0f4f8;
      margin: 0;
      padding: 24px 20px;
      color: #2d3748;
    }
    .container { max-width: 760px; margin: 0 auto; }
    .step {
      background: white;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      border: 1px solid #e2e8f0;
    }
    .step-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }
    .step-num {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: #1976d2;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 16px;
      flex-shrink: 0;
    }
    .step-title { font-size: 17px; font-weight: 700; color: #0a3a5c; margin: 0; }
    .step-sub { font-size: 13px; color: #718096; margin-top: 2px; }
    .meta { background: #edf2f7; border-radius: 8px; padding: 12px 16px; font-size: 13px; margin-bottom: 12px; }
    .meta strong { color: #4a5568; margin-right: 6px; min-width: 90px; display: inline-block; }
    .meta + .meta { margin-top: 0; }
    .meta button {
      float: right;
      background: none;
      border: 0;
      color: #1976d2;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
    }
    .meta button:hover { text-decoration: underline; }
    .btn-big {
      width: 100%;
      background: linear-gradient(135deg, #1976d2 0%, #1565c0 100%);
      color: white;
      border: 0;
      padding: 20px;
      border-radius: 10px;
      font-size: 18px;
      font-weight: 700;
      cursor: pointer;
      font-family: inherit;
      transition: transform 0.05s;
      box-shadow: 0 2px 8px rgba(25, 118, 210, 0.3);
    }
    .btn-big:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(25, 118, 210, 0.4); }
    .btn-big:active { transform: translateY(0); }
    .btn-big.copied { background: linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%); }
    #email-content {
      background: white;
      border: 2px dashed #cbd5e0;
      border-radius: 10px;
      padding: 28px;
      margin-top: 12px;
    }
    #email-content.selected { border-color: #1976d2; border-style: solid; }
    .toast {
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #2e7d32;
      color: white;
      padding: 14px 24px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      opacity: 0;
      transition: opacity 0.3s;
      pointer-events: none;
      z-index: 100;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    }
    .toast.show { opacity: 1; }
    .hint {
      font-size: 12px;
      color: #718096;
      margin-top: 12px;
      padding: 10px 14px;
      background: #fef9c3;
      border-left: 3px solid #facc15;
      border-radius: 6px;
    }
  </style>
</head>
<body>
  <div class="container">

    <!-- PASSO 1: Copiar -->
    <div class="step">
      <div class="step-header">
        <div class="step-num">1</div>
        <div>
          <p class="step-title">Copiar email</p>
          <p class="step-sub">Clique no botao gigante abaixo. O conteudo vai pro clipboard com o link <strong>ja formatado como hiperlink azul</strong>.</p>
        </div>
      </div>

      <div class="meta">
        <strong>Para:</strong>${escapeHtml(cot.fornecedorEmail || "")}
        <button onclick="copiarTexto(${JSON.stringify(cot.fornecedorEmail || "")})">copiar</button>
      </div>
      <div class="meta">
        <strong>Assunto:</strong>${escapeHtml(subject)}
        <button onclick="copiarTexto(${JSON.stringify(subject)})">copiar</button>
      </div>

      <button id="btn-copiar" class="btn-big" onclick="copiarEmailHtml()">
        Copiar email completo (com link clicavel)
      </button>

      <div class="hint">
        Importante: depois de copiar, NAO use a opcao "Texto sem Formatacao" no Outlook.
        Cole normal (Ctrl+V) na nova mensagem em modo HTML.
      </div>
    </div>

    <!-- PASSO 2: Colar -->
    <div class="step">
      <div class="step-header">
        <div class="step-num">2</div>
        <div>
          <p class="step-title">Abrir Outlook e colar</p>
          <p class="step-sub">No Outlook: Nova Mensagem &rarr; cole no corpo (Ctrl+V) &rarr; insira destinatario e assunto &rarr; Enviar.</p>
        </div>
      </div>
      <div class="hint" style="background: #dbeafe; border-left-color: #3b82f6;">
        Se o Outlook mostrar o link em preto (sem cor) ao colar, ele esta em modo "Texto sem Formatacao".
        Va em <strong>Format Text &rarr; HTML</strong> e cole de novo.
      </div>
    </div>

    <!-- Conteudo do email (sera copiado) -->
    <div class="step">
      <div class="step-header">
        <div class="step-num" style="background:#9ca3af">i</div>
        <div>
          <p class="step-title" style="font-size:14px">Conteudo que sera copiado</p>
          <p class="step-sub">Preview do email. NAO precisa selecionar manualmente — use o botao acima.</p>
        </div>
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
        <p style="color: #4a5568; font-size: 13px;">
          Atenciosamente,<br>
          <strong>Equipe de Compras - Torg Metal</strong>
        </p>
      </div>
    </div>

  </div>

  <div id="toast" class="toast">Copiado</div>

  <script>
    function mostrarToast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 2500);
    }

    async function copiarTexto(txt) {
      try {
        await navigator.clipboard.writeText(txt);
        mostrarToast("Copiado!");
      } catch {
        mostrarToast("Selecione manualmente e copie");
      }
    }

    async function copiarEmailHtml() {
      const el = document.getElementById('email-content');
      const html = el.innerHTML;
      const text = el.innerText;
      const btn = document.getElementById('btn-copiar');

      try {
        const blob = new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        });
        await navigator.clipboard.write([blob]);

        // Feedback visual
        el.classList.add('selected');
        btn.classList.add('copied');
        btn.textContent = '✓ Copiado! Agora cole no Outlook (Ctrl+V)';
        mostrarToast("Email copiado com formatacao. Cole no Outlook!");

        // Volta o botao depois
        setTimeout(() => {
          btn.classList.remove('copied');
          btn.textContent = 'Copiar email completo (com link clicavel)';
          el.classList.remove('selected');
        }, 5000);
      } catch (e) {
        console.error(e);
        // Fallback: usa Selection + execCommand (mais compativel mas pode perder formatacao)
        try {
          const sel = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(el);
          sel.removeAllRanges();
          sel.addRange(range);
          const ok = document.execCommand("copy");
          if (ok) {
            mostrarToast("Copiado (fallback). Cole no Outlook em modo HTML.");
            el.classList.add('selected');
          } else {
            mostrarToast("Selecione tudo no quadro abaixo (Ctrl+A) e copie (Ctrl+C)");
          }
        } catch {
          mostrarToast("Selecione o quadro abaixo e copie manualmente");
        }
      }
    }

    // Atalho: ao clicar dentro do email-content, ja seleciona TUDO pra facilitar copia manual
    document.getElementById('email-content').addEventListener('click', function(e) {
      // So seleciona se nao clicou em link (pra permitir clicar nos links de teste)
      if (e.target.tagName === 'A') return;
      const range = document.createRange();
      range.selectNodeContents(this);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
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
