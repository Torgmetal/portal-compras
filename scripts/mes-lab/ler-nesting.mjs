// LÊ UM NESTING DE VERDADE E DIZ O QUE ACHOU.
//
//   npx vite-node -c vitest.config.mjs scripts/mes-lab/ler-nesting.mjs -- <pasta-ou-arquivo>
//
// ⚠ Os arquivos de exemplo têm dado real de obra e NÃO entram no repositório (§12.7.6). O script
// recebe o caminho por argumento, como o `validar-tela.mjs` faz com as credenciais.
//
// A "engine" são duas dependências que o portal JÁ TEM: `pizzip` (os .zx/.zh/.yxy são ZIP) e
// `unpdf` (o relatório). Não existe biblioteca proprietária para instalar: os três formatos são
// ZIP+XML ou XML puro, e o PDF é PDF.

import { readdir, readFile, stat } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import PizZip from "pizzip";
import { extractText, getDocumentProxy } from "unpdf";
import { lerRelatorioTubesT, lerArquivoTubesT } from "@/lib/mes/nesting/tubest";
import { lerRelatorioLibellula, lerLxd, confereComRelatorio } from "@/lib/mes/nesting/libellula";
import { planoConciliado } from "@/lib/mes/nesting/conciliar";
import { obraDoArquivo } from "@/lib/mes/nesting/marca";

const alvo = process.argv[2];
if (!alvo) {
  console.error("Informe a pasta do nesting.");
  process.exit(1);
}

async function textoDoPdf(caminho) {
  const pdf = await getDocumentProxy(new Uint8Array(await readFile(caminho)));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

const doZip = async (caminho) => {
  const zip = new PizZip(await readFile(caminho));
  return (nome) => zip.file(nome)?.asText() ?? "";
};

async function arquivosDe(caminho) {
  const info = await stat(caminho);
  if (!info.isDirectory()) return [caminho];
  const dentro = await readdir(caminho, { withFileTypes: true });
  const listas = await Promise.all(dentro.map((d) => arquivosDe(join(caminho, d.name))));
  return listas.flat();
}

const ehTubesT = (e) => [".zx", ".zh", ".yxy"].includes(e);

async function main() {
  const todos = await arquivosDe(alvo);
  const pdfs = todos.filter((f) => extname(f).toLowerCase() === ".pdf");

  for (const pdf of pdfs) {
    const texto = await textoDoPdf(pdf);
    const ehLibellula = texto.includes("Informações sobre agrupamento");
    console.log(`\n${"═".repeat(78)}\n${basename(pdf)}   (obra pelo nome: ${obraDoArquivo(pdf) || "—"})`);

    if (ehLibellula) await contarLibellula(texto, todos);
    else await contarTubesT(texto, pdf, todos);
  }
}

async function contarLibellula(texto, todos) {
  const plano = lerRelatorioLibellula(texto);
  console.log(`  LIBELLULA · ${plano.material} ${plano.espessuraMm}mm · chapa ${plano.chapaMm?.join(" x ")}`);
  console.log(`  ${plano.itens.length} marcas · ${plano.pecas} peças · ${plano.piercings} piercings`);
  for (const i of plano.itens) console.log(`     ${String(i.qtd).padStart(3)} ×  ${i.marca}`);

  if (plano.falhas?.length) plano.falhas.forEach((f) => console.log(`  ⚠ ${f}`));

  for (const lxd of todos.filter((f) => extname(f).toLowerCase() === ".lxd")) {
    const g = lerLxd(await readFile(lxd, "utf8"));
    const avisos = confereComRelatorio(g, plano);
    const bate = avisos.length ? `✘ ${avisos.join(" ")}` : "✔ bate com o relatório";
    console.log(`  ${basename(lxd)}: corte ${g.corte} + furos ${g.furos} = ${g.piercings} piercings — ${bate}`);
    console.log(`     gravação vetorizada: ${g.gravacao} polilinhas (é por isso que não há nome de peça no arquivo)`);
  }
}

async function contarTubesT(texto, pdf, todos) {
  const relatorio = lerRelatorioTubesT(texto);
  const pasta = pdf.slice(0, pdf.lastIndexOf("/"));
  const maquina = todos.filter((f) => f.startsWith(pasta) && ehTubesT(extname(f).toLowerCase()));
  const lidos = [];
  // ⚠ O `.yxy` é o plano inteiro; os `.zx`/`.zh` são as barras. Dizer a espécie é o que impede a
  // conciliação de achar que os dois disputam a mesma barra.
  for (const f of maquina) {
    const origem = extname(f).toLowerCase() === ".yxy" ? "plano" : "barra";
    lidos.push({ ...lerArquivoTubesT(await doZip(f)), origem });
  }

  console.log(`  TUBEST · ${relatorio.secao}`);
  console.log(`  ${relatorio.tipos.length} marcas · ${relatorio.barras.length} barras · programa ${lidos[0]?.programa || "—"}`);

  const plano = planoConciliado(relatorio, lidos);
  for (const b of plano.barras) {
    const nomeadas = b.cortes.filter((c) => c.marca).length;
    console.log(`\n  ── Nest ${b.indice}: ${b.pecas} peças · sobra ${b.sobraMm}mm · ${b.aproveitamento}%`);
    console.log(`     ordem de corte (${nomeadas}/${b.cortes.length} nomeadas):`);
    b.cortes.forEach((c, i) => {
      const como = c.gravada ? "gravada" : c.marca ? "deduzida do relatório" : "SEM NOME";
      console.log(`       ${String(i + 1).padStart(2)}. ${(c.marca || "—").padEnd(14)} ${como}`);
    });
    if (b.divergencias.length) b.divergencias.forEach((d) => console.log(`     ⚠ ${d}`));
    else console.log("     ✔ arquivo e relatório batem peça a peça");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
