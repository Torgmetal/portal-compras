export const LIMITE_RELATORIO = 50 * 1024 * 1024;
export const TIPOS_RELATORIO = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

export function validarArquivoRelatorio(nome, tamanho) {
  const extensao = nome.split(".").pop()?.toLowerCase();
  const tipo = TIPOS_RELATORIO[extensao];
  if (!tipo) throw new Error("Use PDF, Word, Excel, JPG ou PNG.");
  if (!tamanho || tamanho > LIMITE_RELATORIO) throw new Error("O arquivo deve ter conteúdo e no máximo 50 MB.");
  return tipo;
}
