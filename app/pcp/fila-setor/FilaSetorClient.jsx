"use client";
// ─── A FILA DE ENTRADA DO ACABAMENTO E DO JATO ─────────
//
// ⚠⚠ A ENTRADA É AUTOMÁTICA. Vitor (06/09/2026): "o que for ficando pronto da solda já deve
// aparecer para a fila do acabamento e o que for ficando pronto do acabamento aparecer na fila do
// jato — igual fizemos na solda". Não há liberação: terminar o setor anterior É a entrada aqui.
//
// ⚠ ESCOLHE-SE A OBRA, NÃO A PEÇA. "Vamos selecionar uma única OP e vamos executar os trabalhos de
// acabamento." A tela abre pela lista de obras com o peso e os dias que cada uma custa na meta; o
// detalhe por peça existe para quem quiser conferir, não para quem programa.
//
// ⚠ MANDAR PARA A BANCADA É INTENÇÃO, não ordem — mesma regra da solda (Vitor, 01/09). O portal
// anota a decisão do PCP; o que aconteceu de fato volta pelo Syneco.
import { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2, AlertCircle, ArrowRight, Undo2, Flame, Sparkles } from "lucide-react";
import { useStore } from "@/lib/store";

const nkg = (n) => `${Math.round(Number(n) || 0).toLocaleString("pt-BR")} kg`;
const n1 = (n) => (Math.round((Number(n) || 0) * 10) / 10).toLocaleString("pt-BR");
const hoje = () => new Date().toISOString().slice(0, 10);

