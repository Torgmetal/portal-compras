"use client";
// ─── A COR APLICADA: AS DO PLP, OU OUTRA ─────────────────────────────────────
//
// As cores vêm do PLP da obra — é o que o inspetor espera achar (Vitor, 22/08/2026: "o Inspetor
// seleciona na hora o que foi aplicado"). ⚠⚠ Mas a lista não pode ser o limite: na RIP-094-001
// (Matheus, 29/09/2026) foram pintadas Azul 2.5PB4/10 e Cinza N6,5, que o PLP não tinha, e o
// relatório ficava sem a cor. "Outra cor…" troca a lista por texto livre.
//
// ⚠ Cor gravada que não está na lista abre direto em TEXTO. Num select que não a conhece ela
// apareceria em branco — e o próximo "salvar" apagaria a cor do relatório sem ninguém ver.
import { useState } from "react";

const OUTRA = "__outra__";

export default function SeletorCor({ rotulo, valor, cores = [], onMudar, desabilitado = false, classe = "", classeRotulo = "", compacto = false }) {
  const v = valor ?? "";
  // ⚠ Só a ESCOLHA de "Outra cor…" é estado; o resto se deriva a cada pintura. Na tela da Qualidade o
  // PLP chega depois do primeiro render — calculado uma vez, o campo nasceria em texto e ficaria.
  const [escolheuOutra, setEscolheuOutra] = useState(false);
  const texto = cores.length === 0 || escolheuOutra || (v !== "" && !cores.includes(v));

  return (
    <label className="block">
      {rotulo && !compacto && <span className={classeRotulo || "block text-[12px] text-torg-gray mb-1"}>{rotulo}</span>}
      {texto ? (
        <input aria-label={rotulo} value={v} disabled={desabilitado} placeholder={cores.length ? "ex.: Azul 2.5PB 4/10" : ""}
          onChange={(e) => { setEscolheuOutra(true); onMudar(e.target.value); }} className={classe} />
      ) : (
        <select aria-label={rotulo} value={v} disabled={desabilitado} className={classe}
          onChange={(e) => {
            if (e.target.value === OUTRA) { setEscolheuOutra(true); onMudar(""); return; }
            onMudar(e.target.value);
          }}>
          <option value="">—</option>
          {cores.map((c) => <option key={c} value={c}>{c}</option>)}
          <option value={OUTRA}>Outra cor…</option>
        </select>
      )}
      {texto && cores.length > 0 && !desabilitado && (
        <button type="button" onClick={() => { setEscolheuOutra(false); onMudar(""); }}
          className={`${compacto ? "text-[10px]" : "text-[12px]"} mt-0.5 text-torg-blue hover:underline`}>
          ← cores do PLP
        </button>
      )}
    </label>
  );
}
