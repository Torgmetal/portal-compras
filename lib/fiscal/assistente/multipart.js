import { LIMITES } from "@/lib/fiscal/assistente/anexo-nfe";

// ─── O CORPO DA REQUISIÇÃO, COM TETO DE VERDADE ──────────────────────────────
//
// ⚠⚠⚠ `req.formData()` MATERIALIZA O CORPO INTEIRO ANTES DE QUALQUER CONFERÊNCIA (parecer de
// segurança do Codex, 24/09/2026). A aba Auditoria faz `formData()` e só DEPOIS olha
// `arquivo.size` — nessa altura o corpo já está todo na memória, e campos extras, vários arquivos
// ou um multipart inflado escapam do teto por arquivo. Aqui os bytes são CONTADOS enquanto chegam, e
// a leitura é abandonada no primeiro byte acima do limite.
//
// ⚠ `Content-Length` é recusa ANTECIPADA, não a defesa: o cabeçalho pode mentir ou faltar (corpo em
// chunks). A defesa é a contagem.

/** ⚠ O arquivo + os campos de texto (pergunta até 4.000 caracteres) + a moldura do multipart. */
export const TETO_CORPO = LIMITES.bytes + 64 * 1024;

const CAMPOS_TEXTO = new Set(["pergunta", "chave", "conversaId"]);
const CAMPO_ARQUIVO = "xml";

export class CorpoRecusado extends Error {
  constructor(mensagem, status = 400) { super(mensagem); this.status = status; }
}

async function lerComTeto(req, teto) {
  const declarado = Number(req.headers.get("content-length") ?? NaN);
  if (Number.isFinite(declarado) && declarado > teto) {
    throw new CorpoRecusado(`O envio passa de ${Math.floor(LIMITES.bytes / 1024 / 1024)} MB.`, 413);
  }
  if (!req.body) return new Uint8Array(0);
  const leitor = req.body.getReader();
  const partes = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > teto) {
      // ⚠ Cancela a leitura: não adianta recusar e continuar puxando o resto do corpo da rede.
      await leitor.cancel().catch(() => {});
      throw new CorpoRecusado(`O envio passa de ${Math.floor(LIMITES.bytes / 1024 / 1024)} MB.`, 413);
    }
    partes.push(value);
  }
  const corpo = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) { corpo.set(p, pos); pos += p.byteLength; }
  return corpo;
}

/**
 * Lê um multipart com pergunta + (no máximo) UM XML.
 *
 * ⚠⚠ LISTA FECHADA DE CAMPOS: nome desconhecido é recusa, não "ignora". Campo que ninguém lê é campo
 * que ninguém confere — e um segundo arquivo "a mais" escaparia de toda a validação do primeiro.
 */
export async function lerMultipart(req) {
  const tipo = req.headers.get("content-type") ?? "";
  const bytes = await lerComTeto(req, TETO_CORPO);
  // ⚠ Só depois do teto conferido o multipart é interpretado — sobre bytes que já cabem.
  const form = await new Request("http://corpo.local/", { method: "POST", headers: { "content-type": tipo }, body: bytes })
    .formData()
    .catch(() => { throw new CorpoRecusado("Não foi possível ler o envio."); });

  const campos = {};
  let arquivo = null;
  for (const [nome, valor] of form.entries()) {
    if (nome === CAMPO_ARQUIVO) {
      if (typeof valor === "string") throw new CorpoRecusado("O campo `xml` precisa ser um arquivo.");
      if (arquivo) throw new CorpoRecusado("Anexe UM arquivo por vez.");
      arquivo = valor;
      continue;
    }
    if (!CAMPOS_TEXTO.has(nome)) throw new CorpoRecusado(`Campo não esperado: ${String(nome).slice(0, 40)}.`);
    if (typeof valor !== "string") throw new CorpoRecusado(`O campo ${nome} precisa ser texto.`);
    if (nome in campos) throw new CorpoRecusado(`O campo ${nome} veio repetido.`);
    campos[nome] = valor;
  }
  if (arquivo && arquivo.size > LIMITES.bytes) {
    throw new CorpoRecusado(`O arquivo passa de ${LIMITES.bytes / 1024 / 1024} MB.`, 413);
  }
  return {
    campos,
    arquivo: arquivo && { nome: arquivo.name, tamanho: arquivo.size, texto: await arquivo.text(), bytes: new Uint8Array(await arquivo.arrayBuffer()) },
  };
}
