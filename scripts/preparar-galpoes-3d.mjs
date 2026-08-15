// Prepara o export 3D dos galpões para o portal do auditor.
// O Design exporta com um HUD (legenda de "Setores de produção" + nota técnica de planta
// baixa) que o Vitor NÃO quer dentro da cena — os setores já são descritos abaixo do modelo,
// no portal. Este script copia o export e injeta um CSS que esconde esse HUD, sem tocar no
// JS/3D. Reaplicar a cada novo export do Design.
//
// Uso:  node scripts/preparar-galpoes-3d.mjs [caminho-do-export]
//       (default: ~/Downloads/index.html)
import fs from "fs";
import os from "os";
import path from "path";

const src = process.argv[2] || path.join(os.homedir(), "Downloads", "index.html");
const dest = "public/estrutura-3d/galpoes.html";
const MARK = "torg-hud-oculto";
const STYLE =
  `  <style id="${MARK}">/* Torg: some com o HUD que não vai ao portal (legenda de setores + nota de planta baixa) */\n` +
  `  .overlay.legend, .note { display: none !important; }</style>\n`;

let html = fs.readFileSync(src, "utf8");
if (!html.includes("</head>")) { console.error("ERRO: não achei </head> no export."); process.exit(1); }
if (!html.includes(`id="${MARK}"`)) html = html.replace("</head>", STYLE + "</head>");
fs.writeFileSync(dest, html);
const kb = (html.length / 1024).toFixed(0);
console.log(`OK — ${src} → ${dest} (${kb}KB). HUD oculto: .overlay.legend + .note.`);
