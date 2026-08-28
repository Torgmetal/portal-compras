// Cálculo dos indicadores ISO de RH e Segurança do Trabalho (série mensal + acumulado do
// ano), do dado real do portal. Usado pela API do painel e pelo PDF. Os 4 da planilha:
// turnover, absenteísmo, atendimento das competências e acidentes com afastamento.
// A lógica é a mesma que a rota /api/qualidade/indicadores já usava p/ os indicadores RH.
import { INDICADORES_ISO } from "@/lib/indicadores-iso";
import { regrasParaFuncionario, checarRegraDocumento, dispensadoDocumentos } from "@/lib/regras-documentos";
import { documentosDeProntuarioSeguro, mesclarDocs } from "@/lib/prontuario-certificados";

const arr12 = () => Array.from({ length: 12 }, () => null);

// ⚠⚠ RESULTADO REGISTRADO DO LEVANTAMENTO SEMESTRAL — [1º semestre, 2º semestre] por ano.
// A reconstrução mês a mês pela janela de validade NÃO serve como resultado do semestre fechado:
// em 2026 ela devolve 69,4% em junho porque a migração do Prontuário ainda estava em curso — o
// certificado existia, só não estava no portal. O que vale é o levantamento do fechamento.
// null = sem levantamento registrado, cai na reconstrução.
// 2026 · 1º semestre = 90,7%, o atendimento apurado quando os certificados do Prontuário entraram
// (a carga levou o indicador de 66% para 90,7%). O 2º semestre segue em curso e fecha em dezembro.
const MEDICOES_COMPETENCIAS = { 2026: [90.7, null] };
const r1 = (x) => Math.round(x * 10) / 10;
const media = (serie) => { const v = serie.filter((x) => x != null); return v.length ? r1(v.reduce((s, x) => s + x, 0) / v.length) : null; };
const soma = (serie) => { const v = serie.filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) : null; };
// Dias úteis (seg–sex) do mês.
const uteisNoMes = (ano, m) => { let c = 0; const dim = new Date(Date.UTC(ano, m + 1, 0)).getUTCDate(); for (let d = 1; d <= dim; d++) { const w = new Date(Date.UTC(ano, m, d)).getUTCDay(); if (w !== 0 && w !== 6) c++; } return c; };

