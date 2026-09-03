"use client";
// ─── PRONTO PARA MONTAR: O QUE A PREPARAÇÃO DEIXOU PRONTO ──────────────────────
//
// Vitor (03/09/2026): "seria legal uma visão de tudo que a preparação está deixando pronto para dar
// sequência de montagem (…) selecionar as peças, escolher a quantidade de bancadas de montagem, já
// faria o cálculo de dias que levaria de acordo com o tipo da estrutura e já iria programar as
// bancadas com isso".
//
// ⚠⚠ ESTA TELA FOI DESENHADA ANTES E CONSTRUÍDA IGUAL. Vitor (03/09/2026): "nas ideias você acerta,
// na execução você peca demais" — depois de eu aprovar um protótipo com ele e entregar outra coisa.
// A ordem dos blocos, as colunas e os três cartões são os do protótipo; mudança de layout aqui
// precisa passar por ele antes.
//
// ⚠ PROGRAMAR NÃO É DESCER. Aqui grava o DIA e a BANCADA de cada conjunto; o desenho desce depois,
// pela aba ao lado, que é onde a GRD é registrada. São dois atos com dois registros diferentes —
// juntar faria a GRD sair para conjunto que ainda vai mudar de dia.
//
// ⚠ O CÁLCULO É O MESMO DO RESTO DO PORTAL (lib/montagem-capacidade): peça por faixa de peso, não
// kg. Uma segunda régua aqui daria ao mesmo lote dois prazos.
import { useEffect, useMemo, useState } from "react";
import { Loader2, CalendarCheck, Printer } from "lucide-react";
import { fmtOP } from "@/lib/utils";
import { baixarZipLote } from "@/lib/desenhos-zip-cliente";
import { useFiltroColunas, ThFiltro } from "@/components/FiltroColuna";
import {
  repartirPorBancada, distribuirEmDias, resumoDoLote, custoDoConjunto, RITMO_META,
} from "@/lib/montagem-capacidade";

