"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Loader2, AlertCircle, ClipboardList, ChevronDown, ChevronRight,
  PackageCheck, Search, RefreshCw, ExternalLink,
} from "lucide-react";

const fmtKg = (v) => `${Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
const fmtN = (v) => Number(v || 0).toLocaleString("pt-BR");
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

// Cor do grupo — a Expedição pensa por tipo de carga, não por marca solta.
const COR_GRUPO = {
  estrutura: "bg-torg-blue-50 text-torg-blue border-torg-blue-200",
  "guarda-corpo-reto": "bg-purple-50 text-purple-700 border-purple-200",
  "guarda-corpo-inclinado": "bg-purple-50 text-purple-700 border-purple-200",
  cobertura: "bg-amber-50 text-amber-700 border-amber-200",
  grade: "bg-teal-50 text-teal-700 border-teal-200",
  fixacao: "bg-gray-100 text-torg-gray border-gray-200",
};

/**
 * LISTAS DE EXPEDIÇÃO — obras com peça em aberto pra enviar.
 *
 * Vitor (19/08/2026): "no portal da expedição você consegue deixar uma aba chamada Listas de
 * Expedição? Essa página tem que aparecer as obras que estão com peças em aberto para envio —
 * nesse caso você pode usar a lista onde contém todos os itens".
 *
 * A lista é a fonte certa porque tem 100% do que a obra entrega. A tela de "Expedição por OP"
 * mostra o que o Planejamento já direcionou; esta mostra o que a OBRA ainda deve, direcionado ou
 * não — é a pergunta de quem embarca, não de quem planeja.
 *
 * Ordena por PESO PARADO, não por número de OP: 20 t de estrutura numa obra pesa mais na fila do
 * caminhão do que 200 parafusos em outra.
 */
export default function ListasExpedicaoClient() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [aberta, setAberta] = useState(null);
  const [busca, setBusca] = useState("");
  const [todas, setTodas] = useState(false);

  const carregar = (comTodas = todas) => {
    setLoading(true); setErro("");
    fetch(`/api/expedicao/listas${comTodas ? "?todas=1" : ""}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Erro"); return j; })
      .then(setData).catch((e) => setErro(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [todas]);

  const obras = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return data?.obras || [];
    return (data?.obras || []).filter((o) =>
      [o.opNumero, o.cliente, o.obra].some((x) => String(x || "").toLowerCase().includes(t))
    );
  }, [data, busca]);

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight inline-flex items-center gap-2">
            <ClipboardList size={26} className="text-torg-blue" /> Listas de Expedição
          </h2>
          <p className="text-sm text-torg-gray mt-1">
            Obras com peça <b>em aberto para envio</b>, pela lista que traz todos os itens da obra.
            Uma marca sai da conta quando entra num <b>romaneio do portal</b> ou recebe <b>baixa na
            planilha do SharePoint</b> — os dois jeitos contam, o antigo e o novo. O local vem do
            apontamento do Syneco: é onde a peça de fato parou.
          </p>
        </div>
        <button onClick={() => carregar()} disabled={loading}
          className="text-[12px] font-semibold text-torg-blue border border-torg-blue-200 hover:bg-torg-blue-50 rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-50">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Atualizar
        </button>
      </div>

      {data?.totais && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100 border border-gray-100 rounded-xl overflow-hidden">
          <Kpi rotulo="Obras com pendência" valor={fmtN(data.totais.obras)} />
          <Kpi rotulo="Marcas a enviar" valor={fmtN(data.totais.marcasFaltantes)} />
          <Kpi rotulo="Peso parado" valor={fmtKg(data.totais.faltanteKg)} destaque />
          {/* O número que a Expedição usa: já passou pela pintura, pode ir pro caminhão hoje. */}
          <Kpi rotulo="Prontas p/ carregar" valor={fmtKg(data.totais.prontasKg)}
            nota={`${fmtN(data.totais.prontasMarcas)} marcas já pintadas`} verde />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-torg-gray" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Filtrar por OP, cliente ou obra…"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <label className="inline-flex items-center gap-1.5 text-[12px] text-torg-gray cursor-pointer"
          title="Mostra também as obras que já embarcaram tudo">
          <input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} />
          incluir obras já concluídas
        </label>
      </div>

      {loading && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <Loader2 size={20} className="mx-auto animate-spin text-torg-blue mb-2" />
          <p className="text-sm text-torg-gray">Lendo as listas de expedição...</p>
        </div>
      )}

      {erro && !loading && (
        <div className="bg-white rounded-xl shadow-sm border border-red-100 p-6 flex items-start gap-2 text-red-600 text-sm">
          <AlertCircle size={16} className="mt-0.5" />
          <div><p className="font-medium">Erro ao carregar</p><p className="text-xs mt-1">{erro}</p></div>
        </div>
      )}

      {!loading && !erro && obras.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <PackageCheck size={22} className="mx-auto text-green-600 mb-2" />
          <p className="text-sm text-torg-dark font-medium">
            {busca ? "Nenhuma obra bate com o filtro." : "Nenhuma obra com peça em aberto."}
          </p>
        </div>
      )}

      {!loading && !erro && obras.map((o) => (
        <ObraCard key={o.opNumero || o.frentes[0]?.frente} o={o}
          aberta={aberta === o.opNumero} onToggle={() => setAberta(aberta === o.opNumero ? null : o.opNumero)} />
      ))}
    </div>
  );
}