export default function FilaSetorClient({ setor }) {
  const { showToast } = useStore();
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [opSel, setOpSel] = useState(null);
  const [bancada, setBancada] = useState(null);
  const [dia, setDia] = useState(hoje());
  const [enviando, setEnviando] = useState(null);

  const buscar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await fetch(`/api/pcp/fila-setor?setor=${setor}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao carregar a fila");
      setDados(j);
      setBancada((b) => b || j.bancadas?.[0]?.k || null);
    } catch (e) { setErro(e.message); } finally { setCarregando(false); }
  }, [setor]);

  useEffect(() => { buscar(); }, [buscar]);

  const daObra = useMemo(
    () => (dados?.fila || []).filter((f) => f.opNumero === opSel),
    [dados, opSel],
  );

  async function mandar(ids, paraBancada) {
    if (!ids.length) return;
    setEnviando(paraBancada === null ? "voltar" : "enviar");
    try {
      const r = await fetch("/api/pcp/fila-setor", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setor, ids, bancada: paraBancada, dia: paraBancada ? dia : null }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Não foi possível gravar");
      // ⚠ update otimista: refetch aqui faria a lista piscar e perder a obra selecionada
      setDados((d) => !d ? d : {
        ...d,
        fila: d.fila.map((f) => ids.includes(f.id)
          ? { ...f, bancada: paraBancada, dia: paraBancada ? dia : null } : f),
      });
      showToast(paraBancada
        ? `${j.atualizadas} peça(s) para ${nomeBancada(paraBancada)} em ${dia.split("-").reverse().join("/")}`
        : `${j.atualizadas} peça(s) de volta para a fila`, "sucesso");
    } catch (e) { showToast(e.message, "erro"); } finally { setEnviando(null); }
  }

  const nomeBancada = (k) => dados?.bancadas?.find((b) => b.k === k)?.nome || k;
  const Icone = setor === "JATO" ? Sparkles : Flame;

  if (carregando && !dados) {
    return (
      <div className="bg-white border border-gray-100 rounded-xl p-8 flex items-center justify-center gap-3 text-torg-gray">
        <Loader2 size={20} className="animate-spin" /> Carregando a fila…
      </div>
    );
  }
  if (erro) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center gap-2">
        <AlertCircle size={16} /> {erro}
        <button onClick={buscar} className="ml-auto text-xs underline">Tentar novamente</button>
      </div>
    );
  }
  if (!dados?.fila?.length) {
    return (
      <div className="bg-white border border-gray-100 rounded-xl p-10 text-center">
        <Icone size={28} className="mx-auto text-gray-300" />
        <p className="mt-3 text-sm font-semibold text-torg-dark">A fila está vazia</p>
        <p className="mt-1 text-xs text-torg-gray">
          Nada terminou {dados?.anterior === "SOLDA" ? "a solda" : "o acabamento"} e está esperando aqui.
        </p>
      </div>
    );
  }

  const pendentes = daObra.filter((f) => !f.bancada);
  const naBancada = daObra.filter((f) => f.bancada);

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4 flex flex-wrap items-center gap-x-8 gap-y-2">
        <div>
          <p className="text-2xl font-extrabold text-torg-dark tabular-nums leading-none">{dados.total.pecas}</p>
          <p className="text-[11px] text-torg-gray">peças esperando</p>
        </div>
        <div>
          <p className="text-2xl font-extrabold text-torg-dark tabular-nums leading-none">{nkg(dados.total.kg)}</p>
          <p className="text-[11px] text-torg-gray">na fila</p>
        </div>
        <div>
          <p className="text-2xl font-extrabold text-torg-orange tabular-nums leading-none">{n1(dados.total.dias)}</p>
          <p className="text-[11px] text-torg-gray">dias na meta ({nkg(dados.capacidadeKgDia)}/dia)</p>
        </div>
        <p className="text-[11px] text-torg-gray max-w-sm ml-auto leading-relaxed">
          Entra sozinho o que termina {dados.anterior === "SOLDA" ? "a solda" : "o acabamento"} —
          não há liberação a fazer.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100">
          <h2 className="text-[13px] font-bold text-torg-dark">Escolha a obra para atacar</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/60">
              <tr className="text-[10px] uppercase tracking-wide text-torg-gray">
                <th className="text-left px-4 py-2 font-bold">OP</th>
                <th className="text-left px-4 py-2 font-bold">Obra</th>
                <th className="text-right px-4 py-2 font-bold">Peças</th>
                <th className="text-right px-4 py-2 font-bold">kg</th>
                <th className="text-right px-4 py-2 font-bold">Dias</th>
                <th className="text-right px-4 py-2 font-bold">Sem bancada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {dados.obras.map((o) => (
                <tr key={o.opNumero}
                    onClick={() => setOpSel(o.opNumero === opSel ? null : o.opNumero)}
                    className={`cursor-pointer ${o.opNumero === opSel ? "bg-torg-blue/5" : "hover:bg-gray-50/60"}`}>
                  <td className="px-4 py-2 font-bold text-torg-blue">OP-{o.opNumero}</td>
                  <td className="px-4 py-2 text-torg-dark truncate max-w-[280px]">{o.obra || "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{o.pecas}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{nkg(o.kg)}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold">{n1(o.dias)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {o.semBancada
                      ? <span className="text-torg-orange font-semibold">{o.semBancada}</span>
                      : <span className="text-emerald-600 font-semibold">todas posicionadas</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {opSel && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3">
            <h2 className="text-[13px] font-bold text-torg-dark">
              OP-{opSel} · {pendentes.length} sem bancada
              {naBancada.length ? <span className="text-torg-gray font-normal"> · {naBancada.length} já posicionadas</span> : null}
            </h2>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {dados.bancadas.length > 1 && (
                <select value={bancada || ""} onChange={(e) => setBancada(e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-torg-dark">
                  {dados.bancadas.map((b) => <option key={b.k} value={b.k}>{b.nome}</option>)}
                </select>
              )}
              <input type="date" value={dia} onChange={(e) => setDia(e.target.value)}
                     className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-torg-dark tabular-nums" />
              <button
                onClick={() => mandar(pendentes.map((f) => f.id), bancada)}
                disabled={!pendentes.length || !!enviando}
                className="text-xs font-semibold bg-torg-blue text-white rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-40">
                {enviando === "enviar" ? <Loader2 size={12} className="animate-spin" /> : <ArrowRight size={12} />}
                Mandar {pendentes.length} para {dados.bancadas.length > 1 ? nomeBancada(bancada) : "a bancada"}
              </button>
              {naBancada.length > 0 && (
                <button
                  onClick={() => mandar(naBancada.map((f) => f.id), null)}
                  disabled={!!enviando}
                  className="text-xs font-semibold border border-gray-200 text-torg-gray rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-40">
                  {enviando === "voltar" ? <Loader2 size={12} className="animate-spin" /> : <Undo2 size={12} />}
                  Devolver à fila
                </button>
              )}
            </div>
          </div>
          <div className="overflow-x-auto max-h-[420px]">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/60 sticky top-0">
                <tr className="text-[10px] uppercase tracking-wide text-torg-gray">
                  <th className="text-left px-4 py-2 font-bold">Marca</th>
                  <th className="text-left px-4 py-2 font-bold">Descrição</th>
                  <th className="text-right px-4 py-2 font-bold">Qte</th>
                  <th className="text-right px-4 py-2 font-bold">kg</th>
                  <th className="text-left px-4 py-2 font-bold">Bancada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {daObra.map((f) => (
                  <tr key={f.id} className={f.bancada ? "bg-emerald-50/40" : ""}>
                    <td className="px-4 py-1.5 font-mono font-semibold text-torg-dark">{f.marca}</td>
                    <td className="px-4 py-1.5 text-torg-gray truncate max-w-[320px]">{f.descricao || f.perfil || "—"}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums">{f.qte}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums">{f.kg.toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-1.5">
                      {f.bancada
                        ? <span className="text-[11px] font-semibold text-emerald-700">
                            {nomeBancada(f.bancada)}{f.dia ? ` · ${f.dia.split("-").reverse().join("/")}` : ""}
                          </span>
                        : <span className="text-[11px] text-torg-gray">na fila</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
