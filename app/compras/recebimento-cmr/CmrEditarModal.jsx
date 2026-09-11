"use client";
import { useState } from "react";
import { Loader2, Save, X, Pencil } from "lucide-react";
import { useStore } from "@/lib/store";
import { avisosDeTinta } from "@/lib/material-tinta";
import CmrCampos, { linhaParaFormulario } from "./CmrCampos";

// EDITAR UMA LINHA JÁ LANÇADA.
//
// ⚠⚠ MATHEUS (11/09/2026): "às vezes falta informações e ele vai preencher depois de ter lançado a
// linha". O recebimento entra com a nota na mão e o certificado do material chega dias depois. Sem
// editar, a única saída era excluir e relançar — e isso QUEIMA UM ÍNDICE R que já foi anotado no
// material e na planilha do servidor. A tela inteira é sobre rastreabilidade; corrigir um campo não
// pode custar o rastro.
//
// ⚠ O ÍNDICE R APARECE, MAS NÃO É CAMPO. Ele é a chave entre portal, planilha e o que está escrito
// no material. Mostrar em texto deixa claro qual linha está aberta; deixar editar transformaria uma
// correção de campo em "apontar este registro para outro material".

export default function CmrEditarModal({ linha, ano, onFechar, onSalvo }) {
  const { showToast } = useStore();
  const [form, setForm] = useState(() => linhaParaFormulario(linha));
  const [salvando, setSalvando] = useState(false);
  const setF = (k, v) => setForm((s) => ({ ...s, [k]: v }));

  async function salvar() {
    if (!form.descricao.trim()) { showToast("Informe a descrição do material", "erro"); return; }
    // ⚠ AVISA, NÃO BLOQUEIA — mesma regra do lançamento: travar faria alguém inventar uma data,
    // que é pior do que o "—" honesto. Ver o comentário em CmrLancarClient.
    const faltando = avisosDeTinta(form);
    if (faltando.length && !confirm(
      `Este material é tinta e ficou sem ${faltando.join(" e ")}.\n\n` +
      "Sem validade o lote não entra na ordem de consumo por vencimento (FEFO).\n\nSalvar assim mesmo?"
    )) return;
    setSalvando(true);
    try {
      const r = await fetch(`/api/compras/cmr/${linha.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Falha ao salvar");
      if (j.semMudanca) { showToast("Nenhum campo mudou", "info"); onFechar(); return; }
      // ⚠ O AVISO DA PLANILHA É PARTE DO RESULTADO, não um detalhe técnico. O writeback é
      // best-effort: se ele falhar e o toast disser só "salvo", a pessoa vai embora achando que a
      // planilha do servidor está igual — e ela não está até alguém clicar em Sincronizar.
      const sp = j.planilha ? (j.planilha.ok ? " · planilha atualizada" : " · ⚠ planilha NÃO atualizada, use Sincronizar") : "";
      showToast(`R ${j.importRef} atualizado${sp}`, j.planilha && !j.planilha.ok ? "erro" : "success");
      onSalvo(j.item);
    } catch (e) { showToast(e.message, "erro"); } finally { setSalvando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto"
      onClick={() => !salvando && onFechar()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl my-8 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <h3 className="text-base font-bold text-torg-dark inline-flex items-center gap-2">
            <Pencil size={17} className="text-torg-blue" />
            Editar lançamento <span className="font-mono text-torg-blue">R {linha.importRef}</span>
            <span className="text-[12px] font-normal text-torg-gray">· {ano}</span>
          </h3>
          <button onClick={onFechar} disabled={salvando} className="text-torg-gray hover:text-red-600 disabled:opacity-40"><X size={18} /></button>
        </div>
        <div className="px-5 py-4">
          <CmrCampos form={form} setF={setF} />
        </div>
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[11px] text-torg-gray">
            O índice R não muda. A alteração fica registrada no log e é reescrita na planilha do servidor.
          </p>
          <div className="flex gap-2">
            <button onClick={onFechar} disabled={salvando} className="px-4 py-2 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100">Cancelar</button>
            <button onClick={salvar} disabled={salvando}
              className="px-5 py-2 bg-torg-blue text-white rounded-lg text-sm font-medium inline-flex items-center gap-2 hover:bg-torg-dark disabled:opacity-50">
              {salvando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar alterações
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
