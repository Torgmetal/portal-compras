// Mensagem de e-mail como anexo — puro JS, usado na tela e na rota de upload.
//
// Vitor (25/09/2026): "nos relatórios de não conformidade, preciso que dê permissão para anexar EMS,
// EML mensagens". A reclamação do cliente chega por e-mail; anexar a mensagem em si (e não um print
// dela) guarda remetente, data e os anexos originais como evidência.
//
// ⚠⚠ O TIPO SAI DA EXTENSÃO, NÃO DO NAVEGADOR. O .msg do Outlook (Windows) chega com tipo VAZIO no
// Mac, e o .eml depende do que o sistema registrou. O upload vai direto para o Blob, que só aceita os
// tipos liberados no token — sem o tipo explícito, o arquivo seria recusado conforme a máquina.

export const TIPO_EML = "message/rfc822";
export const TIPO_MSG = "application/vnd.ms-outlook";
export const TIPOS_EMAIL = [TIPO_EML, TIPO_MSG];

/** Extensões para o `accept` do seletor de arquivo. */
export const ACEITA_EMAIL = ".eml,.msg";

const POR_EXTENSAO = { eml: TIPO_EML, msg: TIPO_MSG };

/** O tipo MIME do arquivo de e-mail, pela extensão — ou null se não for e-mail. */
export function tipoDeEmail(nome) {
  const ext = String(nome || "").match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  return (ext && POR_EXTENSAO[ext]) || null;
}

/** O tipo a guardar no anexo: o do e-mail pela extensão, senão o que o navegador deu. */
export const tipoDoArquivo = (file) => tipoDeEmail(file?.name) || file?.type || "";

/** As opções do upload do Blob — o e-mail vai com o tipo explícito; o resto, como sempre subiu. */
export function comTipoDeEmail(file, opcoes) {
  const contentType = tipoDeEmail(file?.name);
  return contentType ? { ...opcoes, contentType } : opcoes;
}

/** O anexo guardado ({ nome, tipo }) é uma mensagem de e-mail? */
export const ehEmail = (anexo) => TIPOS_EMAIL.includes(String(anexo?.tipo || "")) || Boolean(tipoDeEmail(anexo?.nome));

// ⚠ SÓ OS ANEXOS DA RNC. A rota de token (/api/qualidade/documentos/upload-token) é a mesma para 8
// telas da Qualidade — data book, calibração, auditorias… Liberar e-mail nela toda deixaria entrar
// mensagem onde ninguém pediu.
export const aceitaEmailNoCaminho = (pathname) => String(pathname || "").startsWith("qualidade/rnc/anexos/");
