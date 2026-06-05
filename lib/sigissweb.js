// Cliente do web service REST do SigissWeb (NFS-e municipal de Conchal).
//
// Objetivo: conciliar NFS-e de SERVIÇO emitidas direto na prefeitura (quando o
// Omie falha na emissão, o fiscal emite no portal) que não aparecem no Omie.
//
// Doc: "Manual WebService Para SigissWeb Nota Fiscal IBSCBS".
//   - REST/JSON. Login devolve token → header AUTHORIZATION nas chamadas.
//   - GET /lancamentos/pegalancamentosescriturados/{cnpj}/mes/{m}/ano/{a}/tipo/P
//       → XML <LANCAMENTOS> (nº, série, data, valor, tomador, cancelada) das
//         notas em que a Torg é PRESTADORA (tipo P) no período.
//   - GET /nfes/pegaxmlpelonumeronf/{numeronf}/serienf/{serienf}
//       → XML completo da nota (inclui <descricao> e <sistema_gerador>).
//
// Env (segredos no .env/Vercel, nunca no código):
//   SIGISS_URL    = https://wsconchal.sigissweb.com/rest
//   SIGISS_LOGIN  = CNPJ do prestador (Torg, só dígitos)
//   SIGISS_SENHA  = senha gerada no SigissWeb (Gerenciamento → Usuários → Web Serv.)
//   SIGISS_SISTEMA_OMIE = string que identifica o Omie no campo sistema_gerador
//                         (default: "omie") — usada pra detectar notas avulsas.

const BASE  = (process.env.SIGISS_URL || "").replace(/\/$/, "");
const LOGIN = (process.env.SIGISS_LOGIN || "").replace(/\D/g, "");
const SENHA = process.env.SIGISS_SENHA || "";
const TAG_OMIE = (process.env.SIGISS_SISTEMA_OMIE || "omie").toLowerCase();

export function sigissConfigurado() {
  return !!(BASE && LOGIN && SENHA);
}

// O servidor do SigissWeb serve a cadeia de certificado incompleta (falta o
// intermediário), então o Node não consegue validar (UNABLE_TO_VERIFY_LEAF_
// SIGNATURE). Usamos um dispatcher undici que não rejeita o cert, ESCOPADO
// apenas às chamadas do SigissWeb — não afeta o TLS do resto do app.
// Pode ser desligado com SIGISS_TLS_INSEGURO=false.
let _dispatcher = null;
async function getDispatcher() {
  if (process.env.SIGISS_TLS_INSEGURO === "false") return undefined;
  if (_dispatcher !== null) return _dispatcher || undefined;
  try {
    const { Agent } = await import("undici");
    _dispatcher = new Agent({ connect: { rejectUnauthorized: false } });
  } catch { _dispatcher = undefined; }
  return _dispatcher || undefined;
}

