// PDF da Análise Crítica de Projeto (PO-13) — é o FORM 08 emitido pelo portal (Rev.02).
// Padrão Torg dos outros PDFs (faixa navy + filete laranja, logo branco, rodapé do SGQ).
// Sai do REGISTRO da aba Engenharia; nada é digitado aqui.
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { refFORM } from "@/lib/sgq-forms";
import { SITUACOES, SITUACAO_ACAO, STATUS_REGISTRO, nivelRisco } from "@/lib/analise-critica";
import { fmtOP } from "@/lib/utils";

const A4 = [595.28, 841.89], M = 40, W = A4[0] - M * 2;
const NAVY = rgb(0.051, 0.122, 0.235), ORANGE = rgb(0.957, 0.502, 0.122), DARK = rgb(0.1, 0.13, 0.18), GRAY = rgb(0.45, 0.5, 0.56), LINE = rgb(0.85, 0.88, 0.91), LIGHT = rgb(0.96, 0.97, 0.98), WHITE = rgb(1, 1, 1);
const RED = rgb(0.75, 0.22, 0.17), AMBER = rgb(0.79, 0.54, 0), GREEN = rgb(0.11, 0.56, 0.35);

const dataBR = (iso) => { if (!iso) return "—"; const d = new Date(iso); return isNaN(d) ? String(iso) : `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`; };
const dataCurta = (s) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : s || "—");
const corSituacao = (s) => (s === "OK" ? GREEN : s === "CONFLITO" ? RED : s === "ATENCAO" || s === "PENDENTE" ? AMBER : GRAY);

