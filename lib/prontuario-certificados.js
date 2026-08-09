import "server-only";
import { getAccessToken } from "@/lib/sharepoint";
import { REGRAS_DOCUMENTOS } from "@/lib/regras-documentos";

// Varredura dos CERTIFICADOS de treinamento nos Prontuários Eletrônicos do SharePoint
// (RH Torg + RH VMI). Cada colaborador tem uma pasta com uma subpasta "Treinamentos" com os
// PDFs dos certificados. Devolve [{colab, empresa, nr, arquivo, data}] — a `data` é a mais
// antiga entre criação/modificação do arquivo (o "registro na pasta"). Com cache (a varredura
// é pesada: ~500 arquivos em pastas aninhadas). Usado pela aba de Treinamentos (quem fez cada NR).

const GRAPH = "https://graph.microsoft.com/v1.0";
const ROOTS = [
  { empresa: "TORG", path: "/RH/01. RH Torg/COLABORADORES ATIVOS TORG/Prontuário Eletrônico Colaboradores" },
  { empresa: "VMI", path: "/RH/02. RH VMI/Prontuario Eletrônico Colaboradores Ativos VMI" },
];

// Nome do arquivo → NR (ou tipo). Cobre NR.06 / NR_06 / NR-06, e Ficha EPI / O.S.
export function nrDoArquivo(nome) {
  const n = String(nome || "");
  const m = n.match(/NR[\s._-]?(\d{1,2})/i);
  if (m) return "NR-" + m[1].padStart(2, "0");
  if (/ficha.*epi|(^|[^a-z])epi([^a-z]|$)/i.test(n)) return "NR-06";     // Ficha de EPI → NR-06
  if (/o\.?\s?s[._ ]?i?\.?\s?s|ordem de servi|integra/i.test(n)) return "NR-01"; // O.S / Integração → NR-01
  return null;
}

async function listar(token, driveId, path) {
  const url = `${GRAPH}/drives/${driveId}/root:${encodeURI(path)}:/children?$select=name,folder,file,lastModifiedDateTime,createdDateTime&$top=200`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return [];
  return (await r.json()).value || [];
}

const dataArquivo = (a) => {
  const ds = [a.lastModifiedDateTime, a.createdDateTime].filter(Boolean).map((x) => new Date(x));
  if (!ds.length) return null;
  return new Date(Math.min(...ds.map((d) => d.getTime()))).toISOString(); // o registro mais antigo
};

let cache = { at: 0, data: null };
const TTL = 15 * 60 * 1000;

/** @returns {Promise<Array<{colab,empresa,nr,arquivo,data}>>} */
export async function escanearCertificados() {
  if (cache.data && Date.now() - cache.at < TTL) return cache.data;
  const token = await getAccessToken();
  const driveId = process.env.SHAREPOINT_DRIVE_ID;
  const out = [];

  async function walk(path, colabPai, depth) {
    if (depth > 4) return;
    let items;
    try { items = await listar(token, driveId, path); } catch { return; }
    for (const it of items) {
      if (!it.folder) continue;
      if (/treinamento/i.test(it.name)) {
        // pasta de certificados — o colaborador é a pasta-pai (colabPai)
        let arqs;
        try { arqs = await listar(token, driveId, `${path}/${it.name}`); } catch { continue; }
        for (const a of arqs) {
          if (!a.file) continue;
          out.push({ colab: colabPai, arquivo: a.name, nr: nrDoArquivo(a.name), data: dataArquivo(a) });
        }
      } else {
        await walk(`${path}/${it.name}`, it.name, depth + 1); // esta pasta é o colaborador-candidato
      }
    }
  }

  for (const root of ROOTS) {
    const before = out.length;
    await walk(root.path, null, 0);
    for (let i = before; i < out.length; i++) out[i].empresa = root.empresa;
  }

  cache = { at: Date.now(), data: out };
  return out;
}

export function limparCacheCertificados() { cache = { at: 0, data: null }; }

// ── Prontuário como fonte da Conformidade CCT / Matriz de Competência ──────────
// Só os certificados que correspondem a uma regra da CCT viram documento. Os demais
// (NR-05, NR-07, NR-09, NR-11, NR-18…) aparecem no plano de treinamentos, mas não
// entram na conformidade (a Torg não os exige na CCT).
export const NR_PARA_TIPO = {
  "NR-12": "NR_12",        // Segurança em Máquinas
  "NR-35": "NR_35",        // Trabalho em Altura
  "NR-01": "INTEGRACAO",   // O.S / Integração
  "NR-06": "FICHA_EPI",    // Ficha de EPI
};

const VALIDADE_MESES = Object.fromEntries(REGRAS_DOCUMENTOS.map((r) => [r.tipo, r.validadeMeses]));
const CATEGORIA_TIPO = Object.fromEntries(REGRAS_DOCUMENTOS.map((r) => [r.tipo, r.categoria]));
const normNome = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const primUlt = (s) => { const p = normNome(s).split(" ").filter(Boolean); return p.length >= 2 ? `${p[0]} ${p[p.length - 1]}` : normNome(s); };
const addMeses = (d, n) => { const x = new Date(d); x.setUTCMonth(x.getUTCMonth() + n); return x; };

/**
 * Cruza os certificados do prontuário com uma lista de funcionários ({id, nome}) e
 * devolve, por funcionário, os documentos-equivalentes da CCT (tipo, dataEmissao,
 * dataValidade = data do certificado + reciclagem da NR). Fonte única de treinamentos.
 * @param {Array<{id:string,nome:string}>} funcionarios
 * @returns {Promise<{docsPorFunc: Map<string, Array>, comProntuario: Set<string>}>}
 */
export async function documentosDeProntuario(funcionarios) {
  const certs = await escanearCertificados();
  const porNome = new Map(), porPU = new Map();
  for (const f of funcionarios) { porNome.set(normNome(f.nome), f); porPU.set(primUlt(f.nome), f); }
  const casar = (colab) => porNome.get(normNome(colab)) || porPU.get(primUlt(colab)) || null;

  const comProntuario = new Set();
  const best = new Map(); // funcId|tipo -> { funcId, tipo, emis(ISO), empresa }
  for (const c of certs) {
    if (!c.colab) continue;
    const f = casar(c.colab);
    if (!f) continue;
    comProntuario.add(f.id);            // tem pasta de prontuário (qualquer certificado)
    const tipo = NR_PARA_TIPO[c.nr];
    if (!tipo || !c.data) continue;     // só os que viram documento da CCT
    const key = `${f.id}|${tipo}`;
    const prev = best.get(key);
    if (!prev || c.data > prev.emis) best.set(key, { funcId: f.id, tipo, emis: c.data, empresa: c.empresa });
  }

  const docsPorFunc = new Map();
  for (const { funcId, tipo, emis, empresa } of best.values()) {
    const vm = VALIDADE_MESES[tipo] ?? null;
    const dataEmissao = new Date(emis);
    const dataValidade = vm ? addMeses(dataEmissao, vm) : null;
    if (!docsPorFunc.has(funcId)) docsPorFunc.set(funcId, []);
    docsPorFunc.get(funcId).push({
      id: `prontuario-${tipo}-${funcId}`,
      tipo,
      nome: `Certificado ${tipo.replace("_", "-")} (prontuário ${empresa || ""})`.trim(),
      categoria: CATEGORIA_TIPO[tipo] || "TREINAMENTO",
      dataEmissao,
      dataValidade,
      createdAt: dataEmissao,
      ativo: true,
      origem: "prontuario",
    });
  }
  return { docsPorFunc, comProntuario };
}
