"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtOP } from "@/lib/utils";
import {
  Loader2, AlertCircle, Plus, BookCheck, ChevronRight, X, Check, Weight, Search, Archive, FolderOpen, CheckCircle2,
} from "lucide-react";

// ⚠ CONCLUÍDO = EMITIDO. Vitor (28/08/2026): "os data books que já foram concluídos criar uma aba
// para que eles fiquem registrados nessa aba". Depois de emitido o dossiê está fechado — o que vem
// depois (envio e aceite do cliente) é o caminho dele, não montagem. Em montagem = em aberto.
const CONCLUIDO = new Set(["EMITIDO", "ENVIADO_CLIENTE", "ACEITO"]);
const STATUS_LABEL = { EMITIDO: "Emitido", ENVIADO_CLIENTE: "Enviado ao cliente", ACEITO: "Aceito pelo cliente" };
const numOP = (n) => parseInt(String(n ?? "").replace(/\D/g, ""), 10) || 0;
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");

const fmtKg = (v) => (!v ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`);

export default function DataBooksClient() {
  const router = useRouter();
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [modal, setModal] = useState(false);
  const [ops, setOps] = useState([]);
  const [aba, setAba] = useState("ABERTOS");

  const carregar = useCallback(async () => {
    setLoading(true); setErro("");
    try {
      const res = await fetch("/api/qualidade/data-books");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao carregar");
      setBooks(json.data || []);
      setOps(json.ops || []);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // ⚠ EM ABERTO EM ORDEM NUMÉRICA, DA MAIOR PARA A MENOR (Vitor, 28/08/2026): a OP mais nova é a
  // que está em montagem agora; as antigas que ainda não fecharam ficam no fim, onde se procura por
  // elas. O registro dos concluídos vai na ordem da emissão — é um livro de registro, e livro de
  // registro é cronológico.
  const abertos = books.filter((b) => !CONCLUIDO.has(b.status)).sort((a, b) => numOP(b.opNumero) - numOP(a.opNumero));
  const concluidos = books.filter((b) => CONCLUIDO.has(b.status))
    .sort((a, b) => new Date(b.emitidoEm || b.createdAt) - new Date(a.emitidoEm || a.createdAt));
  const lista = aba === "CONCLUIDOS" ? concluidos : abertos;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-torg-dark flex items-center gap-2">
            <BookCheck size={20} className="text-torg-blue" /> Data Books
          </h1>
          <p className="text-xs text-torg-gray mt-0.5">Dossiês de qualidade por OP — 20 seções amarradas à norma (NBR 16775).</p>
        </div>
        <button onClick={() => setModal(true)} className="text-sm font-semibold text-white bg-torg-blue hover:bg-torg-dark px-4 py-2 rounded-lg inline-flex items-center gap-2 shrink-0">
          <Plus size={15} /> Novo data book
        </button>
      </div>

      <div className="flex items-center gap-1 border-b border-gray-200 mb-4">
        {[
          { k: "ABERTOS", l: "Em montagem", n: abertos.length, icon: FolderOpen },
          { k: "CONCLUIDOS", l: "Concluídos", n: concluidos.length, icon: Archive },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.k} onClick={() => setAba(t.k)}
              className={`px-4 py-2.5 text-sm font-medium inline-flex items-center gap-1.5 border-b-2 -mb-px transition-colors ${aba === t.k ? "border-torg-blue text-torg-blue" : "border-transparent text-torg-gray hover:text-torg-dark"}`}>
              <Icon size={15} /> {t.l}
              <span className={`ml-1 text-[11px] px-1.5 py-0.5 rounded-full ${aba === t.k ? "bg-torg-blue/10 text-torg-blue" : "bg-gray-100 text-torg-gray"}`}>{t.n}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-torg-gray"><Loader2 size={26} className="animate-spin mb-3" /><p className="text-sm">Carregando…</p></div>
      ) : erro ? (
        <div className="flex flex-col items-center justify-center py-16 text-center"><AlertCircle size={26} className="text-red-500 mb-3" /><p className="text-sm text-torg-dark mb-3">{erro}</p><button onClick={carregar} className="text-xs text-torg-blue hover:underline">Tentar novamente</button></div>
      ) : lista.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center text-torg-gray">
          <BookCheck size={32} className="mb-3 opacity-40" />
          <p className="text-sm font-medium text-torg-dark">{aba === "CONCLUIDOS" ? "Nenhum data book emitido ainda" : "Nenhum data book em montagem"}</p>
          <p className="text-xs mt-1">{aba === "CONCLUIDOS" ? "Assim que um dossiê for emitido, ele fica registrado aqui." : "Crie um para uma OP e monte as 20 seções."}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {lista.map((b) => (
            <Link key={b.id} href={`/qualidade/data-books/${b.id}`} className="block bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-sm font-bold text-torg-blue font-mono whitespace-nowrap">{fmtOP(b.opNumero)}</span>
                  <span className="text-sm text-torg-dark font-medium truncate">{b.cliente || "—"}</span>
                  {b.obra && <span className="text-xs text-torg-gray whitespace-nowrap shrink-0">({b.obra})</span>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-torg-gray inline-flex items-center gap-1"><Weight size={12} /> {fmtKg(b.pesoTotalKg)}</span>
                  {CONCLUIDO.has(b.status) ? (
                    <>
                      {b.emitidoEm && <span className="text-xs text-torg-gray whitespace-nowrap">emitido em {fmtD(b.emitidoEm)}</span>}
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-700 inline-flex items-center gap-1">
                        <CheckCircle2 size={10} /> {STATUS_LABEL[b.status] || b.status}
                      </span>
                    </>
                  ) : (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${b.pendentes === 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                      {b.progresso}% · {b.pendentes} pendente(s)
                    </span>
                  )}
                  <ChevronRight size={16} className="text-torg-gray" />
                </div>
              </div>
              <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-torg-blue rounded-full transition-all" style={{ width: `${b.progresso}%` }} />
              </div>
            </Link>
          ))}
        </div>
      )}

      {modal && <ModalNovo ops={ops} onClose={() => setModal(false)} onCreated={(id) => router.push(`/qualidade/data-books/${id}`)} />}
    </div>
  );
}

/**
 * ⚠⚠ CRIAR É ESCOLHER UMA OP, NÃO DIGITAR UM NÚMERO. Vitor (28/08/2026): "na criação do data book
 * preciso que deixe a listagem de OPs". Digitando "083" à mão se cria o dossiê na obra errada — e
 * ele nasce com cliente, obra e peso de outra. A lista já marca quem JÁ TEM data book, para não
 * tentar duas vezes.
 */
function ModalNovo({ ops = [], onClose, onCreated }) {
  const [op, setOp] = useState("");
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const q = busca.trim().toLowerCase();
  const disponiveis = ops.filter((o) => !o.temDataBook);
  const filtradas = (q
    ? disponiveis.filter((o) => `${o.numero} ${o.cliente || ""} ${o.obra || ""}`.toLowerCase().includes(q))
    : disponiveis
  ).slice(0, 60);

  async function criar(numero) {
    const alvo = String(numero ?? op).trim();
    setErro("");
    if (!alvo) { setErro("Escolha a OP."); return; }
    setSalvando(true);
    try {
      const res = await fetch("/api/qualidade/data-books", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opNumero: alvo }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Erro ao criar");
      onCreated(json.id);
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-bold text-torg-dark flex items-center gap-1.5"><BookCheck size={15} className="text-torg-blue" /> Novo data book</p>
          <button onClick={onClose} className="p-1 text-torg-gray hover:text-torg-dark rounded hover:bg-gray-100"><X size={16} /></button>
        </div>

        <div className="px-4 pt-3">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-torg-gray-light" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} autoFocus
              placeholder="Buscar por OP, cliente ou obra…"
              className="w-full pl-8 pr-2 py-2 text-[13px] border border-gray-200 rounded-lg focus:border-torg-blue focus:ring-1 focus:ring-torg-blue-300 outline-none" />
          </div>
          <p className="text-[11px] text-torg-gray mt-2">Puxa cliente, obra, peso e nº de peças da OP e cria as 20 seções.</p>
        </div>

        <div className="px-4 py-3 max-h-80 overflow-y-auto">
          {!ops.length ? (
            <p className="text-[12px] text-torg-gray py-6 text-center">Nenhuma OP carregada.</p>
          ) : !filtradas.length ? (
            <p className="text-[12px] text-torg-gray py-6 text-center">
              {q ? "Nenhuma OP encontrada." : "Todas as OPs já têm data book."}
            </p>
          ) : (
            <div className="space-y-1">
              {filtradas.map((o) => (
                <button key={o.numero} type="button" disabled={salvando}
                  onClick={() => { setOp(o.numero); criar(o.numero); }}
                  className={`w-full text-left px-3 py-2 rounded-lg border transition-colors disabled:opacity-50 ${op === o.numero ? "border-torg-blue bg-torg-blue-50/40" : "border-gray-100 hover:border-torg-blue-300 hover:bg-gray-50"}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[13px] font-bold text-torg-blue font-mono shrink-0">{fmtOP(o.numero)}</span>
                    <span className="text-[13px] text-torg-dark truncate">{o.cliente || "—"}</span>
                    {o.obra && <span className="text-[11px] text-torg-gray truncate shrink-0">({o.obra})</span>}
                    {salvando && op === o.numero && <Loader2 size={12} className="animate-spin text-torg-blue ml-auto shrink-0" />}
                  </div>
                </button>
              ))}
            </div>
          )}
          {/* as que já têm dossiê ficam de fora da lista — dizer isso evita procurar pela que sumiu */}
          {ops.length > disponiveis.length && (
            <p className="text-[11px] text-torg-gray mt-3 pt-2 border-t border-gray-100">
              {ops.length - disponiveis.length} OP(s) fora da lista por já terem data book.
            </p>
          )}
          {erro && <p className="text-[11px] text-red-600 flex items-center gap-1 mt-2"><AlertCircle size={12} /> {erro}</p>}
        </div>

        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={salvando} className="px-3 py-1.5 text-[12px] text-torg-gray hover:text-torg-dark rounded-lg hover:bg-gray-100 disabled:opacity-50">Cancelar</button>
        </div>
      </div>
    </div>
  );
}
