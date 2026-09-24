import {readFile} from 'node:fs/promises';
import path from 'node:path';
export async function GET(){return new Response(await readFile(path.join(process.cwd(),'app/api/auth/previa-retorno-simples/preview.html'),'utf8'),{headers:{'Content-Type':'text/html; charset=utf-8'}})}
