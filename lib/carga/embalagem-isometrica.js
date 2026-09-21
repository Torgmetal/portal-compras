// Referências de embalagem em vetor: peças vazadas e perfis reconhecíveis,
// com uma única escala para os três eixos (sem esticar o desenho no painel).
import { rgb } from "pdf-lib";

const cor = (h) => rgb(...h.match(/[a-f\d]{2}/gi).map((v) => parseInt(v, 16) / 255));
const ACO = ["#54758A", "#36566D", "#A3BAC8"];
const MADEIRA = ["#C79A62", "#A77842", "#E5C594"];
const CINTA = ["#276653", "#174C3C", "#3B846E"];
const CATRACA = ["#D87721", "#AC5314", "#F7A34A"];

function criarModelo(tipo) {
  const blocos = [];
  const bloco = (x, y, z, c, a, l, material = ACO) => blocos.push({ x, y, z, c, a, l, material });
  const caibros = (c, l, y = 0, a = 7) => {
    for (const x of [12, c / 2 - 4, c - 20]) bloco(x, y, -5, 8, a, l + 10, MADEIRA);
  };
  const perfil = (x, y, z, c, a, l) => {
    bloco(x, y, z, c, 2.5, l);
    bloco(x, y + 2.5, z + l / 2 - 1.2, c, a - 5, 2.4);
    bloco(x, y + a - 2.5, z, c, 2.5, l);
  };
  const painel = (x, y, z, c, l, grade = false) => {
    const t = grade ? 2 : 4;
    bloco(x, y, z, c, 4, t); bloco(x, y, z + l - t, c, 4, t);
    bloco(x, y, z, t, 4, l); bloco(x + c - t, y, z, t, 4, l);
    if (grade) {
      for (let dz = 8; dz < l - 4; dz += 7) bloco(x, y, z + dz, c, 4, 1.5);
      for (let dx = 12; dx < c - 4; dx += 12) bloco(x + dx, y + 2.8, z, 1.1, 1.2, l);
    } else {
      bloco(x + 5, y, z + l / 2 - 2, c - 10, 4, 4);
      for (const dx of [c / 3, 2 * c / 3]) bloco(x + dx, y, z, 4, 4, l);
    }
  };
  const cintar = (xs, l, base, topo, catraca = false) => {
    const material = catraca ? CATRACA : CINTA;
    for (const x of xs) {
      bloco(x, base, -0.8, 2.2, topo - base, 0.8, material);
      bloco(x, topo, -0.8, 2.2, 0.8, l + 1.6, material);
      bloco(x, base, l, 2.2, topo - base, 0.8, material);
      if (catraca) bloco(x - 1.2, base + 10, -2.1, 4.6, 7, 1.4, CATRACA);
      else bloco(x - 0.5, topo - 2, -1.5, 3.2, 3, 2, CINTA);
    }
  };
  let alvos;
  if (tipo === "gc" || tipo === "grade" || tipo === "degrau") {
    const c = 170, l = 78, grade = tipo !== "gc";
    caibros(c, l);
    for (let i = 0; i < 4; i++) {
      const y = 7 + i * 10;
      painel(0, y, 0, c, l, grade);
      if (i < 3) caibros(c, l - 4, y + 4, 6);
    }
    cintar([22, 144], l, 7, 41);
    alvos = [[5, 41, 36], [c / 2, 2, -5], [145, 42, 55]];
  } else if (tipo === "feixe") {
    const c = 215, l = 56;
    caibros(c, l);
    for (let fila = 0; fila < 2; fila++) {
      for (let coluna = 0; coluna < 3; coluna++) perfil(0, 7 + fila * 25, coluna * 20, c, 19, 16);
      if (fila === 0) caibros(c, l - 4, 26, 6);
    }
    cintar([24, 102, 187], l, 7, 51);
    alvos = [[0, 48, 9], [c / 2, 2, -5], [189, 52, 35]];
  } else if (tipo === "solta") {
    const c = 210, l = 36;
    caibros(c, l); perfil(0, 7, 0, c, 42, l);
    cintar([15, c / 2 - 1, c - 17], l, 0, 49, true);
    alvos = [[0, 36, 18], [c / 2, 3, -5], [c - 16, 50, 27]];
  } else if (tipo === "engradado") {
    const c = 166, l = 55, a = 106, q = 5;
    caibros(c, l);
    // Painéis verticais no interior: montantes e travessas ficam vazados.
    for (const z of [9, 23, 37]) {
      for (const x of [9, 81, 153]) bloco(x, 12, z, 3, 83, 3);
      for (const y of [12, 53, 92]) bloco(9, y, z, 147, 3, 3);
    }
    for (const z of [0, l - q]) {
      bloco(0, 7, z, c, 7, q, MADEIRA); bloco(0, a, z, c, q, q, MADEIRA);
      for (const x of [0, c - q]) bloco(x, 7, z, q, a - 7, q, MADEIRA);
    }
    for (const x of [0, c - q]) bloco(x, a, 0, q, q, l, MADEIRA);
    // Diagonais representadas como prismas inclinados, não uma chapa fechada.
    for (const z of [0, l - q]) blocos.push({ diagonal: true, x: 5, y: 14, z, c: c - 10, a: a - 14, l: q, material: MADEIRA });
    cintar([35, 126], l, 7, a + q);
    alvos = [[9, 92, 9], [75, 62, 0], [128, 111, 35]];
  } else {
    const c = 142, l = 80;
    caibros(c, l);
    for (let z = 0; z < l; z += 16) bloco(0, 7, z, c, 4, 15, MADEIRA);
    // Peças pequenas no interior, visíveis pela abertura da tampa.
    for (let i = 0; i < 10; i++) bloco(18 + (i % 5) * 21, 12 + Math.floor(i / 5) * 12, 15 + (i % 3) * 16, 16, 5, 12);
    for (const y of [11, 25, 39]) {
      bloco(0, y, 0, c, 10, 3, MADEIRA); bloco(0, y, l - 3, c, 10, 3, MADEIRA);
      bloco(0, y, 0, 3, 10, l, MADEIRA); bloco(c - 3, y, 0, 3, 10, l, MADEIRA);
    }
    for (const x of [2, c - 6]) for (const z of [3, l - 7]) bloco(x, 11, z, 4, 42, 4, MADEIRA);
    // Tampa afastada para mostrar o conteúdo e a construção ripada.
    for (let z = 0; z < l; z += 16) bloco(0, 73, z, c, 3, 13, MADEIRA);
    for (const x of [17, c - 23]) bloco(x, 69, 0, 5, 4, l, MADEIRA);
    alvos = [[31, 28, 31], [c / 2, 5, -5], [c - 20, 76, 55]];
  }
  return { blocos, alvos };
}

