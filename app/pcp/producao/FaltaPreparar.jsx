"use client";
// ─── FALTA PREPARAR ────────────────────────────────────────────────────────────
//
// Vitor (03/09/2026): "quando aperto a tela da montagem, aí sim você tem que mostrar uma aba onde
// está escrito falta descer vira FALTA PREPARAR, e você me traz uma listagem igual temos na LPC" —
// e, para a preparação: "precisamos ter como selecionar as peças e, de acordo com o tipo do
// material, você já estima o peso e quantidade por dia; a diferença é que, em vez de eu selecionar
// a quantidade de máquinas, você faz o número pela quantidade de peso que podemos fazer no setor".
//
// ⚠⚠ A MESMA ABA RESPONDE COISAS DIFERENTES NOS DOIS SETORES:
//   PREPARAÇÃO → a peça que ela mesma vai cortar. Seleciona e o portal estima o prazo pelo PESO
//                que o setor faz por dia (não por máquina — foi o pedido explícito).
//   MONTAGEM   → o conjunto que não pode montar porque falta croqui, com os croquis abertos. É
//                trabalho do setor ANTERIOR: serve para cobrar, não para agir — por isso não tem
//                seleção nem botão aqui.
import { useEffect, useMemo, useState, Fragment } from "react";
import { Loader2, ChevronRight } from "lucide-react";
import { fmtOP } from "@/lib/utils";
import { useFiltroColunas, ThFiltro } from "@/components/FiltroColuna";

const fmtN = (n) => new Intl.NumberFormat("pt-BR").format(Math.round(Number(n) || 0));
const fmt1 = (n) => (Math.round((Number(n) || 0) * 10) / 10).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtKg = (n) => `${fmtN(n)} kg`;
const somaKg = (a) => a.reduce((s, x) => s + (x.kg || 0), 0);
const somaQt = (a) => a.reduce((s, x) => s + (x.qte || 0), 0);

