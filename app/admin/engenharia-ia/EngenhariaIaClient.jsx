"use client";
import { useState, useEffect, useCallback } from "react";
import { Cpu, RefreshCw, Loader2, AlertCircle, CheckCircle2, XCircle, Laptop, Ban } from "lucide-react";
import { useStore } from "@/lib/store";
import ConfirmModal from "@/components/admin/ConfirmModal";

// Portão de IA da Engenharia (F1 do app Torg Engenharia). Vitor (16/10/2026): só ADMIN aprova PC novo; teto MENSAL por
// projetista em R$; o registro mostra o pedido de cada projetista. Regras em lib/ia-portao.js.
const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataHora = (d) => (d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "—");
const mil = (n) => Number(n || 0).toLocaleString("pt-BR");

const STATUS = {
  AGUARDANDO_ADMIN: { rotulo: "Aguardando aprovação", cor: "bg-amber-100 text-amber-800" },
  APROVADO: { rotulo: "Aprovado (o app ainda não buscou o acesso)", cor: "bg-blue-100 text-blue-800" },
  ATIVO: { rotulo: "Ativo", cor: "bg-green-100 text-green-700" },
  RECUSADO: { rotulo: "Recusado", cor: "bg-gray-100 text-gray-600" },
  REVOGADO: { rotulo: "Revogado", cor: "bg-red-100 text-red-700" },
};
const SITUACAO = {
  ok: "ok", erro: "erro da Anthropic", recusado_modelo: "modelo recusado", recusado_teto: "teto atingido",
  recusado_ritmo: "chamadas demais", recusado_acesso: "sem acesso",
};

function Barra({ gasto, teto }) {
  if (teto == null) return <span className="text-xs text-torg-gray">sem acesso</span>;
  const pct = teto > 0 ? Math.min(100, (gasto / teto) * 100) : 100;
  const cor = pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-torg-blue";
  return (
    <div className="w-40">
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden"><div className={`h-full ${cor}`} style={{ width: `${pct}%` }} /></div>
      <p className="text-[11px] text-torg-gray mt-1 tabular-nums">{brl(gasto)} de {brl(teto)}</p>
    </div>
  );
}

