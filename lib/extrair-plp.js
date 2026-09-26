// ─── LER O PLANO DE PINTURA DE UM DOCUMENTO QUALQUER ──────────────────────────
// Vitor (26/08/2026): "nessa parte do PLP preciso que você leia um documento e preencha com as
// informações os campos que precisam".
//
// ⚠⚠ O DOCUMENTO NÃO TEM UM FORMATO SÓ. A pasta `8. Qualidade/2. PLP` das obras tem, hoje: xlsx no
// modelo do cliente (OP-105, OP-106) e PDF (OP-089, OP-094). O leitor de planilha que existia
// (lib/plp-servidor) só entende o modelo Torg de três folhas — rodado nas planilhas reais das
// OP-105 e OP-106 devolve tudo vazio, sem erro. Por isso a leitura aqui é por IA: o que varia é o
// layout, não a informação.
//
// ⚠ NÃO INVENTA. Campo que o documento não traz volta null e a tela mostra em branco para a
// Qualidade preencher. Num plano de pintura, um valor plausível e errado (uma espessura, um grau
// de limpeza) é pior que um campo vazio: ele é aplicado na obra inteira.
import Anthropic from "@anthropic-ai/sdk";
import { numeroBR } from "@/lib/numero-br";
import { Esquema, pedirJson } from "@/lib/ia-json";

const MODELO = "claude-sonnet-4-6";

const SYSTEM = `Você lê PLANOS DE PINTURA (PLP) de estruturas metálicas e extrai os campos de controle.
O documento pode estar em qualquer layout: modelo da Torg, modelo do cliente, PDF digitalizado ou planilha.
Texto que o documento não traz fica vazio (""); número que ele não traz é null.

Campos:
- revisao: a revisão do documento ("0", "1", "R00"...).
- preparoMetodo: como a superfície é preparada, um destes quando reconhecer: "Jateamento abrasivo", "Produtos químicos", "Ferramentas manuais e/ou mecânicas".
- grauLimpeza: o grau da norma, como "SA1", "SA2", "SA2.5", "SA3" (Sa 2 1/2 = "SA2.5").
- abrasivo: o abrasivo citado (granalha, óxido de alumínio...).
- rugosidadeMin / rugosidadeMax: a faixa de rugosidade em micrometros. null se não houver.
- metodoAplicacao: como a tinta é aplicada (airless, convencional, pincel/rolo).
- demaos: as demãos do esquema, na ordem, cada uma { ordem (1,2,3...), nome ("Fundo","Intermediária","Acabamento" ou o que o documento chamar), produto (nome comercial da tinta), fabricante, cor, espessuraMin, espessuraMax (espessura SECA por demão, em micrometros) }.
- espessuraTotal: a espessura seca total do sistema em micrometros. null se não houver.
- itens: os itens da estrutura com a cor de cada um, cada um { item (o que é: "Colunas", "Vigas", "Guarda-corpo"...), sistema (a sigla do sistema de pintura, se houver), cor, obs }. Lista vazia se o documento não relacionar itens.
- observacoes: observações relevantes do plano (retoques, faixas, exigências do cliente), em texto corrido.

REGRAS:
- Não invente: o que o documento não disser fica vazio (ou null, ou lista vazia). Num plano de pintura, um valor plausível e errado (uma espessura, um grau de limpeza) é pior que um campo vazio, porque é aplicado na obra inteira.
- Espessura em micrometros (µm). Se o documento estiver em mils, converta (1 mil = 25,4 µm) e diga na observação.
- Se houver mais de um sistema de pintura, use o principal em "demaos" e descreva os demais em "observacoes".`;

const METODOS_PREPARO = ["Jateamento abrasivo", "Produtos químicos", "Ferramentas manuais e/ou mecânicas"];

