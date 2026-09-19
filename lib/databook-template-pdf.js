import { rgb } from 'pdf-lib';
const A4 = [595.28, 841.89], M = 44, W = A4[0] - 2 * M;
const azul = rgb(0, 110/255, 171/255), escuro = rgb(0, 41/255, 69/255);
const cinza = rgb(87/255, 109/255, 126/255), linha = rgb(.84,.88,.91), laranja = rgb(244/255,128/255,31/255);

function linhas(texto, fonte, tamanho, largura) {
  const resultado = []; let atual = '';
  for (const palavra of String(texto || 'Não informado').split(/\s+/)) {
    const candidato = atual ? `${atual} ${palavra}` : palavra;
    if (fonte.widthOfTextAtSize(candidato,tamanho) <= largura) { atual=candidato; continue; }
    if (atual) resultado.push(atual);
    atual=palavra;
    while (fonte.widthOfTextAtSize(atual,tamanho)>largura) {
      let n=atual.length-1;
      while(n>1 && fonte.widthOfTextAtSize(atual.slice(0,n),tamanho)>largura) n--;
      resultado.push(atual.slice(0,n)); atual=atual.slice(n);
    }
  }
  if(atual) resultado.push(atual);
  return resultado;
}
function cabecalho(p,{font,bold,logo,op}) {
  if (logo) { const w=100,h=logo.height/logo.width*w;p.drawImage(logo,{x:M,y:A4[1]-38-h,width:w,height:h}); }
  p.drawText('QUALIDADE TORG',{x:360,y:799,size:9,font:bold,color:escuro});
  p.drawText(op,{x:360,y:783,size:8,font,color:cinza});
  p.drawLine({start:{x:M,y:744},end:{x:M+W,y:744},thickness:.6,color:linha});
}

/** Capa branca aprovada. As referências são identificações, não prova de vínculo de anexos. */
export function desenharCapaTorg(pdf,{font,bold,logo,book,codigo,revisao,dataEmissao,emitido,referencias=[],subtitulo='Documentos de Engenharia e Fabricação'}) {
  let p=pdf.addPage(A4);
  const op=`OP-${String(book.opNumero).padStart(3,'0')}`;
  cabecalho(p,{font,bold,logo,op});
  p.drawText('DOSSIÊ DE FABRICAÇÃO',{x:M,y:698,size:10,font:bold,color:laranja});
  p.drawText('Data book',{x:M,y:645,size:40,font:bold,color:escuro});
  p.drawText(subtitulo,{x:M,y:612,size:15,font,color:cinza});
  p.drawLine({start:{x:M,y:587},end:{x:M+52,y:587},thickness:2.5,color:laranja});
  const refs=referencias.filter(r=>r.codigo).map(r=>`${r.rotulo || ''} ${r.codigo}`.trim());
  const extensas = refs.some(r => linhas(r,bold,19,W/2-15).length > 3);
  let y=552;
  if(refs.length && !extensas) {
    p.drawText('IDENTIFICAÇÕES DA OBRA',{x:M,y,size:8,font:bold,color:azul}); y-=32;
    // Duas colunas, sem sinal de soma. A lista completa vai à folha seguinte se extensa.
    let maxLinhas=1;
    refs.slice(0,2).forEach((r,i)=>{
      const ls=linhas(r,bold,19,W/2-15); maxLinhas=Math.max(maxLinhas,ls.length);
      ls.forEach((l,j)=>p.drawText(l,{x:M+i*(W/2),y:y-j*23,size:19,font:bold,color:escuro}));
    });
    // Referências excepcionalmente longas usam a lista integral nas folhas seguintes.
    y-=maxLinhas*23+24;
  }
  const nova=()=>{p=pdf.addPage(A4);cabecalho(p,{font,bold,logo,op});y=705;};
  const campo=(rotulo,valor)=>{
    const ls=linhas(valor,font,12,W);
    if(y<145+Math.min(ls.length,12)*17) nova();
    p.drawText(rotulo,{x:M,y,size:8,font:bold,color:cinza}); y-=21;
    for(const l of ls) {if(y<120)nova();p.drawText(l,{x:M,y,size:12,font,color:escuro});y-=17;}
    y-=12;p.drawLine({start:{x:M,y},end:{x:M+W,y},thickness:.5,color:linha});y-=27;
  };
  campo('OP TORG',op);campo('OBRA',book.obra);campo('CLIENTE',book.cliente);
  // Metadados ficam no rodapé da primeira folha; não competem com nomes longos.
  const primeira=pdf.getPages()[0];
  primeira.drawLine({start:{x:M,y:94},end:{x:M+W,y:94},thickness:.6,color:linha});
  [['CÓDIGO',codigo],['REVISÃO',revisao],['EMISSÃO',dataEmissao],['STATUS',emitido?'EMITIDO':'RASCUNHO']].forEach(([r,v],i)=>{
    const x=M+i*W/4;primeira.drawText(r,{x,y:77,size:7,font:bold,color:cinza});
    linhas(v,font,9,W/4-10).forEach((l,j)=>primeira.drawText(l,{x,y:60-j*12,size:9,font,color:escuro}));
  });
  if(refs.length>2 || extensas) {nova();campo('REFERÊNCIAS DO CLIENTE',refs.join(' · '));}
  return p;
}

export function desenharDivisoriaTorg(p,{font,bold,logo,op,identificacao,titulo,norma}) {
  cabecalho(p,{font,bold,logo,op});
  p.drawText(identificacao,{x:M,y:670,size:11,font:bold,color:azul});
  let y=623;
  for(const l of linhas(titulo,bold,25,W)){p.drawText(l,{x:M,y,size:25,font:bold,color:escuro});y-=33;}
  p.drawLine({start:{x:M,y:y-7},end:{x:M+52,y:y-7},thickness:2.5,color:laranja});
  if(norma)for(const l of linhas(norma,font,11,W)){y-=30;p.drawText(l,{x:M,y,size:11,font,color:cinza});}
}
