"use client";
import { useEffect, useState } from "react";

// ─── ESPECIFICAÇÃO DO ITEM COMERCIAL ──────────────────────────────────────────────────────────
// Vitor (31/08/2026): "puxe as telhas que já compramos e já traga os códigos do Omie; caso não
// tenha o item com a especificação, informe a necessidade de cadastro no OMIE" e "sobre as telhas,
// calhas e rufos precisamos que tenha a opção de especificar as cores caso sejam definidas pelo
// cliente, ou caso não, deixar como natural".
//
// ⚠ A ESPECIFICAÇÃO SAI DO CATÁLOGO DO OMIE, não de uma lista escrita à mão. Lista congelada de
// "variações de mercado" nasce desatualizada e oferece na proposta item que o Compras não tem como
// comprar. Quando o Omie não tem nada, isso APARECE como pendência de cadastro — que é acionável,
// ao contrário do silêncio de antes.
//
// ⚠⚠ COR PADRÃO É "NATURAL", e não vazio. Vazio significaria "ninguém decidiu" e viraria discussão
// na obra; "natural" é uma resposta — é o galvalume/galvanizado sem pintura, que é o que sai
// quando o cliente não especifica. Só telha, calha e rufo têm cor: chumbador e linha de vida não.
export const COM_COR = new Set(["TELHA_TERMO", "TELHA_SIMPLES", "CALHAS", "RUFOS"]);

export function EspecificacaoComercial({ item, cfg, setIt }) {
  const [prods, setProds] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let vivo = true;
    fetch(`/api/comercial/estudos/produtos?item=${encodeURIComponent(item.key)}`)
      .then((r) => r.json())
      .then((j) => { if (vivo) { if (j.error) setErro(j.error); else setProds(j); } })
      .catch(() => vivo && setErro("Não consegui consultar o catálogo do Omie."));
    return () => { vivo = false; };
  }, [item.key]);

  return (
    <div className="mt-3 pt-3 border-t border-gray-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <label className="text-[11px] font-semibold text-torg-dark">
        Produto no Omie
        {prods?.precisaCadastro ? (
          <p className="mt-1 rounded border border-[#F4801F]/40 bg-[#FFF8F0] px-2 py-1.5 text-[11px] font-normal text-torg-orange-700">
            Nenhum produto com esta especificação no Omie — <strong>solicite o cadastro</strong> antes
            de virar pedido de compra.
          </p>
        ) : (
          <select value={cfg.codigoOmie || ""} onChange={(e) => setIt(item.key, "codigoOmie", e.target.value)}
            className="block mt-1 w-full border border-gray-200 rounded px-2 py-1 text-[12px] bg-white">
            <option value="">{prods ? `— escolher entre ${prods.total} —` : "carregando…"}</option>
            {(prods?.produtos || []).map((x) => (
              <option key={x.codigo} value={x.codigo}>{x.codigo} · {x.descricao}{x.unidade ? ` (${x.unidade})` : ""}</option>
            ))}
          </select>
        )}
        {erro && <span className="block mt-1 text-[11px] font-normal text-red-600">{erro}</span>}
      </label>

      {COM_COR.has(item.key) && (
        <label className="text-[11px] font-semibold text-torg-dark">
          Cor
          <input value={cfg.cor ?? ""} onChange={(e) => setIt(item.key, "cor", e.target.value)}
            placeholder="natural"
            className="block mt-1 w-full border border-gray-200 rounded px-2 py-1 text-[12px]" />
          <span className="block mt-0.5 text-[10px] font-normal text-torg-gray">
            {String(cfg.cor || "").trim()
              ? "definida pelo cliente"
              : "em branco vale como NATURAL — galvalume/galvanizado sem pintura"}
          </span>
        </label>
      )}

      <label className="text-[11px] font-semibold text-torg-dark">
        Observação
        <input value={cfg.obs ?? ""} onChange={(e) => setIt(item.key, "obs", e.target.value)}
          placeholder="o que o cliente pediu de diferente"
          className="block mt-1 w-full border border-gray-200 rounded px-2 py-1 text-[12px]" />
      </label>
    </div>
  );
}
