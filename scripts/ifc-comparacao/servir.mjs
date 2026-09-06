import {build} from 'esbuild';
import {createServer} from 'node:http';
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {criarFixture} from '../ifc-qualidade/fixture.mjs';
const out=await mkdtemp(path.join(tmpdir(),'ifc-comparacao-'));
await build({entryPoints:['scripts/ifc-comparacao/preview.jsx'],bundle:true,outfile:path.join(out,'app.js'),jsx:'automatic',alias:{'@':process.cwd()},define:{'process.env.NODE_ENV':'"development"'}});
const antes=criarFixture();
// Uma alteração de nome e uma de identificador (inclusão/remoção), sem inventar obra real.
const depois=antes.replace("'Peca'","'Peca alterada'").replace("'0000000000000000000005'","'9999999999999999999999'");
let escolhidos=[];
const arquivos=[{id:'a',nome:'atual.ifc',pasta:'2. Engenharia/2.5 Projetos',tamanho:1000},{id:'b',nome:'anterior.ifc',pasta:'2. Engenharia/2.5 Projetos/Obsoleto',tamanho:1000}];
createServer(async(req,res)=>{const u=new URL(req.url,'http://localhost');
try{
if(u.pathname==='/api/portal/engenharia-docs'){
 res.setHeader('Content-Type','application/json');
 if(req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;const j=JSON.parse(body);escolhidos=j.docs.map(d=>({...d,comparacaoIfc:d.comparacaoIfc?{...d.comparacaoIfc,anterior:d.comparacaoIfc.anterior?arquivos.find(a=>a.id===d.comparacaoIfc.anterior.id):null}:undefined}));return res.end(JSON.stringify({ok:true,escolhidos:escolhidos.length}));}
 return res.end(JSON.stringify({selecionados:escolhidos,arquivos:u.searchParams.get('caminho')==='antigas'?[arquivos[1]]:[arquivos[0]],pastas:[{nome:'Revisões anteriores',caminho:'antigas'}],caminho:u.searchParams.get('caminho')||'',raizes:[],foraDoPadrao:[]}));
}
if(u.pathname==='/op89.ifc')return res.end(await readFile('/private/tmp/op089-modelo.ifc'));
if(u.pathname==='/anterior.ifc')return res.end(antes);
if(u.pathname==='/atual.ifc')return res.end(depois);
if(u.pathname==='/wasm/web-ifc.wasm'){res.setHeader('Content-Type','application/wasm');return res.end(await readFile('node_modules/web-ifc/web-ifc.wasm'));}
if(u.pathname==='/app.js'){res.setHeader('Content-Type','text/javascript');return res.end(await readFile(path.join(out,'app.js')));}
if(u.pathname!=='/'){res.writeHead(404);return res.end();}
res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Comparação IFC · teste</title><style>body{font:14px system-ui;background:#f5f7fa;color:#163349;margin:20px}main{max-width:1200px;margin:auto}button,select,input{padding:8px;margin:4px}button{cursor:pointer}canvas{display:block;max-width:100%}section{background:white;padding:16px}nav{margin-bottom:16px}.max-h-60,.max-h-64{max-height:240px;overflow:auto}.text-xs{font-size:12px}.block{display:block}.w-full{width:100%}</style><div id="root"></div><script src="/app.js"></script></html>');
}catch(e){res.writeHead(500);res.end(e.message);}}).listen(3114,'127.0.0.1',()=>console.log('http://127.0.0.1:3114'));