// ⚠ Texto ausente vem VAZIO, não null: os campos "ou null" do PLP passariam do teto de 16 por schema
// da API. `txt()` já trata "" como ausente; os números seguem "ou null".
export const ESQUEMA_PLP = Esquema.objeto({
  revisao: Esquema.texto,
  preparoMetodo: Esquema.umDe([...METODOS_PREPARO, ""]),
  grauLimpeza: Esquema.texto,
  abrasivo: Esquema.texto,
  rugosidadeMin: Esquema.numeroOuNulo,
  rugosidadeMax: Esquema.numeroOuNulo,
  metodoAplicacao: Esquema.texto,
  demaos: Esquema.lista(Esquema.objeto({
    ordem: Esquema.inteiro, nome: Esquema.texto, produto: Esquema.texto, fabricante: Esquema.texto, cor: Esquema.texto,
    espessuraMin: Esquema.numeroOuNulo, espessuraMax: Esquema.numeroOuNulo,
  })),
  espessuraTotal: Esquema.numeroOuNulo,
  itens: Esquema.lista(Esquema.objeto({ item: Esquema.texto, sistema: Esquema.texto, cor: Esquema.texto, obs: Esquema.texto })),
  observacoes: Esquema.texto,
});

// o schema não garante a caixa das letras do valor escolhido — e o <select> da tela compara exato
const metodoCanonico = (v) => METODOS_PREPARO.find((m) => m.toLowerCase() === String(v || "").trim().toLowerCase()) || v;

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = numeroBR(v, NaN);
  return Number.isFinite(n) ? n : null;
};
const txt = (v, max = 160) => (v === null || v === undefined ? null : String(v).trim().slice(0, max) || null);

/**
 * @param {{ data: Buffer|string, contentType: string, texto?: string, arquivo?: string }} input
 * @returns {Promise<object|null>} campos do PLP, prontos para normalizarPlp()
 */
export async function extrairPlp({ data, contentType, texto, arquivo }) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY não configurada.");
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const content = [];
  if (arquivo) content.push({ type: "text", text: `Arquivo: ${arquivo}` });
  if (texto && texto.trim()) {
    // planilha: vai como TEXTO (a API não lê xlsx), com as células já achatadas
    content.push({ type: "text", text: texto.slice(0, 120000) });
  } else if (contentType === "application/pdf") {
    const b64 = Buffer.isBuffer(data) ? data.toString("base64") : String(data).split(",").pop();
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } });
  } else if (/^image\//.test(contentType || "")) {
    const b64 = Buffer.isBuffer(data) ? data.toString("base64") : String(data).split(",").pop();
    content.push({ type: "image", source: { type: "base64", media_type: contentType, data: b64 } });
  } else {
    throw new Error(`Não sei ler "${contentType || "arquivo sem tipo"}".`);
  }
  content.push({ type: "text", text: "Extraia os campos do plano de pintura deste documento." });

  const { dados: j } = await pedirJson(anthropic, { model: MODELO, max_tokens: 4000, system: SYSTEM, messages: [{ role: "user", content }], formato: ESQUEMA_PLP });
  if (!j) return null;

  return {
    revisao: txt(j.revisao, 30),
    preparoMetodo: txt(metodoCanonico(j.preparoMetodo), 80),
    grauLimpeza: txt(j.grauLimpeza, 20),
    abrasivo: txt(j.abrasivo, 80),
    rugosidadeMin: num(j.rugosidadeMin),
    rugosidadeMax: num(j.rugosidadeMax),
    metodoAplicacao: txt(j.metodoAplicacao, 60),
    espessuraTotal: num(j.espessuraTotal),
    demaos: (Array.isArray(j.demaos) ? j.demaos : []).slice(0, 6).map((d, i) => ({
      ordem: Number(d?.ordem) || i + 1,
      nome: txt(d?.nome, 60) || `${i + 1}ª demão`,
      produto: txt(d?.produto),
      fabricante: txt(d?.fabricante, 80),
      cor: txt(d?.cor, 60),
      espessuraMin: num(d?.espessuraMin),
      espessuraMax: num(d?.espessuraMax),
    })),
    itens: (Array.isArray(j.itens) ? j.itens : []).slice(0, 60).map((i) => ({
      item: txt(i?.item, 120), sistema: txt(i?.sistema, 20), cor: txt(i?.cor, 60), obs: txt(i?.obs, 200),
    })).filter((i) => i.item),
    observacoes: txt(j.observacoes, 2000),
  };
}
