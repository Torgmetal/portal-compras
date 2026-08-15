// Prepara o export 3D dos galpões para o portal do auditor.
// O Design exporta com um HUD (legenda "Setores de produção" + nota técnica de planta baixa)
// que o Vitor NÃO quer dentro da cena — os setores já são descritos abaixo do modelo, no portal.
//
// IMPORTANTE: o arquivo é um "bundler" que RECONSTRÓI o DOM a partir de um template escapado
// (script __bundler/template). Por isso não adianta injetar <style> no <head> externo — ele é
// descartado na reconstrução. A forma que sobrevive é marcar os próprios elementos do template
// com style="display:none!important" INLINE (o template guarda o HTML escapado como class=\"x\").
//
// Uso:  node scripts/preparar-galpoes-3d.mjs [caminho-do-export]   (default: ~/Downloads/index.html)
// Reaplicar a cada novo export do Design.
import fs from "fs";
import os from "os";
import path from "path";

const src = process.argv[2] || path.join(os.homedir(), "Downloads", "index.html");
const dest = "public/estrutura-3d/galpoes.html";

// Inline escapado igual ao template (aspas viram \"). Inline + !important vence regras de classe.
const HIDE = ' style=\\"display:none!important\\"';
function esconder(html, classe) {
  const alvo = 'class=\\"' + classe + '\\"';
  const feito = alvo + HIDE;
  if (html.includes(feito)) return { html, n: 0 };      // idempotente
  const n = html.split(alvo).length - 1;
  return { html: html.split(alvo).join(feito), n };
}

let html = fs.readFileSync(src, "utf8");
const r1 = esconder(html, "overlay legend"); html = r1.html; // legenda de setores
const r2 = esconder(html, "note"); html = r2.html;          // nota técnica de planta baixa
fs.writeFileSync(dest, html);
console.log(`OK — ${src} → ${dest} (${(html.length / 1024).toFixed(0)}KB).`);
console.log(`   ocultados: legenda(${r1.n}) + nota(${r2.n}) via style inline no template.`);
if (r1.n === 0 && r2.n === 0) console.log("   ⚠ nada casou — confira se as classes mudaram no export.");
