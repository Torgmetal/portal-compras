// Desenhos esquemáticos dos MODELOS DE EMBALAGEM do simulador (pdf-lib, vetor puro) — a referência
// de "como se monta" cada tipo de volume, com as regras do lib/carga/premissas.js escritas ao lado.
// Vitor (14/09/2026): "o ideal seria um desenho do modelo das embalagens para usarmos como referência
// para montagem". Cada modelo tem uma vista isométrica, chamadas numeradas e as regras.
// Não é o volume real (esse é a foto 3D do cartão de cada volume): é o PADRÃO, igual para toda obra.
import { rgb } from "pdf-lib";
import { desenharEmbalagemIsometrica } from "./embalagem-isometrica";
import { CAIXA_MAD, EMB, MEDIDAS, PAC, PAC_GC, PAC_GRADE } from "./premissas";

const hex = (h) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

const cm = (mm) => `${Math.round(mm / 10)} cm`;
const kg = (v) => `${Math.round(v).toLocaleString("pt-BR")} kg`;

/** Regras de montagem por tipo — o texto que vai ao lado do desenho. Números vêm das premissas. */
export const REGRAS = {
  caixa: [
    `Fundo fechado sobre 3 caibros 5×6 (paletizada), laterais e tampa ripadas em tábua 2,5×30; montantes de sarrafo nos 4 cantos.`,
    `Comprimento até ${cm(CAIXA_MAD.compMax)}, altura até ${cm(CAIXA_MAD.alturaMax)}, ${kg(CAIXA_MAD.kgTotal)} no máximo. Peça de até ${kg(CAIXA_MAD.kgMax)} cada.`,
    `Miúdos da mesma marca juntos (sacos ou amarrados); a lista de marcas e quantidades vai pregada na tampa.`,
  ],
  gc: [
    `Painéis DEITADOS, um sobre o outro, casados pelo mesmo tamanho; sarrafo 2,5×5 entre cada camada, alinhado.`,
    `2 cintas PET a 50 cm das pontas e mais 1 a cada 1,5 m; altura do pacote até ${cm(PAC_GC.alturaMax)}, ${kg(PAC_GC.kgMax)} no máximo.`,
    `Nada em cima do pacote; em pé só dentro de engradado ou sobre cavalete — nunca inclinado.`,
  ],
  grade: [
    `Grades empilhadas casadas (mesma medida embaixo e em cima), sarrafo 2,5×5 entre camadas nas duas pontas e no meio.`,
    `Cintas PET a 50 cm das pontas; altura até ${cm(PAC_GRADE.alturaMax)}, ${kg(PAC_GRADE.kgMax)} no máximo. Degraus vão junto das grades.`,
    `Delicado: vai por cima da carga e nada sobe nele. Carga só de grade sai em camadas, maior embaixo.`,
  ],
  degrau: null, // usa o da grade
  feixe: [
    `Barras/perfis alinhados pelas pontas, fileiras separadas por sarrafo (calço) a cada 1,5 m; seção do feixe até ${cm(PAC.secaoMax)} × ${cm(PAC.alturaMax)}.`,
    `Cintas PET a 50 cm das pontas e a cada 1,5 m, com cantoneira de proteção; até ${kg(PAC.kgMax)} por feixe.`,
    `Perfil viaja com a alma em pé; peça mais pesada embaixo do feixe.`,
  ],
  engradado: [
    `Quadro de caibro ${cm(EMB.engradado.quadro)} com base de ${cm(EMB.engradado.base)}, diagonal de travamento nas duas faces, tampa de ${cm(EMB.engradado.tampa)}.`,
    `Painéis em pé, separados por sarrafo; largura do engradado até ${cm(EMB.engradado.largMax)}, ${kg(EMB.engradado.kgMax)} no máximo.`,
    `Cintas por fora do quadro; empilha só engradado sobre engradado do mesmo tamanho.`,
  ],
  solta: [
    `Sobre 2 caibros 5×6 no mínimo (1 a cada 1,5 m), atravessados e alinhados com os da camada de baixo.`,
    `Calço de ${cm(MEDIDAS.CALCO)} quando a base não é plana; cinta catraca sobre a peça em cada apoio.`,
    `Perfil com a alma em pé, chapa deitada; comprida e pesada embaixo, junto do eixo.`,
  ],
};