export default function EngenhariaIaClient() {
  const { showToast } = useStore();
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [agindo, setAgindo] = useState(null); // id do aparelho ou do usuário em ação
  const [revogar, setRevogar] = useState(null);
  const [tetos, setTetos] = useState({});

  const carregar = useCallback(async () => {
    setErro("");
    try {
      const r = await fetch("/api/admin/engenharia-ia", { cache: "no-store" });
      const d = await r.json().catch(() => ({ error: `O servidor não respondeu (erro ${r.status}). Tente de novo em instantes.` }));
      if (!r.ok) throw new Error(d.error || "Falha ao carregar");
      setDados(d);
      setTetos(Object.fromEntries(d.projetistas.map((p) => [p.id, p.tetoMensalBrl == null ? "" : String(p.tetoMensalBrl).replace(".", ",")])));
    } catch (e) { setErro(e.message); } finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function acao(aparelho, qual) {
    setAgindo(aparelho.id);
    try {
      const r = await fetch(`/api/admin/engenharia-ia/aparelho/${aparelho.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: qual }) });
      const d = await r.json().catch(() => ({ error: `O servidor não respondeu (erro ${r.status}). Tente de novo em instantes.` }));
      if (!r.ok) throw new Error(d.error || "Falha");
      setDados((prev) => ({ ...prev, aparelhos: prev.aparelhos.map((a) => (a.id === aparelho.id ? { ...a, status: d.status } : a)) }));
      showToast(qual === "aprovar" ? `${aparelho.nome} aprovado` : qual === "recusar" ? `${aparelho.nome} recusado` : `${aparelho.nome} revogado`, "success");
    } catch (e) { showToast(e.message, "error"); } finally { setAgindo(null); setRevogar(null); }
  }

  async function salvarTeto(p) {
    const texto = String(tetos[p.id] ?? "").trim();
    const valor = texto === "" ? null : Number(texto.replace(/\./g, "").replace(",", "."));
    if (valor != null && !(valor >= 0)) return showToast("Teto inválido", "error");
    setAgindo(p.id);
    try {
      const r = await fetch("/api/admin/engenharia-ia/limite", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: p.id, tetoMensalBrl: valor }) });
      const d = await r.json().catch(() => ({ error: `O servidor não respondeu (erro ${r.status}). Tente de novo em instantes.` }));
      if (!r.ok) throw new Error(d.error || "Falha");
      setDados((prev) => ({ ...prev, projetistas: prev.projetistas.map((x) => (x.id === p.id ? { ...x, tetoMensalBrl: valor } : x)) }));
      showToast(valor == null ? `Acesso de ${p.nome} removido` : `Teto de ${p.nome}: ${brl(valor)}/mês`, "success");
    } catch (e) { showToast(e.message, "error"); } finally { setAgindo(null); }
  }

  if (carregando) return <div className="flex items-center gap-2 text-torg-gray"><Loader2 className="animate-spin" size={18} /> Carregando o portão de IA…</div>;
  if (erro) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center gap-3">
      <AlertCircle size={18} /> {erro}
      <button onClick={() => { setCarregando(true); carregar(); }} className="ml-auto px-3 py-1.5 rounded-lg bg-white border border-red-200 font-medium">Tentar novamente</button>
    </div>
  );

  const pendentes = dados.aparelhos.filter((a) => a.status === "AGUARDANDO_ADMIN");
  const outros = dados.aparelhos.filter((a) => a.status !== "AGUARDANDO_ADMIN");
  return (
    <div className="space-y-6 max-w-6xl">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-torg-dark flex items-center gap-2"><Cpu size={22} className="text-torg-blue" /> IA da Engenharia</h1>
          <p className="text-sm text-torg-gray mt-1">Os PCs que falam com o Claude pelo portal, o teto mensal de cada projetista e o que está sendo pedido. A chave da Anthropic fica no portal — nunca no PC.</p>
        </div>
        <button onClick={carregar} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-torg-gray hover:bg-gray-50 inline-flex items-center gap-1.5"><RefreshCw size={14} /> Atualizar</button>
      </header>

      <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <h2 className="font-semibold text-torg-dark mb-3">Aguardando sua aprovação <span className="text-torg-gray font-normal">({pendentes.length})</span></h2>
        {pendentes.length === 0 ? (
          <p className="text-sm text-torg-gray flex items-center gap-2"><Laptop size={16} /> Nenhum PC esperando. Quando um projetista vincular o código do app, ele aparece aqui.</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {pendentes.map((a) => (
              <li key={a.id} className="py-2.5 flex items-center gap-3 flex-wrap">
                <Laptop size={16} className="text-torg-gray" />
                <span className="font-medium text-torg-dark">{a.nome}</span>
                <span className="text-sm text-torg-gray">de {a.usuario || "—"} · pedido em {dataHora(a.createdAt)}</span>
                <span className="ml-auto flex gap-2">
                  <button disabled={agindo === a.id} onClick={() => acao(a, "recusar")} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-torg-gray hover:bg-gray-50 inline-flex items-center gap-1"><XCircle size={13} /> Recusar</button>
                  <button disabled={agindo === a.id} onClick={() => acao(a, "aprovar")} className="px-3 py-1.5 text-xs rounded-lg bg-torg-blue text-white font-semibold inline-flex items-center gap-1 disabled:opacity-50">
                    {agindo === a.id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Aprovar
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        <h2 className="font-semibold text-torg-dark px-4 pt-4">Projetistas — teto do mês</h2>
        <p className="text-xs text-torg-gray px-4 mt-0.5 mb-3">Sem teto = sem acesso ao portão. ⚠ O teto é flexível: duas chamadas simultâneas no limite podem passar um pouco.</p>
        {dados.projetistas.length === 0 ? <p className="px-4 pb-4 text-sm text-torg-gray">Ninguém com o módulo Engenharia.</p> : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50/60 text-xs text-torg-gray"><tr><th className="text-left px-4 py-2">Projetista</th><th className="text-left px-4 py-2">Consumo do mês</th><th className="text-right px-4 py-2">Chamadas</th><th className="text-left px-4 py-2">Teto mensal (R$)</th></tr></thead>
            <tbody className="divide-y divide-gray-50">
              {dados.projetistas.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2.5 text-torg-dark">{p.nome}{!p.ativo && <span className="ml-2 text-xs text-red-600">desativado</span>}</td>
                  <td className="px-4 py-2.5"><Barra gasto={p.gastoMesBrl} teto={p.tetoMensalBrl} /></td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{mil(p.chamadasMes)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <input value={tetos[p.id] ?? ""} onChange={(e) => setTetos((t) => ({ ...t, [p.id]: e.target.value }))} placeholder="sem acesso" inputMode="decimal" className="w-28 border border-gray-200 rounded-lg px-2 py-1 text-sm tabular-nums" />
                      <button disabled={agindo === p.id} onClick={() => salvarTeto(p)} className="px-2.5 py-1 text-xs rounded-lg border border-torg-blue text-torg-blue font-medium hover:bg-blue-50 disabled:opacity-50">{agindo === p.id ? "…" : "Salvar"}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <h2 className="font-semibold text-torg-dark mb-3">PCs ligados</h2>
        {outros.length === 0 ? <p className="text-sm text-torg-gray">Nenhum PC aprovado ainda.</p> : (
          <ul className="divide-y divide-gray-50">
            {outros.map((a) => {
              const st = STATUS[a.status] || { rotulo: a.status, cor: "bg-gray-100 text-gray-600" };
              const revogavel = ["ATIVO", "APROVADO"].includes(a.status);
              return (
                <li key={a.id} className="py-2.5 flex items-center gap-3 flex-wrap text-sm">
                  <span className="font-medium text-torg-dark">{a.nome}</span>
                  <span className="text-torg-gray">{a.usuario || "—"}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${st.cor}`}>{st.rotulo}</span>
                  <span className="text-xs text-torg-gray">último uso {dataHora(a.ultimoUsoEm)}</span>
                  {revogavel && <button disabled={agindo === a.id} onClick={() => setRevogar(a)} className="ml-auto px-3 py-1.5 text-xs rounded-lg border border-red-200 text-red-700 hover:bg-red-50 inline-flex items-center gap-1"><Ban size={13} /> Revogar</button>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        <h2 className="font-semibold text-torg-dark px-4 pt-4 mb-3">Últimos usos</h2>
        {dados.usos.length === 0 ? <p className="px-4 pb-4 text-sm text-torg-gray">Nenhuma chamada ainda.</p> : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50/60 text-xs text-torg-gray"><tr><th className="text-left px-4 py-2">Quando</th><th className="text-left px-4 py-2">Quem / PC</th><th className="text-left px-4 py-2">Pedido</th><th className="text-left px-4 py-2">Modelo</th><th className="text-right px-4 py-2">Tokens (entrada/saída)</th><th className="text-right px-4 py-2">Custo</th></tr></thead>
            <tbody className="divide-y divide-gray-50">
              {dados.usos.map((u) => (
                <tr key={u.id} className="align-top">
                  <td className="px-4 py-2 whitespace-nowrap text-torg-gray">{dataHora(u.createdAt)}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{u.usuario || "—"}<div className="text-xs text-torg-gray">{u.aparelho || ""}</div></td>
                  <td className="px-4 py-2 max-w-md"><p className="line-clamp-2 text-torg-dark" title={u.pedido || ""}>{u.pedido || "—"}</p>{u.situacao !== "ok" && <span className="text-[11px] text-amber-700">{SITUACAO[u.situacao] || u.situacao}</span>}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-xs">{u.modelo?.replace("claude-", "") || "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">{mil(u.inputTokens + u.cacheReadTokens)} / {mil(u.outputTokens)}</td>
                  <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">{brl(u.custoBrl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <ConfirmModal open={!!revogar} onClose={() => setRevogar(null)} onConfirm={() => acao(revogar, "revogar")} loading={!!revogar && agindo === revogar.id} variant="destrutivo"
        titulo={`Revogar ${revogar?.nome || ""}?`} labelConfirmar="Revogar acesso"
        mensagem="O PC perde o acesso na hora: a próxima chamada já é recusada. Para voltar, o projetista gera um código novo no app e você aprova de novo." />
    </div>
  );
}
