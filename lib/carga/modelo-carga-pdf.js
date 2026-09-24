// Modelo de carga em A4 paisagem. Roda no navegador: as imagens não são enviadas ao servidor.
// Vistas gerais, referência de embalagem, cartões dos volumes, camadas e lista de separação.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { faseDaMarca } from "./classificar";
import { resumoDaRegra } from "./ajustes";
import { desenharModeloEmbalagem } from "./modelo-embalagem-desenho";
import { noAssoalho, textoTravamento } from "./travamento";

const PW = 841.89, PH = 595.28, M = 30, W = PW - 2 * M;
const cor = (h) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const NAVY = cor("#002945"), BLUE = cor("#006EAB"), ORANGE = cor("#F4801F"), GRAY = cor("#576D7E"), LINE = cor("#DCE4EB"), LIGHT = cor("#F3F6F9"), WHITE = rgb(1, 1, 1);
const WINANSI_EXTRA = new Set([0x20ac, 0x2026, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2122]);
const san = (s) => String(s ?? "").split("").map((ch) => { const c = ch.codePointAt(0); return c <= 0xff || WINANSI_EXTRA.has(c) ? ch : "?"; }).join("");
const TIPO = (u) => u.tipo === "CAIXA" ? "caixa" : u.embalagem?.tipo === "engradado" ? "engradado" : u.gc ? "gc" : u.grade ? (u.degrau ? "degrau" : "grade") : u.tipo === "PACOTE" ? "feixe" : "solta";
const ROT = { caixa: "Caixa de madeira", engradado: "Engradado", gc: "Pacote de guarda-corpo", grade: "Pacote de grade de piso", degrau: "Pacote de degraus", feixe: "Feixe cintado", solta: "Peça solta" };
const COR = { caixa: cor("#A5793D"), engradado: cor("#936737"), gc: cor("#28764F"), grade: cor("#247A74"), degrau: cor("#627E30"), feixe: BLUE, solta: GRAY };
const kg = (v) => Math.round(v || 0).toLocaleString("pt-BR"), metros = (v) => ((v || 0) / 1000).toLocaleString("pt-BR", {maximumFractionDigits:2}), cm = (v) => Math.round(v / 10);

// Quebra inclusive identificadores longos; nunca deixa uma palavra atravessar a coluna.
function linhas(str, f, size, largura) {
  const out = []; let atual = "";
  for (const palavra of san(str).split(/\s+/)) {
    const candidato = atual ? `${atual} ${palavra}` : palavra;
    if (f.widthOfTextAtSize(candidato, size) <= largura) { atual = candidato; continue; }
    if (atual) { out.push(atual); atual = ""; }
    for (const ch of palavra) {
      if (atual && f.widthOfTextAtSize(atual + ch, size) > largura) { out.push(atual); atual = ""; }
      atual += ch;
    }
  }
  if (atual) out.push(atual);
  return out;
}