// ─── Auth ───────────────────────────────────────────────────────────────────
let tokenCache = { token: null, ts: 0 };
async function login() {
  if (tokenCache.token && Date.now() - tokenCache.ts < 25 * 60 * 1000) return tokenCache.token;
  const res = await fetch(`${BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: LOGIN, senha: SENHA }),
    dispatcher: await getDispatcher(),
    signal: AbortSignal.timeout(20000),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`SigissWeb login falhou (${res.status}): ${txt.slice(0, 160)}`);
  const token = txt.trim().replace(/^"|"$/g, ""); // pode vir como string pura ou JSON
  // Resposta de erro às vezes vem com HTTP 200 + texto → rejeita se não parecer token
  if (!token || /inv[áa]lid|senha|erro/i.test(token)) {
    throw new Error(`SigissWeb: login não retornou token (${token.slice(0, 80)})`);
  }
  tokenCache = { token, ts: Date.now() };
  return token;
}

// GET decodificando como latin1 (o retorno é ISO-8859-1)
async function getSigiss(path) {
  const token = await login();
  const res = await fetch(`${BASE}${path}`, {
    headers: { AUTHORIZATION: token },
    dispatcher: await getDispatcher(),
    signal: AbortSignal.timeout(30000),
  });
  const buf = await res.arrayBuffer();
  const txt = new TextDecoder("latin1").decode(buf);
  if (!res.ok) throw new Error(`SigissWeb ${path} → ${res.status}: ${txt.slice(0, 160)}`);
  return txt;
}

// ─── Parsing XML (extrator leve — estrutura plana e bem definida) ────────────
function pick(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1].trim() : null;
}
function pickBlocks(xml, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  const out = []; let m;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}
// Valor: aceita "1.234,56" (BR) e "1234.56" (US)
function parseValor(s) {
  if (!s) return 0;
  s = String(s).trim();
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  return parseFloat(s) || 0;
}
// Data: "DD/MM/AAAA" → ISO; também aceita "Thu Oct 10 ... 2019"
function parseData(s) {
  if (!s) return null;
  const m = String(s).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00`);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
// Extrai uma referência de obra da descrição livre da NFS-e.
// Padrões reais da Torg (em ordem de prioridade):
//   "OBRA 750 - Shopping Cidade Jardim"   → obraNum 750, nome "Shopping Cidade Jardim"
//   "OBRA: UNILEVER - AGUAI/SP"            → nome "UNILEVER - AGUAI/SP"
//   "CONTRATO PTI 067_2025"                → contrato (pista secundária)
//   "PEDIDO DE COMPRA: 152865"            → pedido (pista secundária)
//   fallback: "OP-078" / "T78A"
// Palavras que encerram o nome da obra na descrição corrida.
const FIM_OBRA = "PEDIDO|N[º°o]?\\s*CONTRATO|CONTRATO|LOCAL|ENDERE|VALOR|Valor|EMISS|Emiss|Data|CNO|Chave|Banco|Vencimento|Reten|R\\$";

export function parseObraDaDescricao(desc) {
  const vazio = { obra: null, numeroOp: null, obraNum: null, contrato: null, pedidoCompra: null };
  if (!desc) return vazio;
  const d = String(desc).replace(/\s+/g, " ").trim();

  const out = { ...vazio };
  // Neutraliza "ENDEREÇO DA OBRA" para não confundir com o nome da obra
  const dObra = d.replace(/ENDERE[ÇC]O\s+DA\s+OBRA/gi, "ENDERECO_ENTREGA");

  // Pistas secundárias (sempre tenta capturar)
  const mPed = d.match(/PEDIDO\s+DE\s+COMPRA\s*:?\s*([\d.,/ e]+?)(?=\s+[A-Z]{3,}|$)/i);
  if (mPed) out.pedidoCompra = mPed[1].trim();
  const mCon = d.match(/CONTRATO\s+(?:PTI\s+|F[IÍ]SICO\s*:?\s*|PRINCIPAL\s+)?([\w.\/-]*\d[\w.\/-]*)/i);
  if (mCon) out.contrato = mCon[1].trim();

  // 1) "OBRA [num] [-|:] nome"
  let m = dObra.match(new RegExp(`\\bOBRA\\b\\s*:?\\s*(\\d+)?\\s*[-:]?\\s*([A-Za-zÀ-ÿ][^|]*?)(?=\\s+(?:${FIM_OBRA})\\b|$)`, "i"));
  if (m && (m[1] || (m[2] && m[2].trim().length > 2))) {
    out.obraNum = m[1] || null;
    const nome = (m[2] || "").replace(/[\s-]+$/, "").trim().slice(0, 60) || null;
    out.obra = out.obraNum ? `OBRA ${out.obraNum}${nome ? " - " + nome : ""}` : nome;
    return out;
  }
  // 2) fallback OP-078
  m = d.match(/\bOP[-\s]*0*(\d+)/i);
  if (m) { out.numeroOp = String(parseInt(m[1])).padStart(3, "0"); out.obra = `OP-${m[1]}`; return out; }
  // 3) fallback T78A
  m = d.match(/\bT[-\s]*0*(\d+)\s*([A-Z])?\b/i);
  if (m) { out.numeroOp = String(parseInt(m[1])).padStart(3, "0"); out.obra = `T${m[1]}${m[2] ? m[2].toUpperCase() : ""}`; return out; }

  // 4) nada de obra, mas tem contrato/pedido → usa como rótulo
  if (out.contrato) out.obra = `Contrato ${out.contrato}`;
  else if (out.pedidoCompra) out.obra = `Pedido ${out.pedidoCompra}`;
  return out;
}

// ─── Parse do retorno <LANCAMENTOS> (escriturados) ──────────────────────────
export function parseLancamentos(xml) {
  return pickBlocks(xml, "LANCAMENTO").map(b => {
    const dest = (pickBlocks(b, "DESTINATARIO")[0]) || "";
    return {
      numero:      pick(b, "NUM_DOCU_FISCAL"),
      serie:       pick(b, "SERIE_DOCU_FISCAL"),
      data:        parseData(pick(b, "DATA")),
      cancelada:   /^s/i.test(pick(b, "CANCELADA") || ""),
      valor:       parseValor(pick(b, "VALOR_DOCU_FISCAL")),
      valorServico: parseValor(pick(b, "VALOR_SERVICOS")),
      idCodigoServico:     pick(b, "ID_CODIGO_SERVICO"),
      classificacaoServico: pick(b, "CLASSIFICACAO_SERVICO"),
      tomadorCnpj: pick(dest, "CNPJ_CPF_DEST"),
      tomadorNome: pick(dest, "NOME_DEST"),
    };
  });
}

// ─── Parse do XML completo de UMA nota (pegaxmlpelonumeronf) ─────────────────
export function parseNotaCompleta(xml) {
  const nf = pickBlocks(xml, "notafiscal")[0] || xml;
  return {
    descricao:       pick(nf, "descricao"),
    sistemaGerador:  pick(nf, "sistema_gerador"),
    nfAvulsa:        /^s/i.test(pick(nf, "nf_avulsa") || ""),
    nomeObra:        pick(nf, "nome_obra"),
  };
}

// ─── API pública ────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Itera os meses entre duas datas (inclusive)
function* meses(de, ate) {
  const d = new Date(de.getFullYear(), de.getMonth(), 1);
  const fim = new Date(ate.getFullYear(), ate.getMonth(), 1);
  while (d <= fim) {
    yield { mes: d.getMonth() + 1, ano: d.getFullYear() };
    d.setMonth(d.getMonth() + 1);
  }
}

// Enriquece UMA nota: busca o XML completo → descrição, sistema_gerador, obra.
export async function enriquecerUma(n) {
  try {
    const xml = await getSigiss(`/nfes/pegaxmlpelonumeronf/${n.numero}/serienf/${encodeURIComponent(n.serie || "")}`);
    const det = parseNotaCompleta(xml);
    n.descricao = det.descricao;
    n.sistemaGerador = det.sistemaGerador;
    n.nfAvulsa = det.nfAvulsa;
    const ob = parseObraDaDescricao(det.descricao || det.nomeObra || "");
    n.numeroOp = ob.numeroOp;
    n.obra = ob.obra;
    // Avulsa = emitida fora do Omie (sistema_gerador não é o Omie) ou marcada avulsa
    n.foraDoOmie = n.nfAvulsa || !(n.sistemaGerador || "").toLowerCase().includes(TAG_OMIE);
  } catch (_) { /* nota individual pode falhar; segue */ }
}

/**
 * Lista as NFS-e em que a Torg é PRESTADORA em Conchal no período.
 * @param {{ de: Date, ate: Date, enriquecer?: boolean, maxEnriquecer?: number }} opts
 *   enriquecer = busca o XML completo de cada nota (descrição → obra, sistema_gerador).
 *   maxEnriquecer = teto de notas a enriquecer (prioriza as mais recentes).
 * @returns {Promise<{ notas: object[], configurado: boolean, truncado: boolean }>}
 */
export async function listarNfsePrestadas({ de, ate, enriquecer = true, maxEnriquecer = 150 }) {
  if (!sigissConfigurado()) return { notas: [], configurado: false, truncado: false };

  const todas = [];
  for (const { mes, ano } of meses(de, ate)) {
    const xml = await getSigiss(`/lancamentos/pegalancamentosescriturados/${LOGIN}/mes/${mes}/ano/${ano}/tipo/P`);
    for (const n of parseLancamentos(xml)) todas.push({ ...n, mes, ano });
    await sleep(300);
  }

  let truncado = false;
  if (enriquecer) {
    todas.sort((a, b) => (b.data?.getTime() || 0) - (a.data?.getTime() || 0));
    const alvo = todas.slice(0, maxEnriquecer);
    truncado = todas.length > maxEnriquecer;
    for (const n of alvo) {
      await enriquecerUma(n);
      await sleep(120);
    }
  }

  return { notas: todas, configurado: true, truncado };
}
