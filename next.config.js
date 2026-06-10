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

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    // Disponíveis em qualquer componente via process.env
    NEXT_PUBLIC_BUILD_HASH: hash,
    NEXT_PUBLIC_BUILD_DATE: date,
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

module.exports = nextConfig;