// O desenho mantém as proporções e usa chamadas que correspondem à legenda.
const NOMES = {
  gc: ["Guarda-corpos vazados", "Caibros e sarrafos", "Cintas PET"],
  grade: ["Grades com grelha", "Caibros e sarrafos", "Cintas PET"],
  degrau: ["Grades / degraus", "Caibros e sarrafos", "Cintas PET"],
  feixe: ["Perfis com alma em pé", "Apoios e separadores", "Cintas PET"],
  solta: ["Perfil com alma em pé", "Caibros de apoio", "Cintas com catraca"],
  engradado: ["Painéis na vertical", "Quadro e diagonais", "Cintas externas"],
  caixa: ["Peças pequenas", "Base paletizada", "Tampa ripada afastada"],
};
const rect = (page,x,y,w,h,color,borderColor) => page.drawRectangle({x,y,width:w,height:h,color,borderColor,borderWidth:borderColor?0.6:0});

/** Referência ilustrada do padrão, sem substituir as medidas do volume real. */
export function desenharModeloEmbalagem(page, tipo, { x, y, w, h }, { font, bold, titulo, cor }) {
  rect(page,x,y,w,h,rgb(1,1,1),hex("#DCE4EB"));
  rect(page,x,y+h-26,w,26,cor);
  page.drawText(titulo,{x:x+12,y:y+h-18,size:11,font:bold,color:rgb(1,1,1)});
  page.drawText("REFERÊNCIA DE MONTAGEM · SEM ESCALA",{x:x+12,y:y+h-43,size:7.5,font:bold,color:hex("#576D7E")});
  const regras=(REGRAS[tipo]||REGRAS.grade).map((r)=>quebra(r,font,8.5,w-30));
  const hReg=regras.reduce((n,r)=>n+r.length*11+6,0)+12;
  const legendaY=y+hReg+12, figuraY=legendaY+48;
  const figuraH=y+h-54-figuraY;
  const alvos=desenharEmbalagemIsometrica(page,tipo,{x:x+10,y:figuraY,w:w-20,h:figuraH});
  const nomes=NOMES[tipo]||NOMES.solta;
  for(let i=0;i<3;i++){
    const [px,py]=alvos[i];
    page.drawCircle({x:px,y:py,size:7.5,color:hex("#006EAB"),borderColor:rgb(1,1,1),borderWidth:1});
    page.drawText(String(i+1),{x:px-2.5,y:py-3,size:9,font:bold,color:rgb(1,1,1)});
    const ly=legendaY+30-i*14;
    page.drawText(String(i+1).padStart(2,"0"),{x:x+13,y:ly,size:8.5,font:bold,color:hex("#006EAB")});
    page.drawText(nomes[i],{x:x+33,y:ly,size:8.5,font,color:hex("#002945")});
  }
  page.drawLine({start:{x:x+12,y:legendaY-1},end:{x:x+w-12,y:legendaY-1},thickness:0.6,color:hex("#DCE4EB")});
  let ty=y+hReg-7;
  for(const r of regras){
    for(const [i,ln] of r.entries()){
      page.drawText((i===0?"• ":"   ")+ln,{x:x+12,y:ty,size:8.5,font,color:hex("#334D60")});ty-=11;
    }
    ty-=6;
  }
}

function quebra(str,f,size,maxW){const out=[];let l="";for(const w of String(str).split(" ")){const t=l?`${l} ${w}`:w;if(f.widthOfTextAtSize(t,size)<=maxW)l=t;else{out.push(l);l=w;}}if(l)out.push(l);return out;}