function Kpi({ rotulo, valor, nota, destaque, verde }) {
  return (
    <div className="bg-white p-4">
      <p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider mb-1">{rotulo}</p>
      <p className={`text-xl font-extrabold tabular-nums ${verde ? "text-green-700" : destaque ? "text-torg-orange-700" : "text-torg-dark"}`}>{valor}</p>
      {nota && <p className="text-[10px] text-torg-gray mt-0.5">{nota}</p>}
    </div>
  );
}

function ObraCard({ o, aberta, onToggle }) {
  const pct = o.pctExpedido;
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <button onClick={onToggle} className="w-full text-left px-5 py-3.5 hover:bg-gray-50 flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="text-torg-gray shrink-0">{aberta ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
        <span className="min-w-0 flex-1">
          <span className="text-[15px] font-bold text-torg-dark">OP-{o.opNumero || "—"}</span>
          {o.cliente && <span className="text-[13px] text-torg-gray"> · {o.cliente}</span>}
          {o.obra && <span className="text-[13px] text-torg-gray"> · {o.obra}</span>}
          <span className="block text-[11px] text-torg-gray mt-0.5">
            {o.frentes.map((f) => f.frente).join(", ")}
            {o.ultimaExpedicao ? ` · último embarque ${fmtData(o.ultimaExpedicao)}` : " · nada embarcado ainda"}
            {o.pedidoExpedicao ? ` · pedido ${o.pedidoExpedicao.toLowerCase()}` : ""}
          </span>
        </span>
        <span className="text-right shrink-0">
          <span className="block text-[15px] font-bold text-torg-orange-700 tabular-nums">{fmtKg(o.faltanteKg)}</span>
          <span className="block text-[11px] text-torg-gray">{fmtN(o.faltantes)} de {fmtN(o.marcas)} marcas</span>
        </span>
        {pct != null && (
          <span className="shrink-0 w-28">
            <span className="flex items-center justify-between text-[11px] mb-0.5">
              <span className="text-torg-gray">embarcado</span>
              <span className="font-semibold text-torg-dark tabular-nums">{pct}%</span>
            </span>
            <span className="block h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <span className="block h-full bg-torg-blue rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
            </span>
          </span>
        )}
      </button>

      {/* Resumo por grupo: quem embarca precisa saber se falta estrutura (guincho) ou fixação
          (caixa) — são cargas diferentes. */}
      {o.porGrupo.length > 0 && (
        <div className="px-5 pb-3 flex flex-wrap gap-1.5">
          {o.porGrupo.map((g) => (
            <span key={g.grupo} className={`text-[11px] rounded-lg border px-2 py-1 ${COR_GRUPO[g.grupo] || "bg-gray-100 text-torg-gray border-gray-200"}`}>
              <b>{g.label}</b> {fmtN(g.marcas)} {g.marcas === 1 ? "marca" : "marcas"}
              {g.kg > 0 ? ` · ${fmtKg(g.kg)}` : ""}
            </span>
          ))}
        </div>
      )}

      {/* ONDE ESTÁ PARADO — Vitor (19/08): "informar, de acordo com o apontamento, o local que
          está parado". Prontas em verde, primeiro: é o que dá pra carregar hoje. */}
      {o.porSetor.length > 0 && (
        <div className="px-5 pb-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-torg-gray mr-0.5">parado em:</span>
          {o.porSetor.map((sx) => (
            <span key={sx.setor}
              title={sx.pronta ? "Já passou pela pintura — pode carregar" : sx.setor === "SEM_APONTAMENTO" ? "Nenhum apontamento no Syneco — ainda não entrou na fábrica ou o apontamento não chegou" : "Ainda em fabricação"}
              className={`text-[11px] rounded-lg border px-2 py-1 ${
                sx.pronta ? "bg-green-50 text-green-700 border-green-200 font-semibold"
                  : sx.setor === "SEM_APONTAMENTO" ? "bg-gray-50 text-torg-gray border-gray-200"
                  : "bg-orange-50 text-torg-orange-700 border-orange-200"
              }`}>
              {sx.pronta && "✓ "}{sx.label} {fmtN(sx.marcas)}{sx.kg > 0 ? ` · ${fmtKg(sx.kg)}` : ""}
            </span>
          ))}
        </div>
      )}

      {aberta && (
        <div className="border-t border-gray-100 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <p className="text-[12px] font-semibold text-torg-dark">Marcas a enviar</p>
            {o.opId && (
              <Link href={`/expedicao/op?op=${o.opId}`} className="text-[12px] font-semibold text-torg-blue hover:underline inline-flex items-center gap-1">
                Abrir na Expedição por OP <ExternalLink size={12} />
              </Link>
            )}
          </div>
          <div className="rounded-lg border border-gray-200 overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full text-[12px] min-w-[540px]">
              <thead className="bg-gray-50 text-torg-gray sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Marca</th>
                  <th className="px-3 py-2 text-left font-medium">Descrição</th>
                  <th className="px-3 py-2 text-left font-medium">Grupo</th>
                  <th className="px-3 py-2 text-right font-medium">Qtd</th>
                  <th className="px-3 py-2 text-right font-medium">Peso</th>
                  <th className="px-3 py-2 text-left font-medium">Onde está</th>
                  <th className="px-3 py-2 text-left font-medium">Frente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {o.itensFaltantes.map((i, n) => (
                  <tr key={`${i.marca}-${n}`} className="hover:bg-gray-50">
                    <td className="px-3 py-1.5 font-semibold text-torg-dark whitespace-nowrap">{i.marca}</td>
                    <td className="px-3 py-1.5 text-torg-gray">{i.descricao || "—"}</td>
                    <td className="px-3 py-1.5 text-torg-gray">{COR_GRUPO[i.grupo] ? (o.porGrupo.find((g) => g.grupo === i.grupo)?.label || i.grupo) : i.grupo}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmtN(i.qtd)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{i.pesoKg > 0 ? fmtKg(i.pesoKg) : "—"}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {i.setorLabel ? (
                        <span className={i.pronta ? "text-green-700 font-semibold" : "text-torg-orange-700"}>
                          {i.pronta ? "✓ " : ""}{i.setorLabel}
                        </span>
                      ) : (
                        <span className="text-torg-gray">sem apontamento</span>
                      )}
                      {/* Portal diz EXPEDIDO e a lista diz que falta: alguém precisa olhar. */}
                      {i.statusPortal === "EXPEDIDO" && (
                        <span className="ml-1 text-[10px] bg-amber-100 text-amber-800 rounded px-1 py-0.5"
                          title="O portal marca esta peça como expedida, mas a lista de expedição ainda não deu baixa nela">
                          ⚠ divergente
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-torg-gray">{i.frente}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {o.detalheTruncado && (
            <p className="text-[11px] text-amber-700 mt-1.5">
              Mostrando as {fmtN(o.itensFaltantes.length)} mais pesadas de {fmtN(o.faltantes)} marcas — a lista completa está na
              tela de Expedição por OP.
            </p>
          )}
          <p className="text-[10px] text-torg-gray mt-1.5">
            Listas importadas até {fmtData(o.importadoEm)}. Marca com baixa no romaneio do portal ou na
            planilha do SharePoint não aparece aqui.
          </p>
        </div>
      )}
    </div>
  );
}