const fmtN = (n) => new Intl.NumberFormat("pt-BR").format(Math.round(Number(n) || 0));
const fmt1 = (n) => (Math.round((Number(n) || 0) * 10) / 10).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d || "").slice(0, 10));
const fmtDiaCurto = (d) => {
  const s = iso(d); if (!s) return "—";
  const dt = new Date(`${s}T00:00:00Z`);
  return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
};
const fmtDiaSemana = (d) => {
  const s = iso(d); if (!s) return "—";
  const dt = new Date(`${s}T00:00:00Z`);
  const sem = dt.toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" }).replace(".", "");
  return `${sem} ${fmtDiaCurto(s)}`;
};
// ⚠ começa no próximo dia ÚTIL: programar para sábado é programar para ninguém.
const proximoUtil = () => {
  const d = new Date();
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

export default function ProntoParaMontar({ onProgramado }) {
  const [lista, setLista] = useState(null);
  const [sel, setSel] = useState(() => new Set());
  const [n, setN] = useState(2);
  const [inicio, setInicio] = useState(proximoUtil);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [aberta, setAberta] = useState(null);

  useEffect(() => {
    let vivo = true;
    fetch("/api/pcp/prontos-montar", { cache: "no-store" })
      .then((r) => r.json())
      // ⚠ NÃO marca tudo por padrão. São centenas de conjuntos em mais de dez obras — abrir a aba
      // com tudo selecionado põe a fábrica inteira a um clique de ser programada até novembro.
      .then((j) => { if (!vivo) return; setLista(j?.conjuntos || []); })
      .catch(() => vivo && setLista([]));
    return () => { vivo = false; };
  }, []);

  const conjuntos = lista || [];
  // ⚠ o filtro é só para ENXERGAR: quem entra na conta continua sendo o que está MARCADO. Marcar,
  // filtrar por outra obra e ver o prazo mudar sozinho seria uma armadilha.
  const COLS = useMemo(() => [
    { key: "op", label: "OP", valor: (c) => fmtOP(c.opNumero) },
    { key: "marca", label: "marca", valor: (c) => c.marca || "" },
  ], []);
  const { filtros, setFiltros, filtradas: vis, opcoesDaColuna, ativos, limpar } = useFiltroColunas(conjuntos, COLS);
  const cab = { filtros, setFiltros, opcoesDaColuna, aberta, setAberta };
  const escolhidos = useMemo(() => conjuntos.filter((c) => sel.has(c.id)), [conjuntos, sel]);
  const distrib = useMemo(() => repartirPorBancada(escolhidos, n, { curva: RITMO_META }), [escolhidos, n]);
  const porDia = useMemo(
    () => (inicio ? distribuirEmDias(distrib, new Date(`${inicio}T00:00:00Z`)) : []),
    [distrib, inicio],
  );
  const resumo = useMemo(() => resumoDoLote(escolhidos, n), [escolhidos, n]);
  const diasUsados = useMemo(
    () => [...new Set(porDia.flatMap((b) => (b.dias || []).map((d) => iso(d.dia))))].sort(),
    [porDia],
  );
  const fecha = diasUsados[diasUsados.length - 1] || null;

  const alternar = (id) => setSel((p) => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const todos = vis.length > 0 && vis.every((c) => sel.has(c.id));

  // ⚠⚠ PROGRAMAR E IMPRIMIR SÃO DOIS ATOS, e o botão de cada um diz qual é. Vitor (03/09/2026):
  // "aí sim, depois de tudo isso, você deixar imprimir os projetos, as listas de bancadas com as
  // datas que estão previstas para iniciar e terminar, e os pacotes por bancadas, igual temos hoje
  // quando apertamos em imprimir". Quem só quer fechar a semana programa; quem vai entregar o maço
  // ao encarregado imprime junto.
  //
  // ⚠ A ORDEM IMPORTA: LIBERA ANTES DE IMPRIMIR (mesma razão da tela da Montagem). A rota de
  // impressão registra a GRD — o papel que prova o que desceu — e o servidor recusa conjunto que
  // não está 100% cortado. Imprimir antes seria assinar GRD de peça que ele vai barrar.
  async function programar({ imprimir = false } = {}) {
    if (!escolhidos.length) return;
    const bancadaPorId = {}, bancadaPorMarca = {}, diaPorId = {}, ids = [];
    const opDoId = new Map(), marcaDoId = new Map();
    for (const b of distrib) for (const it of b.itens) {
      bancadaPorId[it.id] = b.bancada; bancadaPorMarca[it.marca] = b.bancada; ids.push(it.id);
      opDoId.set(it.id, it.opNumero); marcaDoId.set(it.id, it.marca);
    }
    for (const b of porDia) for (const d of (b.dias || [])) for (const it of d.itens) diaPorId[it.id] = iso(d.dia);
    if (!confirm(`Programar ${ids.length} conjunto(s) em ${distrib.length} bancada(s), de ${fmtDiaCurto(inicio)} a ${fmtDiaCurto(fecha)}?\n\n`
      + (imprimir ? "Grava o dia e a bancada de cada um e baixa o maço, com uma pasta por bancada."
                  : "Grava o dia e a bancada de cada um. O desenho desce depois, pela aba ao lado."))) return;
    setSalvando(true); setErro("");
    try {
      const r = await fetch("/api/producao/pecas/liberar-montagem", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, bancadaPorId, diaPorId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao programar");
      // ⚠ o servidor recusa conjunto que não está 100% cortado — a tela filtra, mas uma aba aberta
      // desde ontem mandaria montar o que voltou para a máquina. O que ele barrou tem de aparecer.
      if (j.bloqueados?.length) {
        setErro(`${j.bloqueados.length} não entraram: ${j.bloqueados.slice(0, 5).map((b) => `${b.marca} (${b.cortados}/${b.total} croquis)`).join(", ")}`);
      }
      const feitos = new Set(j.liberadosIds || ids);

      if (imprimir) {
        // ⚠ UMA CHAMADA POR OBRA: a rota do lote é por OP e a seleção atravessa obras. Mandar tudo
        // junto imprimiria desenho da obra errada — ou simplesmente não acharia o arquivo.
        const porOp = new Map();
        for (const id of feitos) {
          const op = opDoId.get(id); if (!op) continue;
          if (!porOp.has(op)) porOp.set(op, []);
          porOp.get(op).push(marcaDoId.get(id));
        }
        const falhas = [];
        for (const [opNumero, marcas] of porOp) {
          try {
            const r2 = await fetch("/api/producao/desenhos/lote", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ opNumero, marcas: [...new Set(marcas)], setor: "MONTAGEM", acao: "IMPRIMIR", bancadaPorMarca }),
            });
            const j2 = await r2.json();
            if (!r2.ok) throw new Error(j2.error || "erro ao emitir");
            await baixarZipLote(j2, opNumero, "montagem");
          } catch (e) { falhas.push(`OP ${fmtOP(opNumero)}: ${e?.message || "falhou"}`); }
        }
        imprimirListaBancadas(distrib, porDia, feitos);
        if (falhas.length) setErro((v) => [v, ...falhas].filter(Boolean).join(" · "));
      }

      setLista((prev) => (prev || []).filter((c) => !feitos.has(c.id)));
      setSel((p) => { const s = new Set(p); feitos.forEach((id) => s.delete(id)); return s; });
      onProgramado?.();
    } catch (e) { setErro(e.message); } finally { setSalvando(false); }
  }

  if (!lista) {
    return <p className="px-4 py-4 text-[12.5px] text-torg-gray inline-flex items-center gap-2">
      <Loader2 size={13} className="animate-spin" /> vendo o que a preparação terminou…
    </p>;
  }
  if (!conjuntos.length) {
    return <p className="px-4 py-4 text-[12.5px] text-torg-gray">
      Nenhum conjunto com todos os croquis cortados esperando dia de montagem.
    </p>;
  }

  return (
    <div className="px-4 pt-3 pb-3">
      <p className="text-[12.5px] text-torg-gray mb-3">
        Conjuntos que a <b className="text-torg-dark">preparação já terminou</b> — todos os croquis cortados — e que ainda não têm dia de montagem.
        {ativos > 0 && <button onClick={limpar} className="ml-2 text-[11px] text-torg-blue hover:underline">limpar filtro</button>}
      </p>

      <div className="border border-gray-100 rounded-lg overflow-auto max-h-[340px] mb-3">
        <table className="w-full text-[12px]">
          <thead className="bg-gray-50 text-torg-gray-light sticky top-0">
            <tr className="text-left">
              <th className="px-3 py-2 w-8">
                <input type="checkbox" checked={todos} onChange={() => setSel(todos ? new Set() : new Set(vis.map((c) => c.id)))}
                  className="rounded border-gray-300" />
              </th>
              <ThFiltro col="op" label="OP" larg="w-[86px]" className="py-2 font-semibold" {...cab} />
              <ThFiltro col="marca" label="marca" larg="w-[116px]" className="py-2 font-semibold" {...cab} />
              <th className="py-2 font-semibold">descrição</th>
              <th className="py-2 font-semibold text-right w-[56px]">peças</th>
              <th className="py-2 font-semibold text-right w-[76px]">kg</th>
              <th className="px-3 py-2 font-semibold text-right w-[86px]">dias-banc.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {vis.map((c) => (
              <tr key={c.id} onClick={() => alternar(c.id)}
                className={`cursor-pointer ${sel.has(c.id) ? "bg-torg-blue/5" : "hover:bg-gray-50/70"}`}>
                <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={sel.has(c.id)} onChange={() => alternar(c.id)} className="rounded border-gray-300" />
                </td>
                <td className="py-1.5 font-mono text-torg-blue whitespace-nowrap">{fmtOP(c.opNumero)}</td>
                <td className="py-1.5 font-mono font-semibold text-torg-dark whitespace-nowrap">{c.marca}</td>
                <td className="py-1.5 text-torg-gray truncate">{c.descricao || "—"}</td>
                <td className="py-1.5 text-right tabular-nums whitespace-nowrap">{fmtN(c.qte)}</td>
                <td className="py-1.5 text-right tabular-nums text-torg-gray whitespace-nowrap">{fmtN(c.pesoTotalKg)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-torg-gray-light whitespace-nowrap">
                  {fmt1(custoDoConjunto(c, RITMO_META))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-gray-50/70 border border-gray-100 rounded-lg p-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="text-[12.5px] font-semibold text-torg-dark">{fmtN(escolhidos.length)} selecionados</span>
          <span className="text-[11px] text-torg-gray ml-1">bancadas:</span>
          {[1, 2, 3, 4, 5].map((k) => (
            <button key={k} onClick={() => setN(k)}
              className={`text-[11.5px] font-semibold rounded-md px-2.5 py-1 border ${
                n === k ? "bg-torg-blue text-white border-torg-blue" : "bg-white border-gray-200 text-torg-gray hover:border-torg-blue-300"}`}>
              {k}
            </button>
          ))}
          <span className="text-[11px] text-torg-gray ml-1">começa em</span>
          <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)}
            className="border border-gray-200 rounded-md px-2 py-1 text-[11.5px] bg-white outline-none focus:border-torg-blue" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Cx rot="na meta" val={`${fmt1(resumo.diasMeta)} dias`} sub={`${fmt1(resumo.diasBancadaMeta)} dias-bancada`} />
          <Cx rot="por bancada / dia"
            val={`${fmtN(resumo.un / Math.max(0.1, resumo.diasMeta) / Math.max(1, n))} peças`}
            sub="pelo peso das peças" />
          <Cx rot="fecha em" val={fecha ? fmtDiaSemana(fecha) : "—"} sub={`${diasUsados.length} dia(s) úteis`} />
        </div>

        {distrib.some((b) => b.itens.length) && (
          <div className="mt-3 border-t border-gray-200 pt-2.5">
            <table className="w-full text-[12px]">
              <tbody>
                {distrib.map((b) => {
                  const dias = (porDia.find((x) => x.bancada === b.bancada)?.dias || []).map((d) => iso(d.dia));
                  if (!b.itens.length) return null;
                  return (
                    <tr key={b.bancada}>
                      <td className="py-1 font-semibold text-torg-dark w-[120px]">{b.bancada}</td>
                      <td className="py-1 text-torg-gray">{fmtN(b.itens.length)} conj · {fmtN(b.un)} pç</td>
                      <td className="py-1 text-right tabular-nums text-torg-gray whitespace-nowrap">
                        {dias.length ? `${fmtDiaCurto(dias[0])} → ${fmtDiaCurto(dias[dias.length - 1])}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {erro && <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">{erro}</p>}

      <div className="flex items-center gap-2.5 flex-wrap">
        <button onClick={() => programar()} disabled={salvando || !escolhidos.length}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-lg bg-torg-orange text-white hover:opacity-90 disabled:opacity-40">
          {salvando ? <Loader2 size={13} className="animate-spin" /> : <CalendarCheck size={13} />}
          Programar as {distrib.filter((b) => b.itens.length).length || n} bancadas
        </button>
        <button onClick={() => programar({ imprimir: true })} disabled={salvando || !escolhidos.length}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-lg border border-torg-blue text-torg-blue bg-white hover:bg-torg-blue-50 disabled:opacity-40">
          <Printer size={13} />
          Programar e imprimir
        </button>
        <span className="text-[11px] text-torg-gray-light">
          programar grava o dia e a bancada · imprimir sai com os projetos, a lista de cada bancada e os pacotes separados por bancada
        </span>
      </div>
    </div>
  );
}

// ─── A LISTA DE CADA BANCADA, para o encarregado ───────────────────────────────
// Vitor (03/09/2026): "as listas de bancadas com as datas que estão previstas para iniciar e
// terminar". É o papel que fica na bancada — por isso o cabeçalho de cada bloco repete a data, e a
// folha quebra por bancada: um encarregado não deve receber a lista do vizinho junto.
//
// ⚠ SÓ O QUE O SERVIDOR LIBEROU (`feitos`): imprimir o que ele barrou mandaria montar conjunto que
// voltou para a máquina.
function imprimirListaBancadas(distrib, porDia, feitos) {
  const blocos = distrib
    .map((b) => {
      const itens = b.itens.filter((it) => feitos.has(it.id));
      if (!itens.length) return null;
      const dias = (porDia.find((x) => x.bancada === b.bancada)?.dias || []).map((d) => iso(d.dia));
      const diaDoId = new Map();
      for (const d of (porDia.find((x) => x.bancada === b.bancada)?.dias || [])) {
        for (const it of d.itens) diaDoId.set(it.id, iso(d.dia));
      }
      return { bancada: b.bancada, ini: dias[0] || null, fim: dias[dias.length - 1] || null, itens, diaDoId };
    })
    .filter(Boolean);
  if (!blocos.length) return;

  const esc = (t) => String(t ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Montagem — lista por bancada</title><style>
  @page { size: A4; margin: 12mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; }
  .bl { page-break-after: always; }
  .bl:last-child { page-break-after: auto; }
  h1 { font-size: 15px; margin: 0 0 2px; color: #0D1F3C; }
  .sub { font-size: 11px; color: #555; margin: 0 0 10px; }
  .faixa { border-top: 3px solid #F4801F; margin: 4px 0 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: #0D1F3C; color: #fff; text-align: left; padding: 4px 6px; font-weight: 600; }
  td { border-bottom: 1px solid #e5e5e5; padding: 3px 6px; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
</style></head><body>
${blocos.map((b) => `<div class="bl">
  <h1>Montagem — ${esc(b.bancada)}</h1>
  <p class="sub">previsto de <b>${fmtDiaSemana(b.ini)}</b> a <b>${fmtDiaSemana(b.fim)}</b> · ${b.itens.length} conjunto(s)</p>
  <div class="faixa"></div>
  <table><thead><tr><th>dia</th><th>OP</th><th>conjunto</th><th>descrição</th><th class="num">peças</th><th class="num">kg</th></tr></thead><tbody>
  ${b.itens.map((it) => `<tr><td>${esc(fmtDiaCurto(b.diaDoId.get(it.id)))}</td><td>${esc(fmtOP(it.opNumero))}</td>`
    + `<td><b>${esc(it.marca)}</b></td><td>${esc(it.descricao || "")}</td>`
    + `<td class="num">${fmtN(it.qte)}</td><td class="num">${fmtN(it.pesoTotalKg)}</td></tr>`).join("")}
  </tbody></table>
</div>`).join("")}
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) return; // bloqueador de pop-up — o ZIP já baixou, não vale travar o fluxo por causa da folha
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}

function Cx({ rot, val, sub }) {
  return (
    <div className="bg-white border border-gray-100 rounded-lg px-3 py-2">
      <p className="text-[11px] text-torg-gray-light">{rot}</p>
      <p className="text-[16px] font-bold text-torg-dark tabular-nums leading-tight">{val}</p>
      {sub && <p className="text-[10.5px] text-torg-gray-light">{sub}</p>}
    </div>
  );
}
