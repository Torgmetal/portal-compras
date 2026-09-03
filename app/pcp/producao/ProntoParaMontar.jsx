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
import { Loader2, CalendarCheck } from "lucide-react";
import { fmtOP } from "@/lib/utils";
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
  const todos = conjuntos.length > 0 && sel.size === conjuntos.length;

  async function programar() {
    if (!escolhidos.length) return;
    const bancadaPorId = {}, diaPorId = {}, ids = [];
    for (const b of distrib) for (const it of b.itens) { bancadaPorId[it.id] = b.bancada; ids.push(it.id); }
    for (const b of porDia) for (const d of (b.dias || [])) for (const it of d.itens) diaPorId[it.id] = iso(d.dia);
    if (!confirm(`Programar ${ids.length} conjunto(s) em ${distrib.length} bancada(s), de ${fmtDiaCurto(inicio)} a ${fmtDiaCurto(fecha)}?\n\n`
      + "Grava o dia e a bancada de cada um. O desenho desce depois, pela aba ao lado.")) return;
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
      </p>

      <div className="border border-gray-100 rounded-lg overflow-auto max-h-[340px] mb-3">
        <table className="w-full text-[12px]">
          <thead className="bg-gray-50 text-torg-gray-light sticky top-0">
            <tr className="text-left">
              <th className="px-3 py-2 w-8">
                <input type="checkbox" checked={todos} onChange={() => setSel(todos ? new Set() : new Set(conjuntos.map((c) => c.id)))}
                  className="rounded border-gray-300" />
              </th>
              <th className="py-2 font-semibold w-[80px]">OP</th>
              <th className="py-2 font-semibold w-[110px]">marca</th>
              <th className="py-2 font-semibold">descrição</th>
              <th className="py-2 font-semibold text-right w-[56px]">peças</th>
              <th className="py-2 font-semibold text-right w-[76px]">kg</th>
              <th className="px-3 py-2 font-semibold text-right w-[86px]">dias-banc.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {conjuntos.map((c) => (
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
        <button onClick={programar} disabled={salvando || !escolhidos.length}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-lg bg-torg-orange text-white hover:opacity-90 disabled:opacity-40">
          {salvando ? <Loader2 size={13} className="animate-spin" /> : <CalendarCheck size={13} />}
          Programar as {distrib.filter((b) => b.itens.length).length || n} bancadas
        </button>
        <span className="text-[11px] text-torg-gray-light">
          grava o dia e a bancada de cada conjunto · o desenho desce depois, pela aba ao lado
        </span>
      </div>
    </div>
  );
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
