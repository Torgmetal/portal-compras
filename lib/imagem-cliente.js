// Redução de imagem NO NAVEGADOR, antes de subir.
//
// Resolve dois problemas de uma vez: o iPhone fotografa em HEIC — que o PDF do data
// book não lê — e a foto crua passa de 4 MB, tamanho em que a rota serverless trava
// (ver [[torg_upload_4mb]]). Reduzir na origem resolve os dois e ainda deixa o envio
// rápido no 4G do galpão.
//
// ⚠ Vale para o computador também: foto de câmera boa passa de 10 MB, e o inspetor que
// anexa pelo desktop bate no mesmo teto.
export async function reduzImagem(file, maxDim = 1600, quality = 0.82) {
  const url = URL.createObjectURL(file);
  try {
    const img = document.createElement("img");
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = () => rej(new Error("Não consegui ler essa imagem."));
      img.src = url;
    });
    let { width, height } = img;
    const escala = Math.min(1, maxDim / Math.max(width, height));
    width = Math.round(width * escala); height = Math.round(height * escala);
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    canvas.getContext("2d").drawImage(img, 0, 0, width, height);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob) throw new Error("Falha ao processar a foto.");
    return blob;
  } finally { URL.revokeObjectURL(url); }
}
