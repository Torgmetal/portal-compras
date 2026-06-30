"use client";
import { useState, useEffect, useCallback } from "react";
import { signOut } from "next-auth/react";
import {
  Receipt, Loader2, AlertCircle, RefreshCw, Inbox, LogOut, FileText, CheckCircle2,
} from "lucide-react";

const TIPO_LABEL = { MENSAL: "Mensal", DECIMO_TERCEIRO: "13º salário", FERIAS: "Férias", RESCISAO: "Rescisão" };

function competenciaExtenso(c) {
  if (!c) return "";
  const [ano, mes] = c.split("-");
  const nomes = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  return `${nomes[Number(mes)] || mes} de ${ano}`;
}

export default function MeuRHClient({ nome }) {
  const [holerites, setHolerites] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [confirmando, setConfirmando] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await fetch("/api/meu-rh/holerite");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao carregar");
      setHolerites(d.holerites || []);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const abrir = (id) => {
    // Abre o PDF no proxy autenticado (marca como visualizado no servidor).
    window.open(`/api/meu-rh/holerite/${id}/arquivo`, "_blank", "noopener");
    // Atualiza o status localmente após um instante.
    setTimeout(carregar, 1500);
  };

  const confirmar = async (id) => {
    setConfirmando(id);
    try {
      const r = await fetch(`/api/meu-rh/holerite/${id}/confirmar`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao confirmar");
      setHolerites((prev) => prev.map((h) => (h.id === id ? { ...h, status: "CONFIRMADO", confirmadoEm: d.confirmadoEm || new Date().toISOString() } : h)));
    } catch (e) {
      setErro(e.message);
    } finally {
      setConfirmando(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-torg-blue flex items-center justify-center text-white"><Receipt size={20} /></div>
          <div>
            <h1 className="text-xl font-extrabold text-torg-dark leading-tight">Meus Holerites</h1>
            <p className="text-sm text-torg-gray">Olá, {nome}</p>
          </div>
        </div>
        <button onClick={() => signOut({ callbackUrl: "/entrar" })}
          className="text-sm text-torg-gray hover:text-torg-dark inline-flex items-center gap-1.5"><LogOut size={16} /> Sair</button>
      </header>

      {carregando ? (
        <div className="py-16 text-center text-torg-gray"><Loader2 size={28} className="mx-auto animate-spin mb-2" /> Carregando...</div>
      ) : erro ? (
        <div className="py-16 text-center">
          <AlertCircle size={28} className="mx-auto text-red-400 mb-2" />
          <p className="text-sm text-red-600 mb-3">{erro}</p>
          <button onClick={carregar} className="px-3 py-1.5 text-sm bg-torg-blue text-white rounded-lg inline-flex items-center gap-2"><RefreshCw size={14} /> Tentar novamente</button>
        </div>
      ) : holerites.length === 0 ? (
        <div className="py-16 text-center">
          <Inbox size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-torg-gray">Você ainda não tem holerites disponíveis.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {holerites.map((h) => {
            const confirmado = h.status === "CONFIRMADO";
            return (
              <div key={h.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="font-semibold text-torg-dark">{competenciaExtenso(h.competencia)}</div>
                  <div className="text-xs text-torg-gray mt-0.5">
                    {TIPO_LABEL[h.tipo] || h.tipo}{h.empresa ? ` · ${h.empresa}` : ""}
                    {confirmado && h.confirmadoEm ? ` · confirmado em ${new Date(h.confirmadoEm).toLocaleDateString("pt-BR")}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => abrir(h.id)}
                    className="px-3 py-2 bg-white border border-torg-blue-200 text-torg-blue text-sm rounded-lg hover:bg-torg-blue-50 font-medium flex items-center gap-2">
                    <FileText size={15} /> Ver holerite
                  </button>
                  {confirmado ? (
                    <span className="px-3 py-2 text-sm text-green-700 bg-green-50 rounded-lg font-medium flex items-center gap-2"><CheckCircle2 size={15} /> Recebido</span>
                  ) : (
                    <button onClick={() => confirmar(h.id)} disabled={confirmando === h.id}
                      className="px-3 py-2 bg-torg-orange text-white text-sm rounded-lg hover:bg-torg-orange/90 font-medium flex items-center gap-2 disabled:opacity-50">
                      {confirmando === h.id ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Recebi e confirmo
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-center text-[11px] text-gray-400 mt-8">Workspace Torg — uso interno / confidencial</p>
    </div>
  );
}
