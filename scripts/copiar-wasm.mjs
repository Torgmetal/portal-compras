// Copia o motor do visualizador de IFC (web-ifc) de node_modules para /public/wasm.
//
// ⚠⚠ POR QUE NO BUILD E NÃO NO GIT. O `web-ifc.wasm` tem 1,3 MB de binário. Commitar binário
// grande incha o repositório para sempre e, pior, congela a versão: subir o pacote e esquecer de
// trocar o .wasm daria um erro de incompatibilidade dificílimo de achar, porque o sintoma aparece
// só quando o navegador tenta abrir um modelo.
//
// ⚠ FALHA ALTO, DE PROPÓSITO. Se o arquivo não estiver onde se espera, o build PARA aqui com o
// motivo escrito. A alternativa — seguir em frente sem o .wasm — só apareceria em produção, para o
// cliente, como "both async and sync fetching of the wasm failed", que não diz nada a ninguém.
import fs from "node:fs";
import path from "node:path";

const ORIGEM = path.join(process.cwd(), "node_modules", "web-ifc", "web-ifc.wasm");
const DESTINO_DIR = path.join(process.cwd(), "public", "wasm");
const DESTINO = path.join(DESTINO_DIR, "web-ifc.wasm");

if (!fs.existsSync(ORIGEM)) {
  console.error(`[copiar-wasm] não achei ${ORIGEM}. O pacote web-ifc está instalado?`);
  process.exit(1);
}
fs.mkdirSync(DESTINO_DIR, { recursive: true });
fs.copyFileSync(ORIGEM, DESTINO);
const kb = Math.round(fs.statSync(DESTINO).size / 1024);
console.log(`[copiar-wasm] web-ifc.wasm → public/wasm (${kb} kb)`);
