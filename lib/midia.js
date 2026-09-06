export function ehVideo(item) {
  return item?.tipo === "video" || /^video\//i.test(item?.arquivoTipo || "") || /\.(mp4|webm|mov)(?:[?#]|$)/i.test(item?.url || "");
}
