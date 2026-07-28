"use client";
import { useEffect, useState } from "react";
import { ClipboardList, Check, X, Loader2, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";

const STATUS_LABEL = {
  ABERTA: "Aberta", EM_EXECUCAO: "Em execução", ATRASADA: "Atrasada",
  ENCERRADA: "Encerrada", CANCELADA: "Cancelada",
};

// Badge ✓/✗ pra cada tipo de lista.
function Marca({ tem, n }) {
  return tem ? (
    <span title={`${n} peça(s) importada(s)`} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[12px] font-semibold">
      <Check size={13} /> tem
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 text-[12px] font-semibold">
      <X size={13} /> falta
    </span>
  );
}

export default function CoberturaListas() {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [todas, setTodas] = useState(false); // incluir encerradas/canceladas
  const [soFaltantes, setSoFaltantes] = useState(true); // esconder obras 100% cobertas
  const [aberto, setAberto] = useState(true);

  async function carregar(incluirTodas) {
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/engenharia/listas/cobertura${incluirTodas ? "?todas=1" : ""}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setDados(j);
    } catch (e) {
      setErro(e.message || "Falha ao carregar");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(todas); }, [todas]);

  const linhas = dados?.linhas || [];
  const visiveis = soFaltantes ? linhas.filter((l) => !l.temLE || !l.temLPC) : linhas;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
      <button onClick={() => setAberto((v) => !v)} className="w-full flex items-center gap-3 p-5 text-left">
        <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex-shrink-0"><ClipboardList size={19} /></span>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-torg-dark">Obras sem lista</h2>
          <p className="text-[13px] text-torg-gray">
            {dados
              ? `${dados.semAlguma} de ${dados.total} obra(s) ${todas ? "" : "ativa(s) "}sem alguma lista · ${dados.semLPC} sem LPC · ${dados.semLE} sem LE`
              : "Cobertura de LE e LPC por OP"}
          </p>
        </div>
        {aberto ? <ChevronUp size={18} className="text-torg-gray" /> : <ChevronDown size={18} className="text-torg-gray" />}
      </button>

      {aberto && (
        <div className="px-5 pb-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3 text-[12px]">
            <label className="inline-flex items-center gap-1.5 cursor-pointer text-torg-dark">
              <input type="checkbox" checked={soFaltantes} onChange={(e) => setSoFaltantes(e.target.checked)} className="rounded border-gray-300" />
              Só as que faltam
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer text-torg-dark">
              <input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} className="rounded border-gray-300" />
              Incluir encerradas/canceladas
            </label>
            <button onClick={() => carregar(todas)} disabled={carregando} className="inline-flex items-center gap-1 text-torg-blue hover:underline disabled:opacity-50">
              {carregando ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Atualizar
            </button>
          </div>

          {erro && <p className="text-[13px] text-red-600">Não consegui carregar: {erro}</p>}

          {!erro && carregando && !dados && (
            <p className="text-[13px] text-torg-gray flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Carregando…</p>
          )}

          {!erro && dados && visiveis.length === 0 && (
            <p className="text-[13px] text-emerald-700 bg-emerald-50/60 border border-emerald-100 rounded-lg p-3">
              {soFaltantes ? "Todas as obras listadas têm LE e LPC. 🎉" : "Nenhuma obra encontrada."}
            </p>
          )}

          {!erro && dados && visiveis.length > 0 && (
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full text-[13px] border-collapse">
                <thead>
                  <tr className="text-left text-torg-gray border-b border-gray-100">
                    <th className="py-2 pr-3 font-semibold">OP</th>
                    <th className="py-2 pr-3 font-semibold">Obra / Cliente</th>
                    <th className="py-2 pr-3 font-semibold whitespace-nowrap">Status</th>
                    <th className="py-2 pr-3 font-semibold text-center">LPC</th>
                    <th className="py-2 font-semibold text-center">LE</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((l) => (
                    <tr key={l.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-2 pr-3 font-bold text-torg-dark whitespace-nowrap">{l.numero}</td>
                      <td className="py-2 pr-3">
                        <div className="text-torg-dark truncate max-w-[260px]">{l.obra || "—"}</div>
                        <div className="text-[11px] text-torg-gray truncate max-w-[260px]">{l.cliente}</div>
                      </td>
                      <td className="py-2 pr-3 text-torg-gray whitespace-nowrap">{STATUS_LABEL[l.status] || l.status}</td>
                      <td className="py-2 pr-3 text-center"><Marca tem={l.temLPC} n={l.nLPC} /></td>
                      <td className="py-2 text-center"><Marca tem={l.temLE} n={l.nLE} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
