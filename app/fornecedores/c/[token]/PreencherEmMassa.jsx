"use client";
import { useState } from "react";

/**
 * ICMS, IPI E PRAZO EM TODOS OS ITENS DE UMA VEZ.
 *
 * ⚠⚠ Matheus (21/09/2026): "tem que ser possível inserir o ICMS/IPI/Data de entrega em massa para
 * todos os itens de uma vez e depois alterar somente os que ele quiser". Medido na proposta real
 * da SOUFER (T122-001): 9 itens, ICMS 12% e IPI 0% em TODOS — 18 campos digitados para dizer duas
 * coisas, numa tela pública que o fornecedor abandona quando dá trabalho.
 *
 * ⚠ MORA EM ARQUIVO PRÓPRIO porque o formulário do fornecedor já tem 1.182 linhas e complexidade
 * 73 (teto: 350 e 12). O atalho não podia ser pago engordando o que já está grande demais.
 *
 * ⚠ Campo vazio significa "não mexer nisso" — quem quer só o ICMS não redigita o IPI.
 *
 * @param {{ onAplicar: (v:{icms:string, ipi:string, prazo:string}) => string }} props
 *        `onAplicar` devolve a frase de confirmação (quantos itens foram tocados).
 */
export default function PreencherEmMassa({ onAplicar }) {
  const [icms, setIcms] = useState("");
  const [ipi, setIpi] = useState("");
  const [prazo, setPrazo] = useState("");
  const [aviso, setAviso] = useState("");

  const mudar = (set) => (e) => { set(e.target.value); setAviso(""); };

  const aplicar = () => {
    if (!icms.trim() && !ipi.trim() && !prazo.trim()) {
      return setAviso("Preencha ICMS, IPI ou prazo antes de aplicar.");
    }
    setAviso(onAplicar({ icms, ipi, prazo }));
  };

  const campo = "block w-20 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:ring-2 focus:ring-torg-blue";

  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
      <div className="flex flex-wrap items-end gap-2">
        <span className="text-xs font-medium text-torg-dark mr-1 mb-2">Aplicar a todos os itens:</span>
        <label className="text-[11px] text-torg-gray">
          ICMS %
          <input type="text" inputMode="decimal" value={icms} onChange={mudar(setIcms)}
            placeholder="12" aria-label="ICMS % para todos os itens" className={campo} />
        </label>
        <label className="text-[11px] text-torg-gray">
          IPI %
          <input type="text" inputMode="decimal" value={ipi} onChange={mudar(setIpi)}
            placeholder="0" aria-label="IPI % para todos os itens" className={campo} />
        </label>
        <label className="text-[11px] text-torg-gray">
          Prazo de entrega
          <input type="date" value={prazo} onChange={mudar(setPrazo)}
            aria-label="Prazo de entrega para todos os itens"
            className="block border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-torg-blue" />
        </label>
        <button type="button" onClick={aplicar}
          className="mb-0.5 px-3 py-1.5 rounded-lg bg-torg-blue text-white text-xs font-medium hover:bg-torg-dark transition">
          Aplicar a todos
        </button>
      </div>
      <p className="text-[11px] text-torg-gray mt-1.5">
        {aviso || "Deixe em branco o que não quiser mudar. Depois é só corrigir na linha o que for diferente."}
      </p>
    </div>
  );
}