const projetar = ([x, y, z]) => [0.86 * x - 0.56 * z, 0.22 * x + 0.34 * z + 0.95 * y];
function facesDoBloco(b) {
  const { x, y, z, c, a, l, material } = b;
  if (b.diagonal) {
    const p = [[x,y,z],[x+c,y+a-4,z],[x+c,y+a,z],[x,y+4,z]];
    return [{ pontos:p, tom:material[0] }, { pontos:[p[2],p[3],[x,y+4,z+l],[x+c,y+a,z+l]],tom:material[2] }];
  }
  return [
    {pontos:[[x,y,z],[x+c,y,z],[x+c,y+a,z],[x,y+a,z]],tom:material[0]},
    {pontos:[[x,y,z+l],[x,y,z],[x,y+a,z],[x,y+a,z+l]],tom:material[1]},
    {pontos:[[x,y+a,z],[x+c,y+a,z],[x+c,y+a,z+l],[x,y+a,z+l]],tom:material[2]},
  ];
}

// Ordenação espacial com recorte: uma face longa não pode encobrir uma cinta
// que está na sua frente. A ordem pelo centro das faces não resolve esse caso.
const produto = (a,b) => a.reduce((v,n,i)=>v+n*b[i],0);
const subtrair = (a,b) => a.map((v,i)=>v-b[i]);
const cruzar = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function plano(face) {
  const n=cruzar(subtrair(face.pontos[1],face.pontos[0]),subtrair(face.pontos[2],face.pontos[0]));
  const tamanho=Math.hypot(...n), normal=n.map(v=>v/tamanho);
  return {normal,distancia:produto(normal,face.pontos[0])};
}
function separar(face, p, frente, atras, coplanares) {
  const dist=face.pontos.map(v=>produto(p.normal,v)-p.distancia);
  if(dist.every(v=>Math.abs(v)<1e-6)){coplanares.push(face);return;}
  if(dist.every(v=>v>=-1e-6)){frente.push(face);return;}
  if(dist.every(v=>v<=1e-6)){atras.push(face);return;}
  const pos=[],neg=[];
  for(let i=0;i<face.pontos.length;i++){
    const j=(i+1)%face.pontos.length,a=face.pontos[i],b=face.pontos[j],da=dist[i],db=dist[j];
    if(da>=-1e-6)pos.push(a);if(da<=1e-6)neg.push(a);
    if((da>1e-6&&db<-1e-6)||(da<-1e-6&&db>1e-6)){
      const t=da/(da-db),ponto=a.map((v,k)=>v+t*(b[k]-v));pos.push(ponto);neg.push(ponto);
    }
  }
  if(pos.length>=3)frente.push({...face,pontos:pos});
  if(neg.length>=3)atras.push({...face,pontos:neg});
}
function ordenarFaces(faces) {
  if(!faces.length)return [];
  const p=plano(faces[Math.floor(faces.length/2)]),frente=[],atras=[],coplanares=[];
  for(const f of faces)separar(f,p,frente,atras,coplanares);
  const olho=[-10000,10000,-10000],lado=produto(p.normal,olho)-p.distancia;
  return lado>0 ? [...ordenarFaces(atras),...coplanares,...ordenarFaces(frente)] : [...ordenarFaces(frente),...coplanares,...ordenarFaces(atras)];
}
function bordaOriginal(a,b,originais) {
  return originais.some((p,i)=>{
    const q=originais[(i+1)%originais.length],d=subtrair(q,p),tam=Math.hypot(...d);
    return Math.hypot(...cruzar(subtrair(a,p),d))<1e-5*tam && Math.hypot(...cruzar(subtrair(b,p),d))<1e-5*tam;
  });
}