/** Gera o PDF para UMA carga; logo e fotos entram como bytes/data URL, sem dependências de Node. */
export async function gerarModeloCargaPDF({ op, previo, carga, indice = 0, total = 1, perfilNome = "", prefixo = "", imagens = {}, estimadas = [], ajustes = {}, logo: logoBytes = null }) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Modelo de carga - OP ${op.numero} - Romaneio ${previo.numero}`); pdf.setAuthor("Torg Metal");
  const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo = null; if (logoBytes) { try { logo = await pdf.embedPng(logoBytes); } catch { /* logo opcional */ } }
  const veic = carga.veiculo, itens = carga.itens || [], byId = new Map(itens.map((u) => [u.id, u]));
  const ordem = [...itens].sort((a, b) => a.volume - b.volume), camadas = [...new Set(itens.map((u) => u.camada || 0))].sort((a, b) => a - b);
  const nPecas = itens.reduce((n, u) => n + (u.membros?.length || 0), 0), mad = carga.madeira?.pecas || {};
  const marcasDaCarga = new Set(itens.flatMap((u) => (u.membros || []).map((m) => m.marca)));
  const aplicados = Object.entries(ajustes || {}).filter(([m]) => marcasDaCarga.has(m));
  let page, y;
  const text = (v, x, yy, size = 10, f = font, color = NAVY) => page.drawText(san(v), { x, y: yy, size, font: f, color });
  const rect = (x, yy, w, h, color = LIGHT, borderColor) => page.drawRectangle({ x, y: yy, width: w, height: h, color, ...(borderColor ? { borderColor, borderWidth: 0.6 } : {}) });
  const texto = (v, x, yy, largura, size = 10, f = font, color = NAVY, max = Infinity) => {
    let ls = linhas(v, f, size, largura);
    if (ls.length > max) { ls = ls.slice(0, max); ls[ls.length - 1] = ls[ls.length - 1].replace(/.{3}$/, "..."); }
    ls.forEach((l, i) => text(l, x, yy - i * (size + 3), size, f, color)); return ls.length * (size + 3);
  };
  const novaPagina = (secao) => {
    page = pdf.addPage([PW, PH]); rect(0, PH - 62, PW, 62, NAVY); rect(0, PH - 64, PW, 2, ORANGE);
    if (logo) { const s = Math.min(82 / logo.width, 31 / logo.height); page.drawImage(logo, { x: M, y: PH - 45, width: logo.width * s, height: logo.height * s }); }
    else text("TORG METAL", M, PH - 33, 11, bold, WHITE);
    text("MODELO DE CARGA", M + 98, PH - 26, 15, bold, WHITE);
    text(`OP ${op.numero} · Romaneio prévio ${String(previo.numero).padStart(2, "0")} · Carga ${indice + 1} de ${total}`, M + 98, PH - 44, 9, font, WHITE);
    texto([op.cliente, op.obra].filter(Boolean).join(" · "), PW - M - 240, PH - 25, 240, 9, font, WHITE, 2);
    text(secao, M, PH - 91, 16, bold, NAVY); y = PH - 108;
  };
  const imagem = async (d, x, yy, w, h) => {
    rect(x, yy, w, h, LIGHT, LINE); let im = null;
    if (/^data:image\/jpeg;base64,/.test(String(d || ""))) { try { im = await pdf.embedJpg(d); } catch { /* a falta aparece no quadro */ } }
    if (!im) { text("Imagem não disponível", x + 12, yy + h / 2, 10, font, GRAY); return; }
    const s = Math.min(w / im.width, h / im.height);
    page.drawImage(im, { x: x + (w - im.width * s) / 2, y: yy + (h - im.height * s) / 2, width: im.width * s, height: im.height * s });
  };

  novaPagina("01 / Visão geral da carga");
  const kpis = [[`${kg(carga.peso)} kg`, "Peso bruto da carga"], [`${nPecas}`, "Peças nesta carga"], [`${itens.length}`, "Volumes para separar"], [`${camadas.length}`, "Camadas de carregamento"]];
  kpis.forEach(([v, l], i) => { const x = M + i * (W + 10) / 4; rect(x, y - 43, (W - 30) / 4, 43); text(v, x + 12, y - 19, 19, bold); text(l, x + 12, y - 33, 8, font, GRAY); });
  y -= 57;
  const heroW = 522, infoX = M + heroW + 18, infoW = W - heroW - 18;
  await imagem(imagens.full?.iso, M, y - 293, heroW, 293);
  text("Vista 3D · os números identificam os volumes", M, y - 307, 9, font, GRAY);
  text("VEÍCULO PREVISTO", infoX, y - 13, 9, bold, BLUE);
  texto(veic.nome, infoX, y - 35, infoW, 15, bold, NAVY, 2);
  let yi = y - 78;
  for (const [label, value] of [["Capacidade de peso",`${veic.pesoMax ? Math.round(100*carga.peso/veic.pesoMax) : 0}% · ${kg(carga.peso)} / ${kg(veic.pesoMax)} kg`],["Piso ocupado",`${carga.chao || 0}% da carroceria`],["Altura da carga",`${metros(carga.altura)} m / ${metros(veic.alturaUtil)} m úteis`],["Carroceria (C × L)",`${metros(veic.C)} × ${metros(veic.L)} m`],["Padrão de embalagem",perfilNome || "Padrão"],["Tempo estimado",carga.tempo?.minutos == null ? "Não informado" : `${carga.tempo.minutos} minutos`]]) {
    text(label,infoX,yi,8,font,GRAY); texto(value,infoX,yi-14,infoW,10,bold,NAVY,2); yi-=38;
  }
  const materiais = [[mad.caibro || 0,"caibros 5 × 6 cm"],[mad.sarrafo || 0,"sarrafos 2,5 × 5 cm"],[mad.tabua || 0,"tábuas 2,5 × 30 cm"]];
  text("MADEIRA PARA PREPARAÇÃO · PEÇAS DE 3 M",M,103,9,bold,BLUE);
  materiais.forEach(([n,l],i)=>{const x=M+i*(W+10)/3;rect(x,52,(W-20)/3,39);text(n,x+12,65,18,bold);text(l,x+55,67,10,font,GRAY);});
  if (estimadas.length || aplicados.length || carga.verificacoes?.length) text(`Conferências: ${estimadas.length} marcas com medidas estimadas · ${aplicados.length} ajustes por marca. Consulte a seção 07.`,M,37,8,bold,cor("#985019"));

  novaPagina("02 / Vistas para conferência");
  text("VISTA LATERAL",M,y,9,bold,BLUE); await imagem(imagens.full?.lado,M,y-197,W,184);
  text("VISTA SUPERIOR · FRENTE DO VEÍCULO À ESQUERDA",M,y-218,9,bold,BLUE); await imagem(imagens.full?.topo,M,53,W,200);

  const tipos = [...new Set(Object.keys(ROT).filter((k) => itens.some((u) => TIPO(u) === k)).map((k) => k === "degrau" ? "grade" : k))];
  for (let i=0;i<tipos.length;i+=2) {
    novaPagina("03 / Referências para preparar as embalagens");
    tipos.slice(i,i+2).forEach((t,j)=>desenharModeloEmbalagem(page,t,{x:M+j*(W+14)/2,y:48,w:(W-14)/2,h:y-48},{font,bold,titulo:t==="grade"?"Grade de piso / degraus":ROT[t],cor:COR[t]}));
  }

  const cintas = (u,t) => t==="caixa"?"tampa pregada":t==="solta"?"cinta catraca em cada apoio":`${2+Math.max(0,Math.floor((u.C/1000-1)/1.5))} cintas PET`;
  for (const u of ordem) {
    novaPagina("04 / Identificação e posição do volume");
    const t=TIPO(u), rom=(carga.romaneio||[]).find(r=>r.id===u.id)||{}, numero=String(u.volume).padStart(2,"0");
    const cont=new Map();for(const m of u.membros||[])cont.set(m.marca,(cont.get(m.marca)||0)+1);
    const qtd=u.membros?.length||0, passo=(carga.passos||ordem.map(v=>v.id)).indexOf(u.id)+1;
    rect(M,438,W,49,NAVY);
    text(`VOLUME ${numero}`,M+14,466,17,bold,WHITE);
    text(`${ROT[t]} · ${qtd} ${qtd===1?"peça":"peças"} · ${kg(u.kg)} kg`,M+14,449,11,font,WHITE);
    const marcas=[...cont].map(([m,n])=>`${m} × ${n}`).join(" · ");
    texto(marcas||"Marca não informada",M+250,466,W-267,12,bold,WHITE,2);

    const direita=M+464, dw=W-464;
    text("COMO O VOLUME FICA NA CARGA",M,419,10,bold,BLUE);
    await imagem(imagens.volumes?.[u.id],M,190,444,217);
    text("Vista 3D na orientação salva. Localização no esquema abaixo.",M,177,9,font,GRAY);
    if(estimadas.some(e=>cont.has(e.marca)))text("Medidas estimadas: conferir a peça real antes do carregamento.",M,162,9,bold,cor("#985019"));

    text("1 / SEPARAR",direita,419,11,bold,BLUE);
    texto(`Medidas originais: ${cm(u.C)} × ${cm(u.L)} × ${cm(u.A)} cm`,direita,400,dw,11,font,NAVY,2);
    text("Comprimento × largura × altura",direita,371,9,font,GRAY);
    text("Marcas e quantidades completas na seção 06.",direita,353,9,font,GRAY);

    text(`2 / POSICIONAR${passo>0?` · PASSO ${passo}`:""}`,direita,329,11,bold,BLUE);
    texto(`Da frente da carroceria: ${metros(u.x)} a ${metros(u.x+(u.fx||u.C))} m`,direita,310,dw,11,bold,NAVY,2);
    text(`Distância da lateral direita: ${metros(u.z)} m`,direita,278,10,font,NAVY);
    text(`Base a ${metros(u.y)} m do piso · camada ${(u.camada||0)+1}`,direita,260,10,font,NAVY);
    const r=u.rotacaoManual, giros=r&&Object.values(r).some(v=>v!==0);
    texto(giros?`Ajuste salvo: deitar ${r.x}° · virar ${r.y}° · inclinar ${r.z}°`:u.girada?"Atravessado na carroceria.":"Sem giro manual adicional.",direita,241,dw,10,font,GRAY,2);

    text("3 / APOIAR E PREPARAR",direita,211,11,bold,BLUE);
    const apoios=(u.sobre||[]).map(id=>byId.get(id)?.volume).filter(v=>v!=null);
    texto(apoios.length?`Sobre ${apoios.length===1?"o volume":"os volumes"} ${apoios.map(n=>String(n).padStart(2,"0")).join(", ")}, com caibros.`:!noAssoalho(u)?"Apoio não identificado. Conferir antes de carregar.":"No piso da carroceria, sobre caibros.",direita,192,dw,11,bold,NAVY,2);
    const md=rom.madeira||{};
    texto(md.compCaibro?`${md.nCaibro||2} caibros de ${String(md.compCaibro).replace(".",",")} m${md.sarrafo?` · ${md.sarrafo} sarrafos`:""}${md.tabua?` · ${md.tabua} tábuas`:""}`:"Madeira: conferir a preparação na seção 03.",direita,158,dw,10,font,GRAY,2);
    texto(cintas(u,t),direita,127,dw,10,font,GRAY,2);
    // vão à frente (lib/carga/travamento.js): escorar ou amarrar antes de seguir
    if(u.travamento)texto(textoTravamento(u.travamento,(id)=>byId.get(id)?.volume),direita,106,dw,10,bold,cor("#985019"),2);
    texto("Conferir apoio e amarração antes do próximo volume.",direita,83,dw,10,bold,BLUE,2);

    // Vista superior com escala igual nos dois eixos. Os retângulos são o espaço
    // ocupado, não a geometria da peça; o volume desta página recebe destaque.
    text("ONDE COLOCAR · VISTA DE CIMA",M,143,10,bold,BLUE);
    const sx=M+48, sw=380, escala=Math.min(sw/veic.C,62/veic.L), sh=veic.L*escala, sy=64;
    rect(sx,sy,veic.C*escala,sh,WHITE,GRAY);
    const linha=(x1,y1,x2,y2,c=LINE)=>page.drawLine({start:{x:x1,y:y1},end:{x:x2,y:y2},thickness:0.7,color:c});
    for(const v of [...itens.filter(v=>v.id!==u.id),u]){
      const x1=Math.max(0,v.x), x2=Math.min(veic.C,v.x+(v.fx||v.C)), z1=Math.max(0,v.z), z2=Math.min(veic.L,v.z+(v.fz||v.L));
      if(x2<=x1||z2<=z1)continue;
      const ativo=v.id===u.id, vx=sx+x1*escala, vy=sy+z1*escala, vw=(x2-x1)*escala, vh=(z2-z1)*escala;
      rect(vx,vy,vw,vh,ativo?ORANGE:LIGHT,ativo?ORANGE:LINE);
      if(ativo&&vw>18&&vh>12)text(numero,vx+(vw-bold.widthOfTextAtSize(numero,10))/2,vy+(vh-10)/2+2,10,bold,NAVY);
    }
    text("FRENTE",M,sy+sh/2+7,8,bold,GRAY);text("cabine",M,sy+sh/2-6,8,font,GRAY);
    text("TRASEIRA",sx+veic.C*escala-45,sy-13,8,bold,GRAY);
    text("ESQUERDA",sx+veic.C*escala/2-23,sy+sh+5,7,font,GRAY);
    text("DIREITA",sx+veic.C*escala/2-20,sy-13,7,font,GRAY);
    const local=sx+Math.max(0,Math.min(veic.C,u.x))*escala;
    linha(sx,sy-5,local,sy-5,ORANGE);
    text(`Laranja: volume ${numero}. Cinza: demais volumes. Espaço ocupado, sem detalhar a peça.`,M,39,8,font,GRAY);
  }

  const etapas=carga.montagemManual?(carga.passos||[]).map((id,passo)=>({id,passo,ci:byId.get(id)?.camada||0})):camadas.map(ci=>({ci}));
  for (const etapa of etapas) {
    const {ci,passo}=etapa;
    const its=carga.montagemManual?[byId.get(etapa.id)].filter(Boolean):(carga.passos||ordem.map((u)=>u.id)).map((id)=>byId.get(id)).filter((u)=>u&&(u.camada||0)===ci), im=(carga.montagemManual?(imagens.passos||[]).find(p=>p.passo===passo):(imagens.camadas||[]).find(c=>c.ci===ci))||{};
    for(let inicio=0;inicio<its.length;inicio+=9){
      novaPagina(carga.montagemManual?`05 / Passo ${passo+1} de ${etapas.length} · montagem definida`:`05 / Camada ${ci+1} de ${camadas.length}${inicio?" · sequência (continuação)":""}`);
      text(`${its.length} volumes · ${kg(its.reduce((n,u)=>n+u.kg,0))} kg · topo a ${metros(Math.max(...its.map((u)=>u.y+(u.fy||u.A))))} m`,M,y,10,font,GRAY);
      const fotoW=510, direita=M+fotoW+18, dw=W-fotoW-18;
      await imagem(im.iso,M,y-286,fotoW,270); await imagem(im.topo,M,48,fotoW,136);
      text(carga.montagemManual?"CARREGAR NESTE PASSO":"SEQUÊNCIA DESTA CAMADA",direita,y,9,bold,BLUE);
      texto(carga.montagemManual?"Colorido: este volume. Cinza: volumes dos passos anteriores.":"Colorido: esta camada. Cinza: volumes já carregados.",direita,y-19,dw,9,font,GRAY);
      let py=y-62;
      for(const [j,u] of its.slice(inicio,inicio+9).entries()){
        rect(direita,py-5,25,20,BLUE);text(carga.montagemManual?passo+1:inicio+j+1,direita+8,py+1,10,bold,WHITE);
        text(`Volume ${String(u.volume).padStart(2,"0")} · ${kg(u.kg)} kg`,direita+34,py+3,10,bold);
        texto(ROT[TIPO(u)],direita+34,py-11,dw-34,8.5,font,GRAY,1);py-=34;
      }
      texto(carga.montagemManual?"Siga a posição e a sequência salvas. Confira os pontos de apoio e a amarração antes do próximo volume.":"Caibros alinhados com os apoios de baixo; feche a camada com cinta catraca antes da próxima.",direita,82,dw,8.5,font,GRAY,3);
    }
  }

  // Lista completa, sem abreviar descrições, marcas ou a quantidade destinada a cada volume.
  const porFase=new Map();
  for(const u of itens)for(const m of u.membros||[]){const fase=faseDaMarca(m.marca,prefixo),g=porFase.get(fase)||new Map(),v=g.get(m.marca)||{n:0,desc:m.desc,kg:0,vols:new Map()};v.n++;v.kg+=m.kg||0;v.vols.set(u.volume,(v.vols.get(u.volume)||0)+1);g.set(m.marca,v);porFase.set(fase,g);}
  const widths=[22,108,295,48,80,W-553], headers=["", "Marca", "Descrição", "Qtd.", "Peso (kg)", "Volume × qtd."];
  const cabLista=()=>{novaPagina("06 / Separação das peças por fase");rect(M,y-24,W,24,NAVY);let x=M;headers.forEach((h,i)=>{text(h,x+7,y-16,9,bold,WHITE);x+=widths[i];});y-=24;};
  cabLista();
  for(const [fase,g] of [...porFase].sort((a,b)=>a[0].localeCompare(b[0],"pt",{numeric:true}))){
    if(y<105)cabLista();rect(M,y-24,W,24,LIGHT);text(fase==="?"?"Sem fase identificada":`Fase ${fase}`,M+8,y-16,10,bold,BLUE);y-=24;
    for(const [marca,v] of [...g].sort((a,b)=>a[0].localeCompare(b[0],"pt",{numeric:true}))){
      const cells=["",marca,v.desc||"",String(v.n),kg(v.kg),[...v.vols].sort((a,b)=>a[0]-b[0]).map(([n,q])=>`${n} × ${q}`).join(" · ")];
      const texts=cells.map((s,i)=>linhas(s,i===1?bold:font,9,widths[i]-14));
      const totalLinhas=Math.max(1,...texts.map((ls)=>ls.length));
      for(let linha=0;linha<totalLinhas;){
        if(y<82)cabLista();const capacidade=Math.max(1,Math.floor((y-49)/12)),n=Math.min(totalLinhas-linha,capacidade),h=n*12+14;
        if(linha===0)page.drawRectangle({x:M+7,y:y-20,width:8,height:8,borderColor:LINE,borderWidth:0.7});
        let x=M;for(let i=1;i<texts.length;i++){texts[i].slice(linha,linha+n).forEach((l,j)=>text(l,x+widths[0]+7,y-18-j*12,9,i===1?bold:font,i===2?GRAY:NAVY));x+=widths[i];}
        page.drawLine({start:{x:M,y:y-h},end:{x:M+W,y:y-h},thickness:0.5,color:LINE});y-=h;linha+=n;
      }
    }
    y-=12;
  }

  const alertasAutomaticos=itens.filter(u=>u.alerta);
  if(estimadas.length||aplicados.length||carga.verificacoes?.length||alertasAutomaticos.length){
    novaPagina("07 / Conferências e ajustes desta carga");
    const nota=(titulo,conteudo)=>{const ls=linhas(conteudo,font,10,W-24);if(y<90){novaPagina("07 / Conferências e ajustes (continuação)");}text(titulo,M,y,11,bold,BLUE);y-=18;for(const l of ls){if(y<50)novaPagina("07 / Conferências e ajustes (continuação)");text(l,M,y,10);y-=14;}y-=17;};
    for(const u of alertasAutomaticos)nota(`Volume ${String(u.volume).padStart(2,"0")}: conferir antes de carregar`,u.alerta);
    for(const a of carga.verificacoes||[])nota("Conferência da montagem",a.texto);
    for(const e of estimadas)nota(`Conferir no pátio: ${e.marca}`,`${e.desc||"Sem descrição"} · ${kg(e.kg)} kg · embalagem estimada ${cm(e.C)} × ${cm(e.L)} × ${cm(e.A)} cm. A marca não foi encontrada no IFC; as medidas foram estimadas pelo peso.`);
    for(const [marca,regras] of aplicados)nota(`Ajuste aplicado: ${marca}`,resumoDaRegra(regras));
  }
  const paginas=pdf.getPages(),data=new Date().toLocaleDateString("pt-BR");
  paginas.forEach((p,i)=>{p.drawLine({start:{x:M,y:28},end:{x:PW-M,y:28},thickness:0.5,color:LINE});p.drawText(`TORG METAL · OP ${op.numero} · ${data}`,{x:M,y:15,size:8,font,color:GRAY});const n=`${i+1} / ${paginas.length}`;p.drawText(n,{x:PW-M-font.widthOfTextAtSize(n,8),y:15,size:8,font,color:GRAY});});
  return {bytes:await pdf.save(),filename:`Modelo de carga - OP ${op.numero} - romaneio previo ${String(previo.numero).padStart(2,"0")}${total>1?` - carga ${indice+1}`:""}.pdf`};
}
