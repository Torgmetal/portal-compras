import {build} from 'esbuild';
import {createServer} from 'node:http';
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
const output=await mkdtemp(path.join(tmpdir(),'ifc-propostas-'));
await build({entryPoints:['scripts/ifc-propostas/app.js'],bundle:true,format:'esm',outfile:path.join(output,'app.js')});
const payload=gzipSync(await readFile('/private/tmp/op089-propostas.json'));
createServer(async(req,res)=>{try{
const p=new URL(req.url,'http://localhost').pathname;
if(p==='/modelo.json'){res.setHeader('Content-Type','application/json');res.setHeader('Content-Encoding','gzip');return res.end(payload);}
const file=p==='/'?'scripts/ifc-propostas/index.html':p==='/app.js'?path.join(output,'app.js'):null;
if(!file){res.writeHead(404);return res.end();}res.setHeader('Content-Type',p==='/'?'text/html':'text/javascript');res.end(await readFile(file));
}catch{res.writeHead(500);res.end('Falha na demonstração');}}).listen(3113,'127.0.0.1',()=>console.log('http://127.0.0.1:3113'));
