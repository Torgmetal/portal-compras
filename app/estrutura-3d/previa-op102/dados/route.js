import {readFile} from 'node:fs/promises';
export const dynamic='force-dynamic';
export async function GET(req){if(process.env.NODE_ENV!=='development')return new Response(null,{status:404});const malhas=new URL(req.url).searchParams.get('tipo')==='malhas';try{return new Response(await readFile(malhas?'/tmp/carga102/malhas.json':'/tmp/carga102/previa-visual.json'),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}catch{return Response.json({error:'Não foi possível carregar a prévia local.'},{status:503});}}
