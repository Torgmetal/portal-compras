"use client";
import { useState, useEffect, useCallback } from "react";
import { Loader2, Eye, Download, MailCheck, RefreshCw, UserX } from "lucide-react";

const fmtDH = (d) => (d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

/**
 * Quem recebeu o portal, quem abriu e o que baixou.
 *
 * ⚠ CADA DESTINATÁRIO TEM UM CÓDIGO no link do e-mail — é ele que dá nome ao acesso. Antes o portal
 * tinha um link só e um contador: dava para dizer "abriram 7 vezes", nunca "o Fulano baixou o
 * certificado", que é a pergunta que se faz quando o cliente cobra por telefone.
 */
export default function HistoricoPortal({ opNumero }) {
  const [d, setD] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await fetch(`/api/portal/historico?opNumero=${encodeURIComponent(opNumero)}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao carregar");
      setD(j);
    } catch (e) { setErro(e.message); } finally { setCarregando(false); }
  }, [opNumero]);
  useEffect(() => { carregar(); }, [carregar]);

  const dest = d?.destinatarios || [];
  const ev = d?.eventos || [];

  return (
    <div className="border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-[13px] font-semibold text-torg-dark inline-flex items-center gap-1.5 flex-1">
          <MailCheck size={14} className="text-torg-blue" /> Quem recebeu, abriu e baixou
        </p>
        <button onClick={carregar} disabled={carregando}
          className="text-[11px] text-torg-gray border border-gray-200 rounded-lg px-2.5 py-1 hover:bg-gray-50 inline-flex items-center gap-1 disabled:opacity-50">
          {carregando ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} atualizar
        </button>
      </div>

      {erro && <p className="text-[12px] text-red-600">{erro}</p>}

      {!d ? (
        <p className="text-[12px] text-torg-gray inline-flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> carregando…</p>
      ) : !dest.length ? (
        <p className="text-[12px] text-torg-gray">
          Ninguém recebeu o portal ainda. O histórico por pessoa começa no primeiro envio — envios
          feitos antes de 26/08/2026 não têm código e aparecem como acesso sem identificação.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto border border-gray-100 rounded-lg">
            <table className="w-full text-[12px]">
              <thead className="bg-gray-50 text-[10px] uppercase text-torg-gray">
                <tr className="text-left">
                  <th className="px-2.5 py-1.5">Pessoa</th>
                  <th className="px-2.5 py-1.5">Enviado</th>
                  <th className="px-2.5 py-1.5 text-right">Aberturas</th>
                  <th className="px-2.5 py-1.5 text-right">Downloads</th>
                  <th className="px-2.5 py-1.5">1º acesso</th>
                  <th className="px-2.5 py-1.5">Último</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {dest.map((p) => (
                  <tr key={p.id} className={p.nuncaAbriu ? "bg-amber-50/50" : ""}>
                    <td className="px-2.5 py-1.5">
                      <span className="font-semibold text-torg-dark">{p.nome || "—"}</span>
                      <span className="block text-[10px] text-torg-gray">{p.email}</span>
                    </td>
                    <td className="px-2.5 py-1.5 tabular-nums text-torg-gray whitespace-nowrap">{fmtDH(p.enviadoEm)}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums font-semibold">{p.aberturas}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums font-semibold">{p.downloads}</td>
                    <td className="px-2.5 py-1.5 tabular-nums text-torg-gray whitespace-nowrap">
                      {/* ⚠ "enviado e nunca aberto" é o dado mais acionável daqui: é o cliente que
                          ainda não sabe que o portal existe, e é a ele que se liga. */}
                      {p.nuncaAbriu ? <span className="text-amber-700 font-semibold">nunca abriu</span> : fmtDH(p.primeiroAcessoEm)}
                    </td>
                    <td className="px-2.5 py-1.5 tabular-nums text-torg-gray whitespace-nowrap">{fmtDH(p.ultimoAcessoEm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {d.anonimos > 0 && (
            <p className="text-[11px] text-torg-gray inline-flex items-center gap-1.5">
              <UserX size={12} /> {d.anonimos} acesso(s) sem identificação — link repassado, ou envio
              anterior ao histórico por pessoa.
            </p>
          )}

          {ev.length > 0 && (
            <div>
              <p className="text-[10px] uppercase font-semibold text-torg-gray tracking-wide mb-1">Últimos eventos</p>
              <div className="max-h-56 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
                {ev.map((e) => (
                  <div key={e.id} className="flex items-center gap-2 px-2.5 py-1.5 text-[11px]">
                    {e.evento === "DOWNLOAD"
                      ? <Download size={11} className="text-torg-blue shrink-0" />
                      : <Eye size={11} className="text-torg-gray shrink-0" />}
                    <span className="text-torg-gray tabular-nums whitespace-nowrap">{fmtDH(e.em)}</span>
                    <span className="text-torg-dark truncate flex-1">
                      {e.email || <span className="text-torg-gray-light">sem identificação</span>}
                      {e.documento && <span className="text-torg-gray"> · {e.documento}</span>}
                    </span>
                    {e.secao && <span className="text-[10px] text-torg-gray-light shrink-0">{e.secao}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
