// Cadeia de assinaturas do Data Book — papéis, rótulos e e-mails.
// Ordem sequencial: 1 Elaborador → 2 Inspetor → 3 Resp. Técnico → 4 Cliente.
import { sendEmail } from "@/lib/email";

export const RT_NOME = "Guilherme A. Corte Campos";

export const PAPEIS = [
  { ordem: 1, papel: "ELABORADOR", label: "Elaborador" },
  { ordem: 2, papel: "INSPETOR", label: "Inspetor responsável" },
  { ordem: 3, papel: "RESP_TECNICO", label: "Responsável Técnico (aprovação)" },
  { ordem: 4, papel: "CLIENTE", label: "Cliente (aceite)" },
];
export const PAPEL_LABEL = Object.fromEntries(PAPEIS.map((p) => [p.papel, p.label]));

export const fmtOPdb = (n) => (n ? `OP-${String(n).padStart(3, "0")}` : "—");

export function baseUrlDe(req) {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (process.env.NEXTAUTH_URL && process.env.NEXTAUTH_URL.startsWith("http")) return process.env.NEXTAUTH_URL;
  return host ? `https://${host}` : "";
}

function molde(titulo, corpoHtml) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#002945">
    <div style="background:#0D1F3C;padding:22px 24px;border-radius:8px 8px 0 0">
      <div style="color:#fff;font-size:20px;font-weight:bold;letter-spacing:.5px">TORG METAL</div>
          <div style="height:4px;background:#F4801F;"></div>
      <div style="color:#9ec0e0;font-size:12px;margin-top:2px">${titulo}</div>
    </div>
    <div style="border:1px solid #e3e6ea;border-top:none;border-radius:0 0 8px 8px;padding:24px">${corpoHtml}</div>
  </div>`;
}
const botao = (link, texto) => `<p style="text-align:center;margin:18px 0 22px"><a href="${link}" style="background:#006eab;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:bold;display:inline-block">${texto}</a></p>`;
const fallback = (link) => `<p style="font-size:12px;color:#576d7e;line-height:1.5;margin:0;border-top:1px solid #eee;padding-top:14px">Se o botão não funcionar, copie e cole no navegador:<br><span style="color:#006eab;word-break:break-all">${link}</span></p>`;

/** E-mail pedindo a assinatura de uma etapa. */
export async function enviarEmailEtapa({ email, papel, nomeDest, op, obra, link }) {
  if (!email) return false;
  const label = PAPEL_LABEL[papel] || "Assinatura";
  const ehCliente = papel === "CLIENTE";
  const corpo = `
    <p style="font-size:15px;margin:0 0 12px">${nomeDest ? `Olá, ${nomeDest}.` : "Olá."}</p>
    <p style="font-size:14px;line-height:1.6;margin:0 0 16px">
      O Data Book da Qualidade ${obra ? `da obra <strong>${obra}</strong> ` : ""}(<strong>${op}</strong>) está aguardando ${ehCliente ? "seu aceite" : `sua assinatura como <strong>${label}</strong>`}.
    </p>
    <p style="font-size:14px;line-height:1.6;margin:0 0 6px">Abra o link, confira o dossiê e ${ehCliente ? "confirme o recebimento e o aceite da obra" : "assine digitalmente informando seu nome completo"}.</p>
    ${botao(link, ehCliente ? "Abrir e dar aceite" : "Abrir e assinar")}
    ${fallback(link)}`;
  await sendEmail({
    to: email,
    subject: `Data Book ${op}${obra ? " — " + obra : ""} — ${ehCliente ? "para seu aceite" : "assinatura: " + label}`,
    html: molde("Data Book da Qualidade", corpo),
    text: `Data Book ${op}${obra ? " — " + obra : ""}. ${ehCliente ? "Aceite" : "Assinatura (" + label + ")"}: ${link}`,
  });
  return true;
}

/** E-mail final ao cliente com o link de download do data book concluído/assinado. */
export async function enviarEmailDownloadCliente({ email, op, obra, link }) {
  if (!email) return false;
  const corpo = `
    <p style="font-size:15px;margin:0 0 12px">Aceite registrado — obrigado!</p>
    <p style="font-size:14px;line-height:1.6;margin:0 0 16px">
      O Data Book da Qualidade ${obra ? `da obra <strong>${obra}</strong> ` : ""}(<strong>${op}</strong>) está concluído, com todas as assinaturas. Use o link abaixo para baixar o documento final quando precisar.
    </p>
    ${botao(link, "Baixar o Data Book")}
    ${fallback(link)}`;
  await sendEmail({
    to: email,
    subject: `Data Book ${op}${obra ? " — " + obra : ""} — concluído (download)`,
    html: molde("Data Book da Qualidade — concluído", corpo),
    text: `Data Book ${op}${obra ? " — " + obra : ""} concluído. Download: ${link}`,
  });
  return true;
}
