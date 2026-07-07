// Geração da proposta de serviço (.docx) no padrão PTC da Torg. Preenche uma
// cópia do template (proposta-template-b64) com os dados do orçamento: só entram
// os serviços selecionados (blocos condicionais), nomes dos arquivos anexados,
// perfis do corte, CQ por serviço e dias de pagamento. Compartilhado pelas rotas
// de baixar (.docx / .pdf) e de enviar ao cliente.
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { TEMPLATE_B64 } from "@/lib/proposta-template-b64";

const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
const fmtBRL = (v) => num(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtKg = (v) => num(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const LABEL = { CORTE_FURACAO: "Corte a laser", SOLDA: "Solda", JATEAMENTO: "Jateamento", PINTURA: "Pintura" };
const ESCOPO = { CORTE_FURACAO: "corte a laser, furação e recorte de vigas", SOLDA: "solda de componentes", JATEAMENTO: "jateamento de peças", PINTURA: "pintura industrial de peças" };

export function numeroPtcDe(o) {
  return `PTC-${String(o.numero || 0).padStart(3, "0")}-26`;
}

// Monta o objeto de dados que o template espera, a partir do orçamento.
export function dadosProposta(o, now) {
  const servs = Array.isArray(o.servicos) ? o.servicos : [];
  const has = (k) => servs.includes(k);

  const comp = (o.composicao && o.composicao.CORTE_FURACAO) || {};
  const linhas = Array.isArray(comp.linhas) ? comp.linhas : [];
  const peso = linhas.reduce((a, l) => a + num(l.pesoKgM) * num(l.comprimento) * num(l.qtdBarras), 0);
  const barras = linhas.reduce((a, l) => a + num(l.qtdBarras), 0);
  const tempoMin = linhas.reduce((a, l) => a + num(l.tempoMinBarra) * num(l.qtdBarras), 0);
  const metodo = comp.metodoPreco === "KG" ? "KG" : "HORA";
  const custoCorte = metodo === "KG" ? peso * num(comp.precoKg) : (tempoMin / 60) * num(comp.valorHora);
  const rkg = peso > 0 ? custoCorte / peso : 0;
  const perfisTxt = linhas.filter((l) => l.perfil).map((l) => `${l.perfil} (${num(l.qtdBarras)})`).join(", ");

  const valores = { CORTE_FURACAO: custoCorte };
  const servicos = servs.map((s, i) => {
    const isCorte = s === "CORTE_FURACAO";
    return {
      item: String(i + 1).padStart(2, "0"),
      nome: LABEL[s] || s,
      unid: "kg",
      qtd: isCorte ? fmtKg(peso) : "",
      vu: isCorte && rkg ? fmtBRL(rkg) : "",
      vt: valores[s] ? fmtBRL(valores[s]) : "a definir",
    };
  });
  const valorTotal = servs.reduce((a, s) => a + num(valores[s]), 0);

  const escopo = servs.map((s) => ESCOPO[s]).filter(Boolean).join(", ") || "serviços conforme descrito";
  const cq = has("SOLDA")
    ? "São efetuados em nossa linha de produção inspeção dimensional e visual de soldagem."
    : "São efetuados em nossa linha de produção inspeção dimensional.";
  const docs = (Array.isArray(o.arquivos) ? o.arquivos : []).map((a) => ({ doc: a.nome || a.url || "" })).filter((x) => x.doc);

  const dataProposta = `${String(now.getDate()).padStart(2, "0")} de ${MESES[now.getMonth()].replace(/^./, (c) => c.toUpperCase())} de ${now.getFullYear()}`;

  return {
    numeroPtc: numeroPtcDe(o),
    dataProposta,
    cliente: o.cliente || "", endereco: o.endereco || "", cidadeUf: "",
    contato: o.contato || "", email: o.email || "", telefone: o.telefone || "",
    obra: o.obra || "", obraCidadeUf: "",
    escopo,
    docs,
    s_corte: has("CORTE_FURACAO"), s_solda: has("SOLDA"), s_jato: has("JATEAMENTO"), s_pintura: has("PINTURA"),
    corte_material: comp.material || "A definir",
    corte_espessura: comp.espessura || "A definir",
    corte_qtd: barras ? `${barras} barras${perfisTxt ? " — " + perfisTxt : ""} — ${fmtKg(peso)} kg` : "A definir",
    corte_modalidade: "por kg",
    cq,
    dias: String(o.diasPagamento || 15),
    servicos,
    valorTotal: fmtBRL(valorTotal),
    valorTotalNum: valorTotal,
  };
}

// Renderiza o .docx e devolve { buffer, numeroPtc, dados }.
export function gerarPropostaDocx(o, now = new Date()) {
  const dados = dadosProposta(o, now);
  const zip = new PizZip(Buffer.from(TEMPLATE_B64, "base64"));
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => "" });
  doc.render(dados);
  const buffer = doc.getZip().generate({ type: "nodebuffer" });
  return { buffer, numeroPtc: dados.numeroPtc, dados };
}
