"use client";
import { useEffect, useMemo, useState } from "react";
import { Building2, Loader2, Search, Check } from "lucide-react";

// AS OBRAS QUE ESTE LOGIN DE CLIENTE ENXERGA — e o interruptor para liberar/revogar cada uma.
//
// Vitor (21/09/2026): "preciso deixar uma forma de conseguir liberar as OPs que eu quero que ele
// veja". Liberar = a pessoa entra nos contatos daquela OP (é o vínculo que o portal, os papéis e
// os envios já usam — ver lib/cliente-obras.js). Obra liberada "pelo e-mail da OP" vem do cadastro
// do Comercial e não se desliga por aqui.
const STATUS = { ABERTA: "Aberta", EM_EXECUCAO: "Em execução", ENCERRADA: "Encerrada", CANCELADA: "Cancelada", ATRASADA: "Atrasada" };

export default function ObrasDoCliente({ id }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [marcadas, setMarcadas] = useState(new Set());
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState("");

  const carregar = async () => {
    setErro("");
    try {
      const r = await fetch(`/api/admin/usuarios/${id}/obras`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Falha ao carregar.");
      setDados(j);
      setMarcadas(new Set(j.obras.filter((o) => o.origem === "contato").map((o) => o.id)));
    } catch (e) { setErro(e.message); }
  };
  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const todas = dados?.obras || [];
    const filtro = q ? todas.filter((o) => [o.numero, o.cliente, o.obra].join(" ").toLowerCase().includes(q)) : todas;
    // liberadas primeiro, depois as ativas, depois o resto — quem revisa quer ver o que já vale
    const peso = (o) => (o.liberada ? 0 : o.status === "ENCERRADA" || o.status === "CANCELADA" ? 2 : 1);
    return [...filtro].sort((a, b) => peso(a) - peso(b) || String(b.numero).localeCompare(String(a.numero), "pt-BR", { numeric: true }));
  }, [dados, busca]);

  const alternar = (o) => setMarcadas((p) => { const n = new Set(p); n.has(o.id) ? n.delete(o.id) : n.add(o.id); return n; });

  const salvar = async () => {
    setSalvando(true); setErro(""); setAviso("");
    try {
      const r = await fetch(`/api/admin/usuarios/${id}/obras`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opIds: [...marcadas] }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Não foi possível salvar.");
      setDados((d) => ({ ...d, obras: j.obras }));
      setMarcadas(new Set(j.obras.filter((o) => o.origem === "contato").map((o) => o.id)));
      const partes = [];
      if (j.liberadas.length) partes.push(`liberada${j.liberadas.length > 1 ? "s" : ""}: OP-${j.liberadas.join(", OP-")}`);
      if (j.revogadas.length) partes.push(`revogada${j.revogadas.length > 1 ? "s" : ""}: OP-${j.revogadas.join(", OP-")}`);
      setAviso(partes.length ? partes.join(" · ") : "Nada mudou.");
    } catch (e) { setErro(e.message); } finally { setSalvando(false); }
  };

  const mudou = useMemo(() => {
    if (!dados) return false;
    const atual = new Set(dados.obras.filter((o) => o.origem === "contato").map((o) => o.id));
    return atual.size !== marcadas.size || [...marcadas].some((x) => !atual.has(x));
  }, [dados, marcadas]);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-gray-50/60 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-torg-dark inline-flex items-center gap-2"><Building2 size={15} className="text-torg-blue" /> Obras liberadas no portal</p>
          <p className="text-xs text-torg-gray mt-0.5">
            Marque as obras que este cliente pode ver em "Meus documentos". Ele também vê, sozinho, toda obra em que o e-mail dele já foi usado (assinatura, data book, portal da obra).
          </p>
        </div>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-torg-gray" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="OP, cliente ou obra…"
            className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-torg-blue/30" />
        </div>
      </div>

      {erro && <p className="px-4 py-2 text-sm text-red-700 bg-red-50 border-t border-red-100">{erro}</p>}
      {!dados && !erro && <p className="px-4 py-4 text-sm text-torg-gray inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Carregando obras…</p>}

      {dados && (
        <ul className="max-h-80 overflow-y-auto divide-y divide-gray-50">
          {lista.map((o) => {
            const peloEmail = o.origem === "email";
            const on = marcadas.has(o.id);
            return (
              <li key={o.id}>
                <label className={`flex items-center gap-3 px-4 py-2 text-sm ${peloEmail ? "cursor-default" : "cursor-pointer hover:bg-gray-50/70"}`}>
                  <input type="checkbox" checked={on || peloEmail} disabled={peloEmail || salvando} onChange={() => alternar(o)}
                    aria-label={`Liberar OP-${o.numero}`}
                    className="w-4 h-4 rounded border-gray-300 accent-torg-blue disabled:opacity-50" />
                  <span className="font-mono font-semibold text-torg-dark w-16 shrink-0">OP-{o.numero}</span>
                  <span className="text-torg-dark truncate">{o.cliente}<span className="text-torg-gray"> · {o.obra}</span></span>
                  <span className="ml-auto text-[10px] text-torg-gray whitespace-nowrap">{STATUS[o.status] || o.status}</span>
                  {peloEmail && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-torg-blue-50 text-torg-blue border border-torg-blue-100 whitespace-nowrap" title="Este é o e-mail principal da OP, no cadastro do Comercial — troca-se lá">pelo e-mail da OP</span>}
                </label>
              </li>
            );
          })}
          {lista.length === 0 && <li className="px-4 py-4 text-sm text-torg-gray">Nenhuma obra com esse filtro.</li>}
        </ul>
      )}

      <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <span className="text-xs text-torg-gray">{aviso}</span>
        <button type="button" onClick={salvar} disabled={!mudou || salvando}
          className="px-4 py-1.5 text-sm bg-torg-blue text-white rounded-lg font-medium hover:bg-torg-blue-700 disabled:opacity-40 inline-flex items-center gap-2">
          {salvando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Salvar obras
        </button>
      </div>
    </div>
  );
}