/** @returns { indicadores: [{...def, serie:[12], acumulado}] } */
export async function indicadoresRhIso(prisma, ano) {
  const yIni = new Date(Date.UTC(ano, 0, 1)), yFim = new Date(Date.UTC(ano + 1, 0, 1));
  const hoje = new Date();
  const mesAtual = ano < hoje.getUTCFullYear() ? 11 : ano > hoje.getUTCFullYear() ? -1 : hoje.getUTCMonth();
  const series = {}, acumulados = {};

  const funcs = await prisma.funcionario.findMany({ select: { dataAdmissao: true, dataDemissao: true } });
  const headcount = (m) => { const ini = new Date(Date.UTC(ano, m, 1)), fim = new Date(Date.UTC(ano, m + 1, 1)); return funcs.filter((f) => f.dataAdmissao < fim && (!f.dataDemissao || f.dataDemissao >= ini)).length; };

  // Turnover — ((admissões + desligamentos) ÷ 2 ÷ headcount do mês) × 100. Acum = média dos meses.
  { const s = arr12();
    for (let m = 0; m <= mesAtual; m++) {
      const ini = new Date(Date.UTC(ano, m, 1)), fim = new Date(Date.UTC(ano, m + 1, 1));
      const adm = funcs.filter((f) => f.dataAdmissao >= ini && f.dataAdmissao < fim).length;
      const dem = funcs.filter((f) => f.dataDemissao && f.dataDemissao >= ini && f.dataDemissao < fim).length;
      const hc = headcount(m); s[m] = hc > 0 ? r1(((adm + dem) / 2 / hc) * 100) : null;
    }
    series.turnover = s; acumulados.turnover = media(s); }

  // Absenteísmo — do CONTROLE DE PRESENÇA do RH (/Qualidade/Presença.xlsx), com os dois tipos de
  // ausência: falta do dia a dia e afastamento longo. Ver lib/absenteismo-planilha.
  //
  // ⚠⚠ ESTE É O PAINEL DO RH, e ele tem endpoint próprio (/api/rh/indicadores/iso). Liguei a
  // planilha só no painel geral da Qualidade e o do RH continuou no cálculo antigo — Vitor
  // (27/08/2026): "o indicador de absenteísmo do RH ainda está sem puxar os números da planilha".
  // Dois caminhos para o mesmo indicador é assim que eles divergem.
  { let s = null;
    try {
      const { absenteismoDoAno, serieAbsenteismo } = await import("@/lib/absenteismo-planilha");
      const d = await absenteismoDoAno(ano);
      if (d.achou && d.meses.length) s = serieAbsenteismo(d);
    } catch (e) { console.error("[rh-iso] absenteísmo pela planilha:", e?.message); }

    if (!s) {
      // sem a planilha, vale o cálculo antigo (afastamentos formais) em vez de deixar em branco
      const af = await prisma.afastamento.findMany({ where: { dataInicio: { gte: yIni, lt: yFim } }, select: { dataInicio: true, diasAfastado: true } });
      s = arr12();
      for (let m = 0; m <= mesAtual; m++) {
        const ini = new Date(Date.UTC(ano, m, 1)), fim = new Date(Date.UTC(ano, m + 1, 1));
        const dias = af.filter((x) => x.dataInicio >= ini && x.dataInicio < fim).reduce((a, x) => a + (x.diasAfastado || 0), 0);
        const prev = headcount(m) * uteisNoMes(ano, m); s[m] = prev > 0 ? r1((dias / prev) * 100) : null;
      }
    }
    series.absenteismo = s; acumulados.absenteismo = media(s); }

  // Acidentes com afastamento — contagem por mês (meta 0). Acum = total do ano.
  { const ac = await prisma.acidenteTrabalho.findMany({ where: { data: { gte: yIni, lt: yFim }, tipo: "COM_AFASTAMENTO" }, select: { data: true } });
    const s = arr12(); for (let m = 0; m <= mesAtual; m++) s[m] = 0;
    for (const a of ac) { const m = a.data.getUTCMonth(); if (m <= mesAtual) s[m] += 1; }
    series.acidentes_afastamento = s; acumulados.acidentes_afastamento = soma(s); }

  // Atendimento das competências — % de colaboradores CLT com TODOS os documentos obrigatórios
  // do setor em dia (documentos REAIS + regras/CCT; PJ/Diretoria fora; NRs dispensadas por
  // funcionário via DocumentoDispensa não contam — mesma lógica da tela de Compliance).
  // SÉRIE MENSAL (para auditoria/média anual): o mês ATUAL é a foto de hoje (igual ao Compliance);
  // os meses ANTERIORES são reconstruídos pela JANELA DE VALIDADE de cada documento — um doc valia
  // no mês M se M cai entre a emissão (dataEmissao, ou validade − validadeMeses) e a validade. Só
  // conta quem já estava admitido no mês; dispensas refletem a função (aplicadas a todos os meses).
  { const [fs, dispRows] = await Promise.all([
      prisma.funcionario.findMany({ where: { ativo: true }, select: { id: true, nome: true, tipoContrato: true, dataAdmissao: true, setor: { select: { nome: true } }, cargo: { select: { nome: true } }, documentos: { where: { ativo: true }, select: { tipo: true, dataEmissao: true, dataValidade: true, createdAt: true } } } }),
      prisma.documentoDispensa.findMany({ select: { funcionarioId: true, tipo: true } }),
    ]);
    const dispMap = new Map();
    for (const d of dispRows) { if (!dispMap.has(d.funcionarioId)) dispMap.set(d.funcionarioId, new Set()); dispMap.get(d.funcionarioId).add(d.tipo); }
    // Certificados do Prontuário Eletrônico entram como documentos (NR-12/NR-35/Integração/Ficha EPI).
    // Cobertura: só medimos quem JÁ está no prontuário (migração — Vitor 08/08).
    const { docsPorFunc: docsProntuario, comProntuario, ok: prontuarioOk } =
      await documentosDeProntuarioSeguro(fs.map((f) => ({ id: f.id, nome: f.nome })));
    const addM = (d, n) => { const x = new Date(d); x.setUTCMonth(x.getUTCMonth() + n); return x; };
    // Documento da regra "válido" numa data ref (janela de validade; sem validade = registrado até ref).
    const validoNa = (regra, docs, ref) => {
      const ds = docs.filter((d) => d.tipo === regra.tipo);
      if (!ds.length) return false;
      if (!regra.validadeMeses) return ds.some((d) => new Date(d.dataEmissao || d.createdAt) <= ref);
      return ds.some((d) => { if (!d.dataValidade) return false; const val = new Date(d.dataValidade); const emis = d.dataEmissao ? new Date(d.dataEmissao) : addM(val, -regra.validadeMeses); return emis <= ref && ref <= val; });
    };
    // ⚠⚠ APURAÇÃO SEMESTRAL (Vitor, 27/08/2026). O levantamento de competência é feito no
    // FECHAMENTO DO SEMESTRE, com os certificados do Prontuário na mão — por isso o indicador
    // tem dois pontos no ano, não doze. A série continua com 12 casas porque é o formato que o
    // painel e o PDF leem: cada semestre repete o seu valor nos meses dele.
    const medir = (ref, atual) => {
      let comRegras = 0, atende = 0;
      for (const f of fs) {
        const setor = f.setor?.nome || "";
        if (dispensadoDocumentos(f.tipoContrato, setor)) continue;
        if (prontuarioOk && !comProntuario.has(f.id)) continue; // cobertura: só quem já está no Prontuário (se disponível)
        if (f.dataAdmissao && new Date(f.dataAdmissao) > ref) continue; // ainda não admitido nesse mês
        const regras = regrasParaFuncionario(setor, f.cargo?.nome);
        if (!regras.length) continue;
        comRegras++;
        const disp = dispMap.get(f.id) || new Set();
        const docsF = mesclarDocs(f.documentos, docsProntuario.get(f.id)); // RH + prontuário (complementa)
        const ok = regras.every((rg) => {
          if (rg.dispensavel && disp.has(rg.tipo)) return true; // dispensada p/ este funcionário
          if (atual) { const st = checarRegraDocumento(rg, docsF).status; return st === "OK" || st === "VENCENDO"; }
          return validoNa(rg, docsF, ref);
        });
        if (ok) atende++;
      }
      return comRegras > 0 ? r1((atende / comRegras) * 100) : null;
    };

    const s = arr12();
    const registradas = MEDICOES_COMPETENCIAS[ano] || [];
    const semestres = [];
    for (let sem = 0; sem < 2; sem++) {
      const mIni = sem * 6, mFim = mIni + 5;
      if (mesAtual < mIni) { semestres.push(null); continue; }   // semestre ainda não começou
      const fechado = ano < hoje.getUTCFullYear() || mesAtual > mFim; // ano passado: os dois semestres fecharam
      // fechado → resultado registrado do levantamento; em curso → foto de hoje.
      const ref = fechado ? new Date(Date.UTC(ano, mFim + 1, 0, 23, 59, 59)) : hoje;
      const v = (fechado ? registradas[sem] : null) ?? medir(ref, !fechado);
      semestres.push(v);
      for (let m = mIni; m <= Math.min(mFim, mesAtual); m++) s[m] = v;
    }
    series.atendimento_competencias = s;
    // acumulado = média dos SEMESTRES apurados (não dos meses; senão o semestre com mais meses pesa mais)
    acumulados.atendimento_competencias = media(semestres); }

  const indicadores = INDICADORES_ISO.filter((i) => i.processo === "RH").map((ind) => ({
    ...ind, serie: series[ind.id] || arr12(), acumulado: acumulados[ind.id] ?? null,
  }));
  return { indicadores };
}
