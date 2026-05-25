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

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    // Disponíveis em qualquer componente via process.env
    NEXT_PUBLIC_BUILD_HASH: hash,
    NEXT_PUBLIC_BUILD_DATE: date,
  },
};

module.exports = nextConfig;
