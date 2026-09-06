// Execução explícita com BLOB_READ_WRITE_TOKEN. Mantém checkpoints por arquivo e não altera portais.
import {readFile,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {put} from '@vercel/blob';
const root=process.cwd(),out=path.join(root,'output/banco-midias');
const fotos=JSON.parse(await readFile(path.join(out,'fotos-tratadas.json'),'utf8'));
const videos=process.argv.includes('--somente-fotos')?[]:JSON.parse(await readFile(path.join(out,'videos-tratados.json'),'utf8'));
let cache={};try{cache=JSON.parse(await readFile(path.join(out,'uploads.json'),'utf8'));}catch{}
const nomes=['Passarela metálica','Escada e guarda-corpos','Estrutura industrial azul e amarela','Cobertura metálica em montagem','Içamento de cobertura','Estrutura de cobertura ao entardecer','Instalação industrial vertical','Estrutura industrial e tubulações','Instalação industrial · vista lateral','Instalação industrial · vista aérea 1','Instalação industrial · vista aérea 2','Instalação industrial · vista aérea 3','Estrutura metálica urbana','Cobertura metálica · vista superior','Estrutura em montagem · vista geral 1','Estrutura em montagem · vista geral 2','Estrutura em montagem · vista geral 3','Estrutura em montagem · vista lateral','Plataforma industrial','Passarela sobre água · vista aérea','Passarela sobre água · vista lateral','Içamento de treliça metálica','Complexo industrial · vista aérea 1','Silos e estruturas de apoio','Estruturas entre silos · vista 1','Complexo industrial · vista aérea 2','Complexo industrial · vista geral','Estruturas entre silos · vista 2','Complexo industrial · vista aérea 3','Complexo industrial · vista aérea 4','Estruturas e equipamentos industriais','Estrutura junto aos silos','Montagem de estrutura industrial','Estrutura de galpão','Içamento ao pôr do sol','Estrutura urbana · vista aérea 1','Estrutura urbana · vista aérea 2','Estrutura urbana · vista aérea 3','Instalação industrial à noite','Guindaste junto ao silo','Ligação de estruturas junto ao silo'];
const nomesVideo=['Passarela metálica · resolução original menor','Passarela metálica','Instalação industrial · movimento vertical','Instalação industrial · vista lateral','Estrutura industrial e tubulações','Içamento em obra industrial','Montagem de pilares','Içamento de estrutura entre silos','Montagem junto ao silo','Içamento de treliça junto ao silo','Estrutura industrial · aproximação','Içamento de conjunto metálico'];
async function subir(rel){
 if(cache[rel])return cache[rel];
 const data=await readFile(path.join(root,rel));const extension=path.extname(rel);const tipo=extension==='.mp4'?'video/mp4':extension==='.webp'?'image/webp':'image/jpeg';
 const b=await put(`acervo-torg/2026-09-06/${path.basename(path.dirname(rel))}/${path.basename(rel)}`,data,{access:'public',addRandomSuffix:false,contentType:tipo});
 cache[rel]=b.url;await writeFile(path.join(out,'uploads.json'),JSON.stringify(cache,null,2));return b.url;
}
const itens=[];
for(const [n,m] of [...fotos,...videos].entries()){
 const url=await subir(m.arquivo),miniatura=await subir(m.miniatura);
 const nome=m.tipo==='imagem'?nomes[n]:`${nomesVideo[Math.floor((n-fotos.length)/2)]} · ${m.versao==='corte'?'corte':'completo'}`;
 itens.push({id:m.id,url,miniatura,legenda:nome,tipo:m.tipo,versao:m.versao||null,duracao:m.duracao||null,largura:m.largura||null,altura:m.altura||null,tamanho:(await stat(path.join(root,m.arquivo))).size,origem:'ACERVO',categoria:m.tipo==='imagem'?'Estruturas e obras':'Montagem e instalações'});
 console.log(`${n+1}/${fotos.length+videos.length} ${m.id}`);
}
await writeFile(path.join(root,'lib/acervo-torg.json'),JSON.stringify(itens,null,2)+'\n');
console.log('Acervo salvo. Nenhum portal de cliente foi alterado.');
