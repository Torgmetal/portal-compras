// Instrumentação apenas do ensaio: conta comandos WebGL, não mede tempo de GPU.
export const contagem = { quadros: 0, desenhos: 0, triangulos: 0 };
const proto = WebGL2RenderingContext.prototype;
for (const nome of ['clear', 'drawElements', 'drawArrays']) {
  const original = proto[nome];
  proto[nome] = function (...args) {
    if (nome === 'clear') contagem.quadros++;
    else {
      contagem.desenhos++;
      if (args[0] === this.TRIANGLES) contagem.triangulos += (nome === 'drawElements' ? args[1] : args[2]) / 3;
    }
    return original.apply(this, args);
  };
}
export async function medirVistas() {
  const canvas = document.querySelector('canvas');
  const antes = { ...contagem };
  const intervalos = [];
  let anterior = performance.now();
  // Captura de pointer exige evento real; este ensaio usa vistas via botões a cada quadro.
  // Alternar Frente/Lateral exercita renderização sem depender da velocidade da automação.
  const botoes = [...document.querySelectorAll('button')];
  const vistas = ['Frente','Lateral'].map(nome => botoes.find(b => b.textContent === nome));
  for (let i = 0; i < 120; i++) {
    await new Promise(requestAnimationFrame);
    const agora = performance.now();
    intervalos.push(agora - anterior); anterior = agora;
    vistas[i % 2].click();
  }
  await new Promise(requestAnimationFrame);
  const quadros = contagem.quadros - antes.quadros;
  intervalos.sort((a,b) => a-b);
  return { quadros, desenhosPorQuadro: (contagem.desenhos - antes.desenhos) / quadros,
    triangulosPorQuadro: (contagem.triangulos - antes.triangulos) / quadros,
    intervaloMedianoMs: intervalos[60], intervaloP95Ms: intervalos[114],
    buffer: [canvas.width, canvas.height], dpr: devicePixelRatio };
}
