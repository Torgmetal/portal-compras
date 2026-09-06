// Servidor isolado: não carrega Next, credenciais, banco ou integrações.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarFixture } from './fixture.mjs';
const raiz = fileURLToPath(new URL('../../', import.meta.url));
const arquivoLocal = process.env.IFC_ENSAIO_ARQUIVO;
const porta = Number(process.env.IFC_ENSAIO_PORTA || 3109);
const saida = await mkdtemp(path.join(tmpdir(), 'ifc-ensaio-'));
await build({ entryPoints: [path.join(raiz, 'scripts/ifc-qualidade/preview.jsx')], bundle: true,
  outdir: saida, splitting: true, format: 'esm', platform: 'browser', jsx: 'automatic',
  alias: { '@': raiz }, define: { 'process.env.NODE_ENV': '"development"', 'process.env.LOG_NIVEL': '"error"' },
});
const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Ensaio IFC</title>
<style>body{font:14px system-ui;margin:24px;background:#f5f7fa;color:#243343}main{max-width:1500px;margin:auto}h1{font-size:20px}button{cursor:pointer}canvas{display:block}.relative{position:relative}.absolute{position:absolute}.top-3{top:12px}.left-3{left:12px}.right-3{right:12px}.bottom-4{bottom:16px}.left-4{left:16px}.h-9{height:36px}.h-10{height:40px}.inset-0{inset:0}.place-items-center{place-items:center}.grid{display:grid}.bg-white{background:white}.pointer-events-none{pointer-events:none}.top-\\[68px\\]{top:68px}</style>
<div id="root"></div><script type="module" src="/preview.js"></script></html>`;
createServer(async (req, res) => {
  try {
    const nome = new URL(req.url, 'http://localhost').pathname;
    if (nome === '/') { res.setHeader('Content-Type','text/html'); return res.end(html); }
    if (nome === '/fixture.ifc') return res.end(criarFixture());
    if (nome === '/modelo-local.ifc' && arquivoLocal) return res.end(await readFile(arquivoLocal));
    const wasm = nome === '/wasm/web-ifc.wasm';
    const logo = nome === '/torg-logo.png';
    if (!wasm && !logo && !/^\/[\w.-]+\.js$/.test(nome)) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', wasm ? 'application/wasm' : logo ? 'image/png' : 'text/javascript');
    res.end(await readFile(wasm ? path.join(raiz,'node_modules/web-ifc/web-ifc.wasm') : logo ? path.join(raiz,'public/torg-logo.png') : path.join(saida,nome.slice(1))));
  } catch { res.writeHead(500); res.end('Falha ao ler recurso local'); }
}).listen(porta, '127.0.0.1', () => process.stdout.write(`Ensaio: http://127.0.0.1:${porta}\n`));
