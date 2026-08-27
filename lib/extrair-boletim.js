// ─── LER O BOLETIM TÉCNICO DA TINTA ───────────────────────────────────────────
// Vitor (27/08/2026): "ao invés de criarmos um banco de dados, na verdade eu importar um boletim
// técnico da tinta — você já conseguiria todas essas informações?".
//
// Consegue, e aqui a leitura por IA é MUITO mais confiável do que era no PLP: o boletim é um
// documento do fabricante, de um produto só, com as mesmas seções sempre (diluição, espessura,
// secagem, rendimento). O PLP variava de obra para obra e de cliente para cliente; o boletim da
// WEG tem a mesma cara do da Sherwin.
//
// ⚠⚠ A CAMADA ÚMIDA É UMA TABELA, NÃO UM NÚMERO. O boletim do INDUSTHANE traz "sem diluição 181 µm,
// 10% de diluição 200 µm, 15% 209 µm" — o mesmo produto, três valores. Quem preenche o PLP escolhe
// a diluição que vai usar e a camada úmida é consequência dela. Guardar um valor só faria o plano
// mandar aplicar espessura errada em duas das três situações.
//
// ⚠ NÃO INVENTA. Campo que o boletim não traz volta null e fica em branco no cadastro, para alguém
// completar olhando o documento. Numa tinta, um número plausível e errado vira espessura errada na
// obra inteira.
import Anthropic from "@anthropic-ai/sdk";

const MODELO = "claude-sonnet-4-6";

const SYSTEM = `Você lê BOLETINS TÉCNICOS de tintas industriais (fichas técnicas de fabricantes como WEG, Sherwin-Williams, PPG, Jotun, Hempel, Induscolor, Renner) — ou planilhas/tabelas que descrevem várias tintas — e extrai os dados que um Plano de Pintura (PLP) precisa.

O documento pode trazer UM produto (boletim técnico) ou VÁRIOS (uma tabela de tintas). Devolva sempre a lista "produtos", com um objeto por produto.

Campos de cada produto:
- fabricante: quem fabrica a tinta.
- produto: o nome comercial completo, como está no documento (ex.: "INDUSTHANE RHB DF", "W-POXI ZSP 315"). NÃO inclua a cor no nome quando ela vier separada.
- especificacao: a descrição técnica do tipo (ex.: "Tinta poliuretano dupla função, acrílico alifático à base de isocianato"). null se não houver.
- tipo: a função no esquema. Use EXATAMENTE um destes: "PRIMER" (fundo/primer), "INTERMEDIARIA", "ACABAMENTO", "UNICA" (quando o próprio boletim diz que é de dupla função / demão única). null se não der para saber.
- norma: a norma ou especificação citada (ex.: "N-2680", "ISO 12944"). null se não houver.
- diluente: o diluente indicado, com o código quando houver (ex.: "Diluente 34.019").
- diluicaoMin / diluicaoMax: a FAIXA de diluição em % (só números). Se o boletim der um valor único, use o mesmo nos dois. null se não houver.
- camadas: a tabela de espessuras, uma linha por condição de diluição — { diluicao (% , número), umida (µm, número), seca (µm, número ou null) }. Se o boletim só der uma espessura sem falar de diluição, use uma linha com diluicao: 0. Lista vazia se não houver.
- secaMin / secaMax: a espessura SECA recomendada por demão, em µm (só números). null se não houver.
- secagemToque / secagemManuseio / secagemRepintura: os tempos, como o boletim escreve (ex.: "6 h a 25 °C"). null quando não houver.
- rendimento: o rendimento teórico, como está escrito (ex.: "10,5 m²/L a 100 µm").
- solidos: o teor de sólidos, como está escrito (ex.: "72 ± 2% em volume").
- solidosVol: o teor de sólidos EM VOLUME, só o número (ex.: 72). É o dado que permite calcular a espessura úmida por EPU = EPS × (100 + %diluição) / sólidos em volume. Se o documento não trouxer o número mas trouxer a tabela de espessuras úmidas, DEDUZA o sólidos em volume a partir dela e diga na observação que foi deduzido. null se não der.
- observacoes: só o que for relevante para aplicar (intervalo entre demãos, temperatura e umidade limites, restrições). Curto. null se não houver.

REGRAS:
- NÃO INVENTE. O que o boletim não disser volta null (ou lista vazia).
- Espessuras em MICROMETROS (µm). Se o boletim usar mils, converta (1 mil = 25,4 µm) e diga na observação.
- Se o boletim cobrir mais de uma cor ou variante do mesmo produto, extraia os dados comuns e cite a variação na observação.

Responda SOMENTE com JSON válido, sem texto fora dele:
{"produtos":[{"fabricante":null,"produto":null,"especificacao":null,"tipo":null,"norma":null,"diluente":null,"diluicaoMin":null,"diluicaoMax":null,"camadas":[],"secaMin":null,"secaMax":null,"secagemToque":null,"secagemManuseio":null,"secagemRepintura":null,"rendimento":null,"solidos":null,"solidosVol":null,"observacoes":null}]}`;

