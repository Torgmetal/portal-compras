const { execSync } = require("child_process");

// Captura hash e data do último commit no momento do build
function getGitInfo() {
  try {
    const hash = execSync("git rev-parse --short HEAD").toString().trim();
    const date = execSync("git log -1 --format=%cd --date=format:'%d/%m/%Y'")
      .toString()
      .trim()
      .replace(/'/g, "");
    return { hash, date };
  } catch {
    return { hash: "local", date: new Date().toLocaleDateString("pt-BR") };
  }
}

const { hash, date } = getGitInfo();

// Headers de segurança aplicados a todas as respostas.
// CSP aqui é enxuta e SEGURA de impor (não afeta carregamento de script/style):
//   - frame-ancestors 'none'  → anti-clickjacking (substitui X-Frame-Options)
//   - base-uri 'self'         → impede injeção de <base> (sequestro de URLs relativas)
//   - object-src 'none'       → bloqueia plugins/embeds (vetor de XSS)
// TODO futuro: CSP completa com script-src baseada em nonce para mitigar XSS
// inline — exige ajuste no app (nonce nos scripts), por isso não está aqui ainda.
const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
];

// Exceção só para o que PRECISA ser exibido em <iframe> dentro do próprio portal (mesma origem):
// a planta 3D dos galpões em /estrutura-3d e o PDF do documento na página de assinatura. Mantém
// toda a postura de segurança; só troca o anti-framing de 'none'/DENY para permitir a MESMA origem
// (cross-origin continua bloqueado, então clickjacking segue barrado).
//
// ⚠⚠ ERA POR ISSO QUE A PRÉ-VISUALIZAÇÃO APARECIA QUEBRADA. Vitor (27/08/2026): "na tela das pessoas
// que estão recebendo o documento para assinar a imagem da pré-visualização está quebrada". O PDF
// era gerado certo — o navegador é que recusava o iframe por causa do `frame-ancestors 'none'`
// desta lista. Vale para TODA página de assinatura: o Plano de Treinamentos e o Cronograma de
// Auditoria também mostravam o painel vazio, e ninguém tinha reclamado.
const FRAMEABLE_HEADERS = SECURITY_HEADERS.map((h) =>
  h.key === "X-Frame-Options" ? { key: h.key, value: "SAMEORIGIN" }
    : h.key === "Content-Security-Policy" ? { key: h.key, value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" }
      : h
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    // Disponíveis em qualquer componente via process.env
    NEXT_PUBLIC_BUILD_HASH: hash,
    NEXT_PUBLIC_BUILD_DATE: date,
  },
  async headers() {
    return [
      // A planta 3D é servida em /estrutura-3d e precisa poder ser embutida no portal.
      { source: "/estrutura-3d/:path*", headers: FRAMEABLE_HEADERS },
      // O documento a assinar é mostrado em <iframe> na própria página de assinatura.
      { source: "/api/assinar/:path*", headers: FRAMEABLE_HEADERS },
      { source: "/((?!estrutura-3d/|api/assinar/).*)", headers: SECURITY_HEADERS },
    ];
  },
};

module.exports = nextConfig;
