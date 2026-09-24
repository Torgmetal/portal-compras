import {readFile} from 'node:fs/promises';
export async function GET(){return new Response(await readFile(process.cwd()+'/previews/pcp/painel.html','utf8'),{headers:{'Content-Type':'text/html; charset=utf-8'}})}