export default function FaltaPreparar({ setor }) {
  const [itens, setItens] = useState(null);
  const [sel, setSel] = useState(() => new Set());
  const [aberto, setAberto] = useState(null);
  const [aberta, setAberta] = useState(null);
  // ⚠ MESMA META DO PAINEL DE CARGA (12.000 kg/dia). Dois números para a mesma capacidade fariam a
  // mesma seleção ter dois prazos dependendo da tela em que se olha.
  const [metaKg, setMetaKg] = useState(12000);

  useEffect(() => {
    let vivo = true;
    setItens(null); setSel(new Set()); setAberto(null);
    fetch(`/api/pcp/falta-preparar?setor=${setor}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => vivo && setItens(j?.itens || []))
      .catch(() => vivo && setItens([]));
    return () => { vivo = false; };
  }, [setor]);

  const lista = itens || [];
  // ⚠ mesmo funil das outras tabelas (components/FiltroColuna). A conta do prazo segue o que está
  // MARCADO, não o que está filtrado: filtrar por outra obra e ver o prazo mudar sozinho seria uma
  // armadilha.
  const COLS = useMemo(() => [
    { key: "op", label: "OP", valor: (l) => fmtOP(l.opNumero) },
    { key: "marca", label: setor === "MONTAGEM" ? "conjunto" : "marca", valor: (l) => l.marca || "" },
    { key: "perfil", label: "perfil", valor: (l) => l.perfil || l.descricao || "" },
    { key: "material", label: "material", valor: (l) => l.material || "" },
  ], [setor]);
  const { filtros, setFiltros, filtradas: vis, opcoesDaColuna, ativos, limpar } = useFiltroColunas(lista, COLS);
  const cab = { filtros, setFiltros, opcoesDaColuna, aberta, setAberta };
  const escolhidos = useMemo(() => lista.filter((x) => sel.has(x.id)), [lista, sel]);
  const meta = Number(metaKg) || 0;
  const dias = meta > 0 ? somaKg(escolhidos) / meta : 0;
  const alternar = (id) => setSel((p) => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const todos = vis.length > 0 && vis.every((x) => sel.has(x.id));

  if (!itens) {
    return <p className="px-4 py-4 text-[12.5px] text-torg-gray inline-flex items-center gap-2">
      <Loader2 size={13} className="animate-spin" /> vendo o que falta preparar…
    </p>;
  }
  if (!lista.length) {
    return <p className="px-4 py-4 text-[12.5px] text-torg-gray">
      {setor === "MONTAGEM"
        ? "Nenhum conjunto esperando croqui — a preparação está em dia com a montagem."
        : "Nada esperando corte nas obras abertas."}
    </p>;
  }

  // ── MONTAGEM: listagem tipo LPC, conjunto → croquis que faltam ───────────────────────────────
  if (setor === "MONTAGEM") {
    return (
      <div className="px-4 pt-3 pb-3">
        <p className="text-[12.5px] text-torg-gray mb-3">
          <b className="text-torg-dark">{fmtN(vis.length)} conjuntos</b> não podem montar porque ainda falta croqui no corte.
          Clique para ver quais peças seguram cada um.
          {ativos > 0 && <button onClick={limpar} className="ml-2 text-[11px] text-torg-blue hover:underline">limpar filtro</button>}
        </p>
        <div className="border border-gray-100 rounded-lg overflow-auto max-h-[420px]">
          <table className="w-full text-[12px]">
            <thead className="bg-gray-50 text-torg-gray-light sticky top-0">
              <tr className="text-left">
                <ThFiltro col="op" label="OP" larg="w-[86px]" className="px-3 py-2 font-semibold" {...cab} />
                <ThFiltro col="marca" label="conjunto" larg="w-[116px]" className="py-2 font-semibold" {...cab} />
                <th className="py-2 font-semibold">descrição</th>
                <th className="py-2 font-semibold text-right w-[76px]">kg</th>
                <th className="px-3 py-2 font-semibold text-right w-[110px]">croquis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {vis.map((c) => (
                <Fragment key={c.id}>
                  <tr onClick={() => setAberto(aberto === c.id ? null : c.id)}
                    className={`cursor-pointer ${aberto === c.id ? "bg-torg-blue-50/40" : "hover:bg-gray-50/70"}`}>
                    <td className="px-3 py-1.5 font-mono text-torg-blue whitespace-nowrap">{fmtOP(c.opNumero)}</td>
                    <td className="py-1.5 font-mono font-semibold text-torg-dark whitespace-nowrap inline-flex items-center gap-1">
                      <ChevronRight size={11} className={aberto === c.id ? "rotate-90 transition-transform" : "transition-transform"} />
                      {c.marca}
                    </td>
                    <td className="py-1.5 text-torg-gray truncate">{c.descricao || "—"}</td>
                    <td className="py-1.5 text-right tabular-nums text-torg-gray whitespace-nowrap">{fmtN(c.kg)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
                      <span className="text-amber-700 font-semibold">{fmtN(c.total - c.cortados)}</span>
                      <span className="text-torg-gray-light"> de {fmtN(c.total)}</span>
                    </td>
                  </tr>
                  {aberto === c.id && (
                    <tr className="bg-amber-50/40">
                      <td colSpan={5} className="px-4 py-2">
                        <p className="text-[11px] text-amber-900 font-semibold mb-1">croquis que faltam cortar</p>
                        <table className="w-full text-[11.5px]">
                          <tbody>
                            {c.faltam.map((f) => (
                              <tr key={f.marca}>
                                <td className="py-0.5 font-mono text-torg-dark w-[130px]">{f.marca}</td>
                                <td className="py-0.5 text-amber-800 w-[120px]">falta {fmtN(f.falta)} de {fmtN(f.qte)}</td>
                                <td className="py-0.5 text-torg-gray-light">{f.maquina || "sem máquina atribuída"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ── PREPARAÇÃO: seleciona as peças e o prazo sai do PESO por dia ─────────────────────────────
  return (
    <div className="px-4 pt-3 pb-3">
      <p className="text-[12.5px] text-torg-gray mb-3">
        <b className="text-torg-dark">{fmtN(vis.length)} peças</b> esperando corte. Marque o que vai entrar e o prazo sai do peso que o setor faz por dia.
        {ativos > 0 && <button onClick={limpar} className="ml-2 text-[11px] text-torg-blue hover:underline">limpar filtro</button>}
      </p>

      <div className="border border-gray-100 rounded-lg overflow-auto max-h-[340px] mb-3">
        <table className="w-full text-[12px]">
          <thead className="bg-gray-50 text-torg-gray-light sticky top-0">
            <tr className="text-left">
              <th className="px-3 py-2 w-8">
                <input type="checkbox" checked={todos} onChange={() => setSel(todos ? new Set() : new Set(vis.map((x) => x.id)))}
                  className="rounded border-gray-300" />
              </th>
              <ThFiltro col="op" label="OP" larg="w-[86px]" className="py-2 font-semibold" {...cab} />
              <ThFiltro col="marca" label="marca" larg="w-[116px]" className="py-2 font-semibold" {...cab} />
              <ThFiltro col="perfil" label="perfil" className="py-2 font-semibold" {...cab} />
              <ThFiltro col="material" label="material" larg="w-[104px]" className="py-2 font-semibold" {...cab} />
              <th className="py-2 font-semibold text-right w-[70px]">qtd</th>
              <th className="px-3 py-2 font-semibold text-right w-[76px]">kg</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {vis.map((p) => (
              <tr key={p.id} onClick={() => alternar(p.id)}
                className={`cursor-pointer ${sel.has(p.id) ? "bg-torg-blue/5" : "hover:bg-gray-50/70"}`}>
                <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={sel.has(p.id)} onChange={() => alternar(p.id)} className="rounded border-gray-300" />
                </td>
                <td className="py-1.5 font-mono text-torg-blue whitespace-nowrap">{fmtOP(p.opNumero)}</td>
                <td className="py-1.5 font-mono font-semibold text-torg-dark whitespace-nowrap">{p.marca}</td>
                <td className="py-1.5 text-torg-gray truncate">{p.perfil || p.descricao || "—"}</td>
                <td className="py-1.5 text-torg-gray-light truncate">{p.material || "—"}</td>
                <td className="py-1.5 text-right tabular-nums whitespace-nowrap">
                  {p.feito > 0 ? <span className="text-amber-700">{fmtN(p.feito)}/{fmtN(p.qte)}</span> : fmtN(p.qte)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-torg-gray whitespace-nowrap">{fmtN(p.kg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-gray-50/70 border border-gray-100 rounded-lg p-3">
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="text-[12.5px] font-semibold text-torg-dark">{fmtN(escolhidos.length)} selecionadas</span>
          <span className="text-[11px] text-torg-gray ml-1">o setor faz</span>
          <input type="number" value={metaKg} onChange={(e) => setMetaKg(e.target.value)}
            className="w-[86px] border border-gray-200 rounded-md px-2 py-1 text-[11.5px] text-right tabular-nums bg-white outline-none focus:border-torg-blue" />
          <span className="text-[11px] text-torg-gray">kg/dia</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Cx rot="peso do lote" val={fmtKg(somaKg(escolhidos))} sub={`${fmtN(somaQt(escolhidos))} peças`} />
          <Cx rot="leva" val={`${fmt1(dias)} dias`} sub="pelo peso que o setor faz" />
          <Cx rot="por dia" val={meta > 0 ? fmtKg(meta) : "—"} sub="capacidade do setor" />
        </div>
        <p className="text-[11px] text-torg-gray-light mt-2">
          ⚠ estimativa — quem cria a liberação do lote continua sendo o Planejamento, por frente da obra.
        </p>
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