function extractJson(txt) {
  if (!txt) return null;
  const fence = txt.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let s = fence ? fence[1] : txt;
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  try { return JSON.parse(s); } catch { return null; }
}

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const txt = (v, max = 160) => (v === null || v === undefined ? null : String(v).trim().slice(0, max) || null);
const TIPOS = ["PRIMER", "INTERMEDIARIA", "ACABAMENTO", "UNICA"];

/**
 * @param {{ data?: Buffer, contentType: string, texto?: string, arquivo?: string }} input
 * @returns {Promise<object[]>} um produto por item, pronto para o catálogo
 */
export async function extrairBoletim({ data, contentType, texto, arquivo }) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY não configurada.");
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const content = [];
  if (arquivo) content.push({ type: "text", text: `Arquivo: ${arquivo}` });
  const b64 = data ? (Buffer.isBuffer(data) ? data.toString("base64") : String(data).split(",").pop()) : null;
  if (texto && texto.trim()) {
    // planilha: vai como TEXTO (a API não lê xlsx), com as células já achatadas
    content.push({ type: "text", text: texto.slice(0, 100000) });
  } else if (contentType === "application/pdf") {
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } });
  } else if (/^image\//.test(contentType || "")) {
    content.push({ type: "image", source: { type: "base64", media_type: contentType, data: b64 } });
  } else {
    throw new Error(`Não sei ler "${contentType || "arquivo sem tipo"}" — envie o boletim em PDF ou imagem.`);
  }
  content.push({ type: "text", text: "Extraia os produtos deste documento." });

  const message = await anthropic.messages.create({ model: MODELO, max_tokens: 8000, system: SYSTEM, messages: [{ role: "user", content }] });
  const j = extractJson(message?.content?.[0]?.text || "");
  const lista = Array.isArray(j?.produtos) ? j.produtos : j?.produto ? [j] : [];
  return lista.slice(0, 40).map(umProduto).filter((x) => x.fabricante && x.produto);
}

function umProduto(j) {
  const tipo = String(j.tipo || "").toUpperCase();
  return {
    fabricante: txt(j.fabricante, 80),
    produto: txt(j.produto, 160),
    especificacao: txt(j.especificacao, 300),
    tipo: TIPOS.includes(tipo) ? tipo : null,
    norma: txt(j.norma, 80),
    diluente: txt(j.diluente, 120),
    diluicaoMin: num(j.diluicaoMin),
    diluicaoMax: num(j.diluicaoMax),
    camadas: (Array.isArray(j.camadas) ? j.camadas : [])
      .slice(0, 12)
      .map((c) => ({ diluicao: num(c?.diluicao) ?? 0, umida: num(c?.umida), seca: num(c?.seca) }))
      .filter((c) => c.umida || c.seca)
      // ⚠ na ordem da diluição: é assim que o boletim mostra e é assim que quem preenche procura.
      .sort((a, b) => a.diluicao - b.diluicao),
    secaMin: num(j.secaMin),
    secaMax: num(j.secaMax),
    secagemToque: txt(j.secagemToque, 80),
    secagemManuseio: txt(j.secagemManuseio, 80),
    secagemRepintura: txt(j.secagemRepintura, 80),
    rendimento: txt(j.rendimento, 120),
    solidos: txt(j.solidos, 80),
    solidosVol: num(j.solidosVol),
    observacoes: txt(j.observacoes, 1000),
  };
}
