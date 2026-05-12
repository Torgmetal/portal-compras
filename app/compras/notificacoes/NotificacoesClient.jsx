"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Plus, Trash2, AlertCircle, Loader2, Mail } from "lucide-react";

const EVENTOS = [
  { codigo: "RM_CRIADA", label: "Nova RM criada", descricao: "Quando alguém sobe uma RM nova pra cotação" },
];

export default function NotificacoesClient({ inscritosIniciais }) {
  const router = useRouter();
  const [inscritos, setInscritos] = useState(inscritosIniciais || []);
  const [modalNovo, setModalNovo] = useState(false);
  const [erro, setErro] = useState("");

  const toggleAtivo = async (inscrito) => {
    setErro("");
    try {
      const res = await fetch(`/api/admin/notificacoes/${inscrito.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: !inscrito.ativo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      setInscritos((p) => p.map((i) => (i.id === inscrito.id ? data.inscrito : i)));
    } catch (e) {
      setErro(e.message);
    }
  };

  const remover = async (inscrito) => {
    if (!window.confirm(`Remover ${inscrito.email} das notificações?`)) return;
    setErro("");
    try {
      const res = await fetch(`/api/admin/notificacoes/${inscrito.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      setInscritos((p) => p.filter((i) => i.id !== inscrito.id));
    } catch (e) {
      setErro(e.message);
    }
  };

  const onAdicionado = (novo) => {
    setInscritos((p) => {
      const sem = p.filter((i) => i.id !== novo.id);
      return [novo, ...sem];
    });
    setModalNovo(false);
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight inline-flex items-center gap-2">
            <Bell size={26} className="text-torg-blue" /> Notificações por email
          </h2>
          <p className="text-sm text-torg-gray mt-1">
            Gerencia os emails que recebem notificações automáticas do sistema (ex: nova RM cadastrada).
          </p>
        </div>
        <button
          onClick={() => setModalNovo(true)}
          className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue-700 inline-flex items-center gap-2"
        >
          <Plus size={16} /> Adicionar email
        </button>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {inscritos.length === 0 ? (
          <div className="p-12 text-center">
            <Mail size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-torg-gray text-lg">Nenhum email inscrito</p>
            <p className="text-xs text-torg-gray mt-1">
              Adicione um email pra começar a receber notificações.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email / Nome</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Eventos</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {inscritos.map((i) => (
                <tr key={i.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="text-torg-dark font-medium">{i.email}</p>
                    {i.nome && <p className="text-xs text-torg-gray">{i.nome}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(i.eventos || []).map((ev) => {
                        const e = EVENTOS.find((x) => x.codigo === ev);
                        return (
                          <span key={ev} className="text-[11px] bg-torg-blue-50 text-torg-blue px-2 py-0.5 rounded-full font-medium" title={e?.descricao || ev}>
                            {e?.label || ev}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleAtivo(i)}
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        i.ativo
                          ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      }`}
                      title="Clique pra pausar/ativar"
                    >
                      {i.ativo ? "Ativo" : "Pausado"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => remover(i)}
                      className="text-xs text-red-600 hover:text-red-800 font-medium inline-flex items-center gap-1"
                    >
                      <Trash2 size={12} /> Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalNovo && (
        <ModalNovo
          eventos={EVENTOS}
          onClose={() => setModalNovo(false)}
          onSaved={onAdicionado}
        />
      )}
    </div>
  );
}

function ModalNovo({ eventos, onClose, onSaved }) {
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [eventosMarcados, setEventosMarcados] = useState(new Set(eventos.map((e) => e.codigo)));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const toggleEvento = (codigo) => {
    setEventosMarcados((p) => {
      const next = new Set(p);
      if (next.has(codigo)) next.delete(codigo);
      else next.add(codigo);
      return next;
    });
  };

  const submit = async () => {
    setErro("");
    if (!email.trim()) return setErro("Email obrigatório.");
    if (eventosMarcados.size === 0) return setErro("Marque ao menos 1 evento.");
    setSalvando(true);
    try {
      const res = await fetch("/api/admin/notificacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          nome: nome.trim() || null,
          eventos: Array.from(eventosMarcados),
          ativo: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      onSaved(data.inscrito);
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-torg-dark">Adicionar email pra notificações</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Email *</label>
            <input
              type="email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vitor@torg.com.br"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Nome (opcional)</label>
            <input
              type="text" value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Vitor Costa"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-2">Eventos *</label>
            <div className="space-y-2">
              {eventos.map((ev) => (
                <label key={ev.codigo} className="flex items-start gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={eventosMarcados.has(ev.codigo)}
                    onChange={() => toggleEvento(ev.codigo)}
                    className="mt-0.5 w-4 h-4 rounded border-gray-300 text-torg-blue focus:ring-torg-blue"
                  />
                  <div>
                    <p className="text-sm font-medium text-torg-dark">{ev.label}</p>
                    <p className="text-xs text-torg-gray">{ev.descricao}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100 text-sm">
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={salvando}
            className="px-5 py-2 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
          >
            {salvando && <Loader2 size={14} className="animate-spin" />} Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}