export async function gerarAnaliseCriticaPDF({ op, registro, verificacoes = [], resumo }) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo = null;
  try { logo = await pdf.embedPng(fs.readFileSync(path.join(process.cwd(), "public", "torg-logo-white.png"))); } catch { /* sem logo */ }
  const codigo = `ACP-${String(op.numero).replace(/^0+/, "").padStart(3, "0")} R${registro.revisao || 0}`;
  // Helvetica padrão só tem Latin-1: troca o que a tela usa (×, ≥, travessão, seta) antes de descartar o resto
  const san = (s) => String(s ?? "").replace(/×/g, "x").replace(/≥/g, ">=").replace(/≤/g, "<=").replace(/[–—]/g, "-").replace(/→/g, "->").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
  const wid = (s, f, size) => f.widthOfTextAtSize(san(s), size);
  const quebra = (s, f, size, max) => {
    const out = []; for (const par of san(s).split(/\n/)) { let linha = "";
      for (const pal of par.split(/\s+/)) { const t = linha ? `${linha} ${pal}` : pal; if (f.widthOfTextAtSize(t, size) <= max || !linha) linha = t; else { out.push(linha); linha = pal; } }
      out.push(linha); }
    return out.length ? out : [""];
  };
  let page, y, nPag = 0;
  const txt = (s, x, yy, { f = font, size = 8.5, color = DARK } = {}) => page.drawText(san(s), { x, y: yy, size, font: f, color });
  const rodape = () => {
    txt(refFORM(8), M, 26, { size: 7.5, color: GRAY });
    const nota = "ESTE DOCUMENTO FAZ PARTE DO SISTEMA DE GESTAO DA QUALIDADE";
    txt(nota, A4[0] / 2 - wid(nota, font, 6.5) / 2, 26, { size: 6.5, color: GRAY });
    const pg = `pag. ${nPag}`; txt(pg, A4[0] - M - wid(pg, font, 7.5), 26, { size: 7.5, color: GRAY });
  };
  const cabecalho = () => {
    page.drawRectangle({ x: 0, y: A4[1] - 84, width: A4[0], height: 84, color: NAVY });
    page.drawRectangle({ x: 0, y: A4[1] - 90, width: A4[0], height: 6, color: ORANGE });
    if (logo) { const lw = 104, lh = (logo.height / logo.width) * lw; page.drawImage(logo, { x: M, y: A4[1] - 26 - lh, width: lw, height: lh }); } else txt("TORG METAL", M, A4[1] - 48, { f: bold, size: 16, color: WHITE });
    const t1 = "ANALISE CRITICA DE PROJETO", t2 = "Engenharia, Projeto e Desenvolvimento - PO-13";
    txt(t1, A4[0] - M - wid(t1, bold, 13), A4[1] - 38, { f: bold, size: 13, color: WHITE });
    txt(t2, A4[0] - M - wid(t2, font, 8.5), A4[1] - 52, { size: 8.5, color: WHITE });
    txt(codigo, A4[0] - M - wid(codigo, bold, 10.5), A4[1] - 70, { f: bold, size: 10.5, color: ORANGE });
  };
  const novaPagina = () => { page = pdf.addPage(A4); nPag++; cabecalho(); rodape(); y = A4[1] - 110; };
  const espaco = (h) => { if (y - h < 48) novaPagina(); };
  const titulo = (n, t, sub) => { espaco(30); page.drawRectangle({ x: M, y: y - 4, width: 16, height: 14, color: NAVY }); txt(String(n), M + 5, y - 1, { f: bold, size: 8.5, color: WHITE }); txt(t, M + 22, y, { f: bold, size: 10.5, color: NAVY }); if (sub) txt(sub, M + 22 + wid(t, bold, 10.5) + 6, y + 0.5, { size: 7.5, color: GRAY }); y -= 16; };
  // tabela com texto que quebra; `cols` = [{ t, w (fração), get, cor }]
  const tabela = (cols, linhas, { vazio = "Nenhuma linha." } = {}) => {
    const larg = cols.map((c) => c.w * W), size = 7.6, lh = 9.4, pad = 3;
    const cab = () => { page.drawRectangle({ x: M, y: y - 11, width: W, height: 13, color: LIGHT }); let x = M; cols.forEach((c, i) => { txt(c.t.toUpperCase(), x + pad, y - 8, { f: bold, size: 6.5, color: GRAY }); x += larg[i]; }); y -= 15; };
    espaco(40); cab();
    if (!linhas.length) { txt(vazio, M + pad, y - 8, { size, color: GRAY }); y -= 14; return; }
    for (const l of linhas) {
      const cel = cols.map((c, i) => quebra(c.get(l), font, size, larg[i] - pad * 2));
      const h = Math.max(...cel.map((c) => c.length)) * lh + pad * 2;
      if (y - h < 48) { novaPagina(); cab(); }
      let x = M;
      cols.forEach((c, i) => { cel[i].forEach((linha, j) => txt(linha, x + pad, y - pad - 7 - j * lh, { size, color: c.cor ? c.cor(l) : DARK, f: c.negrito ? bold : font })); x += larg[i]; });
      page.drawLine({ start: { x: M, y: y - h }, end: { x: M + W, y: y - h }, thickness: 0.4, color: LINE });
      y -= h;
    }
    y -= 8;
  };
  const sit = (s) => SITUACOES[s]?.label || s || "—";

  novaPagina();
  // ── identificação ──
  page.drawRectangle({ x: M, y: y - 58, width: W, height: 62, color: LIGHT, borderColor: LINE, borderWidth: 0.5 });
  const campo = (rot, val, x, yy, w) => { txt(rot.toUpperCase(), x, yy, { f: bold, size: 6.3, color: GRAY }); txt(quebra(val, bold, 8.5, w)[0], x, yy - 10, { f: bold, size: 8.5 }); };
  campo("OP", fmtOP(op.numero), M + 8, y - 8, 70); campo("Cliente", op.cliente || "—", M + 80, y - 8, 190); campo("Obra", op.obra || "—", M + 280, y - 8, 230);
  campo("Responsável (Eng. de Projeto)", registro.responsavelNome || "—", M + 8, y - 34, 160); campo("Aberto em", dataBR(registro.abertoEm), M + 180, y - 34, 70);
  campo("Situação", STATUS_REGISTRO[registro.status]?.label || registro.status, M + 260, y - 34, 90);
  campo("Aprovação (Diretor Técnico)", registro.aprovadoPorNome ? `${registro.aprovadoPorNome} em ${dataBR(registro.aprovadoEm)}` : "pendente", M + 360, y - 34, 150);
  y -= 70;
  if (resumo) { const r = resumo; const linha = `Entradas ${r.entradas.ok}/${r.entradas.total} adequadas · Requisitos ${r.requisitos.total} (${r.requisitos.ok} ok, ${r.requisitos.pendentes} pendentes, ${r.requisitos.conflito} em conflito) · Saídas verificadas ${r.saidas.ok}/${r.saidas.total} · Riscos ${r.riscos.total} (${r.riscos.altos} altos) · Ações ${r.acoes.abertas} abertas, ${r.acoes.atrasadas} atrasadas`; txt(linha, M, y, { size: 7.8, color: GRAY }); y -= 18; }

  titulo(1, "Entradas do projeto", "PO-13 §5.2 e Nota 1");
  tabela([{ t: "Documento", w: 0.3, get: (l) => l.documento }, { t: "Rev.", w: 0.07, get: (l) => l.revisao || "—" }, { t: "Analisado por", w: 0.17, get: (l) => `${l.analisadoPor || "—"}${l.data ? " · " + dataCurta(l.data) : ""}` }, { t: "Achado", w: 0.34, get: (l) => l.achado || "—" }, { t: "Situação", w: 0.12, get: (l) => sit(l.situacao), cor: (l) => corSituacao(l.situacao), negrito: true }], registro.entradas || []);

  titulo(2, "Requisitos extraídos", "PO-13 Nota 1 e Nota 2 (a)");
  tabela([{ t: "#", w: 0.07, get: (l) => l.codigo || "" }, { t: "Requisito", w: 0.31, get: (l) => l.requisito }, { t: "Origem", w: 0.14, get: (l) => l.origem || "—" }, { t: "Evidência", w: 0.26, get: (l) => l.evidencia || "—" }, { t: "Dono", w: 0.1, get: (l) => l.dono || "—" }, { t: "Situação", w: 0.12, get: (l) => sit(l.situacao), cor: (l) => corSituacao(l.situacao), negrito: true }], registro.requisitos || [], { vazio: "Nenhum requisito registrado." });

  titulo(3, "Análise por área", "PO-13 §5.3");
  tabela([{ t: "Área", w: 0.2, get: (l) => l.area }, { t: "Setor · procedimento", w: 0.18, get: (l) => [l.setor, l.procedimento].filter(Boolean).join(" · ") || "—" }, { t: "Responsável", w: 0.14, get: (l) => l.responsavel || "—" }, { t: "Parecer", w: 0.36, get: (l) => l.parecer || "—" }, { t: "Situação", w: 0.12, get: (l) => sit(l.situacao), cor: (l) => corSituacao(l.situacao), negrito: true }], registro.areas || []);

  titulo(4, "Riscos do projeto", "FORM 06 · probabilidade x impacto (1-4)");
  tabela([{ t: "Nível", w: 0.07, get: (l) => String(nivelRisco(l)), negrito: true, cor: (l) => (nivelRisco(l) >= 9 ? RED : nivelRisco(l) >= 4 ? AMBER : GREEN) }, { t: "Risco", w: 0.38, get: (l) => l.risco }, { t: "P x I", w: 0.08, get: (l) => `${l.probabilidade} x ${l.impacto}` }, { t: "Tratativa / ação", w: 0.47, get: (l) => l.tratativa || "—" }], registro.riscos || [], { vazio: "Nenhum risco registrado." });

  titulo(5, "Verificação das saídas", "PO-13 Nota 2 e §5.5 · linhas do FORM 08");
  const auto = verificacoes.map((v) => ({ documento: `${v.titulo} (automática)`, revisao: "—", verificacao: v.resultado, verificadoPor: "portal", data: "", situacao: v.situacao }));
  tabela([{ t: "Saída", w: 0.26, get: (l) => l.documento }, { t: "Rev.", w: 0.08, get: (l) => l.revisao || "—" }, { t: "Verificação", w: 0.36, get: (l) => l.verificacao || "—" }, { t: "Por / data", w: 0.18, get: (l) => `${l.verificadoPor || "—"}${l.data ? " · " + dataCurta(l.data) : ""}` }, { t: "Situação", w: 0.12, get: (l) => sit(l.situacao), cor: (l) => corSituacao(l.situacao), negrito: true }], [...auto, ...(registro.saidas || [])]);

  titulo(6, "Comentários do cliente e alterações de projeto", "PO-13 Nota 3 e §5.7");
  tabela([{ t: "Data", w: 0.08, get: (l) => dataCurta(l.data) }, { t: "Origem", w: 0.14, get: (l) => l.origem || "—" }, { t: "Comentário / alteração", w: 0.28, get: (l) => l.texto }, { t: "Análise", w: 0.24, get: (l) => l.analise || "—" }, { t: "Impacto", w: 0.14, get: (l) => l.impacto || "—" }, { t: "Situação", w: 0.12, get: (l) => sit(l.situacao), cor: (l) => corSituacao(l.situacao), negrito: true }], registro.comentarios || [], { vazio: "Nenhum comentário ou alteração." });

  titulo(7, "Reuniões de análise crítica e ações", "PO-13 §5.3 (FORM 10) · plano 5W2H");
  tabela([{ t: "Reunião", w: 0.1, get: (l) => l.codigo || "—" }, { t: "Data", w: 0.08, get: (l) => dataCurta(l.data) }, { t: "Participantes", w: 0.24, get: (l) => l.participantes || "—" }, { t: "Pauta e decisões", w: 0.48, get: (l) => [l.pauta, l.decisoes].filter(Boolean).join("\n") || "—" }, { t: "Ata", w: 0.1, get: (l) => (l.ataAceita ? "aceita" : "—") }], registro.reunioes || [], { vazio: "Nenhuma reunião registrada." });
  tabela([{ t: "Ação", w: 0.1, get: (l) => l.codigo || "—" }, { t: "O que", w: 0.5, get: (l) => l.acao }, { t: "Quem", w: 0.16, get: (l) => l.quem || "—" }, { t: "Quando", w: 0.12, get: (l) => dataCurta(l.quando) }, { t: "Situação", w: 0.12, get: (l) => SITUACAO_ACAO[l.situacao]?.label || l.situacao || "—" }], registro.acoes || [], { vazio: "Nenhuma ação." });

  // ── assinaturas ──
  espaco(70);
  y -= 10;
  const ass = (rot, nome, x) => { page.drawLine({ start: { x, y }, end: { x: x + 220, y }, thickness: 0.6, color: DARK }); txt(rot, x, y - 10, { f: bold, size: 7, color: GRAY }); txt(nome || "", x, y - 20, { size: 8 }); };
  ass("ENGENHEIRO DE PROJETO - verificação (PO-13 §5.5)", registro.responsavelNome, M);
  ass("DIRETOR TÉCNICO - aprovação", registro.aprovadoPorNome ? `${registro.aprovadoPorNome} · ${dataBR(registro.aprovadoEm)}` : "", M + 275);
  y -= 34;
  txt(`Emitido pelo portal em ${dataBR(new Date())} a partir do registro ${codigo}. Revisões anteriores ficam no histórico do registro.`, M, y, { size: 7, color: GRAY });

  const bytes = await pdf.save();
  return { bytes, filename: `FORM 08 - Analise Critica de Projeto ${fmtOP(op.numero)} R${registro.revisao || 0}.pdf` };
}
