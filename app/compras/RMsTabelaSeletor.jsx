"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, AlertCircle, Loader2, Mail, X, FileText, Send } from "lucide-react";
import RMRowActions from "@/components/RMRowActions";

const STATUS_LABELS = {
  ABERTA:        { label: "Aberta",         className: "bg-torg-blue-50 text-torg-blue" },
  EM_COTACAO:    { label: "Em cotação",     className: "bg-torg-orange-50 text-torg-orange-700" },
  COTADA:        { label: "Cotada",         className: "bg-torg-blue-100 text-torg-blue-800" },
  PEDIDO_GERADO: { label: "Pedido gerado",  className: "bg-torg-dark text-white" },
  CANCELADA:     { label: "Cancelada",      className: "bg-gray-100 text-gray-500" },
};

const TIPO_RM_LABELS = { ENGENHARIA: "Engenharia", INTERNA: "Interna" };
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

export default function RMsTabelaSeletor({ rms, isAdmin }) {
  const router = useRouter();
  const [selecionadas, setSelecionadas] = useState(new Set());
  const [modalEnviar, setModalEnviar] = useState(false);

  // Só permite cotar RMs que ainda estão em fluxo ativo
  const cotaveis = useMemo(
    () => rms.filter((r) => ["ABERTA", "EM_COTACAO", "COTADA"].includes(r.status)),
    [rms]
  );

  const toggle = (id) => {
    setSelecionadas((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const limpar = () => setSelecionadas(new Set());

  const rmsSelecionadas = useMemo(
    () => rms.filter((r) => selecionadas.has(r.id)),
    [rms, selecionadas]
  );

  return (
    <>
      {/* Action bar — aparece quando 1+ RM selecionada */}
      {selecionadas.size > 0 && (
        <div className="bg-torg-blue text-white rounded-xl shadow-md px-4 py-3 flex items-center justify-between flex-wrap gap-3 sticky top-2 z-10">
          <div className="flex items-center gap-3">
            <span className="font-semibold">
              {selecionadas.size} RM{selecionadas.size !== 1 ? "s" : ""} selecionada{selecionadas.size !== 1 ? "s" : ""}
            </span>
            <span className="text-xs text-white/80">
              ({rmsSelecionadas.reduce((s, r) => s + (r._count?.itens || 0), 0)} itens no total)
            </span>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={limpar}
              className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 rounded-lg font-medium"
            >
              Limpar
            </button>
            <button
              onClick={() => setModalEnviar(true)}
              className="px-3 py-1.5 text-xs bg-white text-torg-blue rounded-lg hover:bg-torg-blue-50 font-semibold inline-flex items-center gap-1"
            >
              <Mail size={14} /> Enviar cotação consolidada
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={cotaveis.length > 0 && selecionadas.size === cotaveis.length}
                    onChange={(e) => {
                      if (e.target.checked) setSelecionadas(new Set(cotaveis.map((r) => r.id)));
                      else limpar();
                    }}
                    className="w-4 h-4 rounded border-gray-300 text-torg-blue focus:ring-torg-blue"
                    title="Selecionar todas as RMs ativas"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nº RM</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">OP / Cliente</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Solicitante</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Itens</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Cot.</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-3 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rms.map((rm) => {
                const s = STATUS_LABELS[rm.status] || STATUS_LABELS.ABERTA;
                const pedidoCount = (rm.itens || []).filter((i) => i.status === "PEDIDO_GERADO").length;
                const pendentes = (rm.itens || []).filter((i) => i.status === "PENDENTE").length;
                const podeSelecionar = ["ABERTA", "EM_COTACAO", "COTADA"].includes(rm.status);
                const checked = selecionadas.has(rm.id);
                return (
                  <tr key={rm.id} className={`hover:bg-gray-50 ${checked ? "bg-torg-blue-50/30" : ""}`}>
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!podeSelecionar}
                        onChange={() => toggle(rm.id)}
                        className="w-4 h-4 rounded border-gray-300 text-torg-blue focus:ring-torg-blue disabled:opacity-30"
                        title={podeSelecionar ? "Selecionar pra cotação consolidada" : "RM não está em fluxo ativo"}
                      />
                    </td>
                    <td className="px-6 py-3">
                      <Link href={`/compras/rm/${rm.id}`} className="font-mono font-semibold text-torg-blue hover:underline">
                        {rm.numero}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-xs text-torg-gray">{TIPO_RM_LABELS[rm.tipoRM]}</td>
                    <td className="px-6 py-3 text-torg-dark">
                      {rm.op ? (
                        <>
                          <span className="font-mono text-xs">{rm.op.numero}</span>
                          <span className="text-xs text-torg-gray block">{rm.op.cliente}</span>
                        </>
                      ) : (
                        <span className="text-torg-gray text-xs">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-torg-dark max-w-xs truncate">{rm.descricao}</td>
                    <td className="px-6 py-3 text-torg-gray text-xs">
                      {rm.createdBy?.name}
                      {rm.setor && <span className="block text-[10px]">{rm.setor}</span>}
                    </td>
                    <td className="px-6 py-3 text-center text-xs">
                      {pedidoCount > 0 ? (
                        <span>
                          <strong>{pedidoCount}</strong> / {rm._count.itens}
                          {pendentes > 0 && <AlertTriangle size={12} className="inline ml-1 text-torg-orange-700" />}
                        </span>
                      ) : (
                        rm._count.itens
                      )}
                    </td>
                    <td className="px-6 py-3 text-center text-torg-gray">{rm._count.cotacoes}</td>
                    <td className="px-6 py-3 text-torg-gray text-xs">{fmtData(rm.createdAt)}</td>
                    <td className="px-6 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.className}`}>
                        {s.label}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <RMRowActions rmId={rm.id} numero={rm.numero} status={rm.status} isAdmin={isAdmin} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modalEnviar && (
        <ModalEnviarConsolidada
          rms={rmsSelecionadas}
          onClose={() => setModalEnviar(false)}
          onSent={() => { setModalEnviar(false); limpar(); router.refresh(); }}
        />
      )}
    </>
  );
}

function ModalEnviarConsolidada({ rms, onClose, onSent }) {
  // Coleta todos os itens cotaveis das RMs selecionadas
  const itensCotaveis = useMemo(() => {
    return rms.flatMap((r) =>
      (r.itens || [])
        .filter((it) => ["PENDENTE", "EM_COTACAO", "COTADO"].includes(it.status))
        .map((it) => ({ ...it, _rmNumero: r.numero }))
    );
  }, [rms]);

  const [itensSelecionados, setItensSelecionados] = useState(
    new Set(itensCotaveis.map((i) => i.id))
  );
  const [emailsTexto, setEmailsTexto] = useState("");
  const [prazo, setPrazo] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 5);
    return d.toISOString().slice(0, 10);
  });
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const toggleItem = (id) => {
    setItensSelecionados((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const parsearFornecedores = () => {
    const linhas = emailsTexto.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
    const fornecedores = [];
    for (const linha of linhas) {
      const m = linha.match(/^(.+?)\s*<(.+?@.+?\..+?)>\s*$/);
      if (m) fornecedores.push({ nome: m[1].trim(), email: m[2].trim() });
      else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(linha)) fornecedores.push({ nome: linha.split("@")[0], email: linha });
    }
    return fornecedores;
  };

  const submit = async () => {
    setErro("");
    const fornecedores = parsearFornecedores();
    if (fornecedores.length === 0) return setErro("Adicione ao menos 1 fornecedor com email válido.");
    if (itensSelecionados.size === 0) return setErro("Selecione ao menos 1 item.");

    setSalvando(true);
    try {
      const res = await fetch("/api/cotacao/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rmIds: rms.map((r) => r.id),
          itensIds: Array.from(itensSelecionados),
          fornecedores,
          prazoResposta: prazo || null,
          observacaoExtra: observacao.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      alert(`✓ ${data.cotacoes.length} cotação(ões) criadas pra ${data.cotacoes.length === 1 ? "1 fornecedor" : `${data.cotacoes.length} fornecedores`} (RMs: ${data.cotacoes[0]?.rmsVinculadas?.join(", ")})`);
      onSent();
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-auto">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h3 className="text-lg font-semibold text-torg-dark inline-flex items-center gap-2">
              <Send size={18} className="text-torg-blue" /> Enviar cotação consolidada
            </h3>
            <p className="text-xs text-torg-gray mt-0.5">
              {rms.length} RMs · {itensCotaveis.length} itens disponíveis
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
            </div>
          )}

          {/* RMs incluídas */}
          <div className="bg-torg-blue-50/40 border border-torg-blue-100 rounded-lg p-3">
            <p className="text-xs font-semibold text-torg-blue mb-2 uppercase tracking-wide">RMs Incluídas</p>
            <div className="flex flex-wrap gap-2">
              {rms.map((r) => (
                <span key={r.id} className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-torg-blue-200 rounded text-xs">
                  <FileText size={11} className="text-torg-blue" />
                  <span className="font-mono font-semibold text-torg-blue">{r.numero}</span>
                  <span className="text-torg-gray">·</span>
                  <span className="text-torg-gray">{(r.itens || []).filter((it) => ["PENDENTE", "EM_COTACAO", "COTADO"].includes(it.status)).length} itens</span>
                </span>
              ))}
            </div>
          </div>

          {/* Itens consolidados */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-torg-dark">
                Itens pra cotar ({itensSelecionados.size} de {itensCotaveis.length})
              </label>
              <div className="flex gap-2 text-xs">
                <button onClick={() => setItensSelecionados(new Set(itensCotaveis.map((i) => i.id)))} className="text-torg-blue font-medium hover:text-torg-dark">Todos</button>
                <span className="text-gray-300">·</span>
                <button onClick={() => setItensSelecionados(new Set())} className="text-torg-gray font-medium hover:text-torg-dark">Nenhum</button>
              </div>
            </div>
            <div className="border border-gray-200 rounded-lg max-h-[300px] overflow-y-auto divide-y divide-gray-100">
              {itensCotaveis.map((it) => {
                const peso = Number(it.peso) || 0;
                const usaKg = peso > 0;
                const qtd = usaKg ? `${peso.toFixed(2)} KG` : `${it.qtd} ${it.unidade}`;
                return (
                  <label key={it.id} className="flex items-center gap-3 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={itensSelecionados.has(it.id)}
                      onChange={() => toggleItem(it.id)}
                      className="w-4 h-4 rounded border-gray-300 text-torg-blue focus:ring-torg-blue"
                    />
                    <span className="font-mono text-[10px] text-torg-blue bg-torg-blue-50 px-1.5 py-0.5 rounded">{it._rmNumero}</span>
                    <span className="flex-1 truncate">{it.descricao}</span>
                    <span className="text-xs text-torg-gray tabular-nums whitespace-nowrap">{qtd}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Fornecedores */}
          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">Fornecedores</label>
            <textarea
              value={emailsTexto}
              onChange={(e) => setEmailsTexto(e.target.value)}
              rows={4}
              placeholder={`Soufer <vendas@soufer.com.br>\nGerdau <comercial@gerdau.com.br>\n...ou só email@fornecedor.com`}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-torg-blue"
            />
            <p className="text-xs text-torg-gray mt-1">
              Um por linha. Cada fornecedor recebe um link único com TODOS os itens das RMs selecionadas.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-torg-dark mb-1">Prazo de resposta</label>
              <input
                type="date" value={prazo}
                onChange={(e) => setPrazo(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-torg-dark mb-1">Observação (opcional)</label>
              <input
                type="text" value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex: Entrega urgente, frete CIF"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 sticky bottom-0">
          <button onClick={onClose} className="px-4 py-2 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100 text-sm">
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={salvando}
            className="px-5 py-2 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
          >
            {salvando && <Loader2 size={14} className="animate-spin" />}
            <Send size={14} /> Enviar pra fornecedores
          </button>
        </div>
      </div>
    </div>
  );
}
