import { z } from "zod";

export const opcoesEnvioCronogramaSchema = z.object({
  tipoEnvio: z.enum(["INICIAL", "ANDAMENTO", "REVISAO"]),
  tituloCliente: z.string().trim().min(1, "Informe o título para o cliente.").max(180),
  revisao: z.string().trim().max(30).regex(/^[\p{L}\p{N} ._-]*$/u, "Use letras, números, espaço, ponto ou hífen na revisão.").default(""),
  resumoAlteracoes: z.string().trim().max(3000).default(""),
  mensagem: z.string().trim().max(2000).nullish(),
}).superRefine((v, ctx) => {
  if (v.tipoEnvio === "REVISAO" && !v.revisao) ctx.addIssue({ code: "custom", path: ["revisao"], message: "Informe a identificação da revisão (ex.: R02)." });
  if (v.tipoEnvio === "REVISAO" && !v.resumoAlteracoes) ctx.addIssue({ code: "custom", path: ["resumoAlteracoes"], message: "Descreva as alterações que o cliente deve receber." });
}).transform(v => v.tipoEnvio === "REVISAO" ? v : { ...v, revisao: "", resumoAlteracoes: "" });

const iso = d => d && Number.isFinite(+new Date(d)) ? new Date(d).toISOString().slice(0, 10) : null;
const pct = n => Math.max(0, Math.min(100, Number(n) || 0));
export const fmtDataCronograma = d => iso(d)?.split("-").reverse().join("/") || "—";

export function resumoCronogramaEnvio(c, tarefas) {
  const folhas = tarefas.filter(t => !t.isSummary);
  const range = (key, min) => {
    const dates = folhas.map(t => iso(t[key])).filter(Boolean).sort();
    return min ? dates[0] : dates.at(-1);
  };
  // Mesma unidade de duração do portal; um marco não recebe peso artificial.
  const peso = t => {
    const a = iso(t.dataInicioPrevista), b = iso(t.dataFimPrevista);
    if (!a || !b || a >= b) return 0;
    let n = 0;
    for (let d = new Date(a); d <= new Date(b); d.setUTCDate(d.getUTCDate() + 1)) {
      if (c.tipoDias === "DC" || ![0, 6].includes(d.getUTCDay())) n++;
    }
    return n;
  };
  const totalPeso = folhas.reduce((s,t) => s + peso(t), 0);
  return {
    inicio: range("dataInicioPrevista", true) || iso(c.dataInicio),
    fim: range("dataFimPrevista", false) || iso(c.dataFim),
    fimBase: range("dataFimBase", false),
    percentual: totalPeso ? Math.round(folhas.reduce((s,t) => s + peso(t) * pct(t.percentualRealizado), 0) / totalPeso) : null,
    total: folhas.length,
    concluidas: folhas.filter(t => pct(t.percentualRealizado) === 100).length,
  };
}

/** Cópias exclusivas para envio: o histórico e a baseline no banco ficam intactos. */
export function prepararDadosCronogramaEnvio(c, tarefas, opcoes) {
  const comparar = opcoes.tipoEnvio === "REVISAO";
  const titulo = opcoes.tituloCliente + (comparar ? ` · Revisão ${opcoes.revisao}` : "");
  const resumo = resumoCronogramaEnvio(c, tarefas);
  const copia = {
    ...c, titulo, nomeArquivo: titulo,
    dataInicio: resumo.inicio || c.dataInicio, dataFim: resumo.fim || c.dataFim,
    dataBase: comparar ? c.dataBase : null,
  };
  const publicas = tarefas.map(t => comparar ? { ...t } : { ...t, dataInicioBase: null, dataFimBase: null });
  const slug = v => String(v || "obra").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.-]+/g, "-");
  const nome = `Cronograma_OP-${slug(c.opNumero || c.op?.numero)}${comparar ? `_${slug(opcoes.revisao)}` : ""}`;
  return { cronograma: copia, tarefas: publicas, resumo, nomes: { pdf: `${nome}.pdf`, xml: `${nome}.xml` } };
}
