import { createHash } from "node:crypto";
import { z } from "zod";
import { lerMultipart, CorpoRecusado } from "@/lib/fiscal/assistente/multipart";
import { lerAnexoNfe, nomeSeguro } from "@/lib/fiscal/assistente/anexo-nfe";

// ─── O QUE CHEGA NA ROTA DE MENSAGEM ─────────────────────────────────────────
//
// JSON quando é só pergunta; multipart quando vem XML junto. As duas portas terminam no MESMO
// formato — `{ corpo, anexo }` — para a rota não ter dois caminhos que divirjam no primeiro ajuste.
//
// ⚠⚠ TUDO AQUI ACONTECE ANTES DE RESERVAR ORÇAMENTO. Arquivo inválido, grande demais ou com campo
// estranho é recusado sem tocar no teto de ninguém — e sem nenhuma chamada paga.

export const esquema = z.object({
  pergunta: z.string().trim().min(2, "Escreva a sua pergunta.").max(4000, "A pergunta passou de 4.000 caracteres."),
  conversaId: z.string().max(40).optional().nullable(),
  chave: z.string().trim().min(8).max(64),
});

const sha256 = (dado) => createHash("sha256").update(dado).digest("hex");

/**
 * ⚠⚠ A IDENTIDADE DA TENTATIVA INCLUI O ARQUIVO. Pergunta idêntica com outra nota é OUTRA tentativa:
 * reaproveitar a resposta anterior entregaria a análise de um documento diferente do anexado.
 */
export const hashDaTentativa = ({ pergunta, conversaId }, anexo) =>
  sha256([pergunta, conversaId ?? "", anexo?.sha256 ?? ""].join("\u0000"));

/** Devolve `{ corpo, anexo }` ou lança `CorpoRecusado` com o status HTTP certo. */
export async function lerPedido(req) {
  const tipo = req.headers.get("content-type") ?? "";

  if (!tipo.includes("multipart/form-data")) {
    const cru = await req.json().catch(() => { throw new CorpoRecusado("Não foi possível ler o envio."); });
    return { corpo: validar(cru), anexo: null };
  }

  const { campos, arquivo } = await lerMultipart(req);
  const corpo = validar({ pergunta: campos.pergunta, conversaId: campos.conversaId || null, chave: campos.chave });
  if (!arquivo) return { corpo, anexo: null };

  const lido = lerAnexoNfe(arquivo.texto);
  if (lido.erro) throw new CorpoRecusado(lido.erro);
  return {
    corpo,
    anexo: {
      doc: lido.doc, problemas: lido.problemas, suspeito: lido.suspeito,
      nome: nomeSeguro(arquivo.nome), tamanho: arquivo.tamanho,
      // ⚠ O hash é dos BYTES ORIGINAIS, não do texto decodificado: é ele que identifica o arquivo
      // que a pessoa tem na máquina, byte a byte, se alguém precisar conferir depois.
      sha256: sha256(arquivo.bytes),
      conteudo: arquivo.texto,
    },
  };
}

function validar(dados) {
  try {
    return esquema.parse(dados);
  } catch (e) {
    throw new CorpoRecusado(e.issues?.[0]?.message ?? "Dados inválidos.");
  }
}

export { CorpoRecusado };