/** Desenha no retângulo sem distorção. Retorna os pontos para as chamadas numeradas. */
export function desenharEmbalagemIsometrica(page, tipo, { x, y, w, h }) {
  const { blocos, alvos } = criarModelo(tipo);
  const faces = blocos.flatMap(facesDoBloco).map((f)=>({...f,originais:f.pontos}));
  const pontos = faces.flatMap((f) => f.pontos.map(projetar));
  const minX = Math.min(...pontos.map((p) => p[0])), maxX = Math.max(...pontos.map((p) => p[0]));
  const minY = Math.min(...pontos.map((p) => p[1])), maxY = Math.max(...pontos.map((p) => p[1]));
  const escala = Math.min((w - 30) / (maxX - minX), (h - 28) / (maxY - minY));
  const ox = x + (w - (maxX - minX) * escala) / 2 - minX * escala;
  const oy = y + (h - (maxY - minY) * escala) / 2 - minY * escala;
  const noPapel = (p) => { const [u,v] = projetar(p); return [ox + u * escala, oy + v * escala]; };
  for (const face of ordenarFaces(faces)) {
    const ps = face.pontos.map(noPapel);
    const path = ps.map(([px,py],i) => `${i ? "L" : "M"} ${px.toFixed(3)} ${(-py).toFixed(3)}`).join(" ") + " Z";
    page.drawSvgPath(path, {color:cor(face.tom),x:0,y:0});
    for(let i=0;i<ps.length;i++){
      const j=(i+1)%ps.length;
      if(bordaOriginal(face.pontos[i],face.pontos[j],face.originais))page.drawLine({start:{x:ps[i][0],y:ps[i][1]},end:{x:ps[j][0],y:ps[j][1]},color:cor("#40556A"),thickness:0.25});
    }
  }
  return alvos.map(noPapel);
}
