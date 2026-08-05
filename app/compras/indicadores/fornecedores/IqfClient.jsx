"use client";
import { useState, useEffect } from "react";
import { Loader2, Star, Info } from "lucide-react";

const fmtBRL = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

// cor da nota 0–100: verde ≥85, âmbar 75–84, vermelho <75, cinza null
function corNota(v) {
  if (v == null) return { c: "#94a3b8", bg: "#f1f5f9" };
  if (v >= 85) return { c: "#1e9e6a", bg: "#e7f5ee" };
  if (v >= 75) return { c: "#b45309", bg: "#fff6e6" };
  return { c: "#b91c1c", bg: "#fdeaea" };
}
const corClasse = { A: "#1e9e6a", B: "#b45309", C: "#b91c1c", "—": "#94a3b8" };

function Nota({ v, sub }) {
  const { c, bg } = corNota(v);
  return (
    <div className="inline-flex flex-col items-center">
      <span className="px-2 py-0.5 rounded-full text-[12px] font-bold tabular-nums" style={{ color: c, background: bg }}>{v == null ? "—" : v}</span>
      {sub && <span className="text-[10px] text-torg-gray mt-0.5">{sub}</span>}
    </div>
  );
}

function Chip({ n, l, cor = "#0D1F3C" }) {
  return <div className="bg-white border border-gray-100 rounded-xl px-4 py-2 shadow-sm"><span className="text-lg font-extrabold tabular-nums" style={{ color: cor }}>{n}</span> <span className="text-[12px] text-torg-gray">{l}</span></div>;
}

export default function IqfClient() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    fetch("/api/compras/fornecedores/iqf").then((r) => r.json())
      .then((j) => { if (!j || j.error) return setErro(j?.error || "Erro ao carregar"); setData(j); })
      .catch(() => setErro("Erro ao carregar")).finally(() => setLoading(false));
  }, []);

  const fs = data?.fornecedores || [];
  const nA = fs.filter((f) => f.classe === "A").length;
  const nB = fs.filter((f) => f.classe === "B").length;
  const nC = fs.filter((f) => f.classe === "C").length;
  const nivelB = fs.filter((f) => f.iqf != null && f.iqf >= 75).length;

  return (
    <div className="space-y-5 max-w-[1200px]">
      <div>
        <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2.5"><Star className="text-torg-blue" size={26} /> Avaliação de Fornecedores (IQF)</h2>
        <p className="text-sm text-torg-gray mt-1">Nota automática (0–100) da rotina de compras, sem digitação. <b>Classe A</b> ≥ 85 · <b>B</b> 75–84 · <b>C</b> &lt; 75. "Nível mínimo B" = IQF ≥ 75.</p>
      </div>

      <div className="bg-torg-blue-50/50 border border-torg-blue-100 rounded-xl p-4 text-[12px] text-torg-dark flex gap-2.5">
        <Info size={16} className="text-torg-blue shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p><b>Como a nota é calculada:</b> por enquanto <b>Resposta</b> + <b>Qualidade</b> — a <b>Entrega</b> é mostrada só como referência e <b>não entra na nota</b> ainda, porque a data de entrega depende da sync do Omie, que hoje atrasa muito e zeraria a pontualidade de quase todos. Assim que a sync estabilizar, a entrega passa a pesar.</p>
          <p><b>Resposta</b>: tempo médio de resposta às cotações no portal (≤ 1 d.ú. = 100). <b>Qualidade</b>: cai 25 pontos por RNC de fornecedor em aberto. <b>Entrega</b>: % dos pedidos já entregues e sincronizados que chegaram no prazo.</p>
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-torg-gray"><Loader2 size={24} className="mx-auto animate-spin mb-2" /> Calculando…</div>
      ) : erro ? (
        <div className="py-10 text-center text-red-600 text-sm">{erro}</div>
      ) : (
        <>
          <div className="flex gap-2.5 flex-wrap">
            <Chip n={fs.length} l="fornecedores" />
            <Chip n={nivelB} l="nível B ou melhor" cor="#1e9e6a" />
            <Chip n={nA} l="classe A" cor="#1e9e6a" />
            <Chip n={nB} l="classe B" cor="#b45309" />
            <Chip n={nC} l="classe C" cor="#b91c1c" />
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-gray-50/60 text-torg-gray">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Fornecedor</th>
                    <th className="text-right px-3 py-2 font-medium whitespace-nowrap">Compras (ano)</th>
                    <th className="text-center px-3 py-2 font-medium">Resposta</th>
                    <th className="text-center px-3 py-2 font-medium">Entrega</th>
                    <th className="text-center px-3 py-2 font-medium">Qualidade</th>
                    <th className="text-center px-3 py-2 font-medium">IQF</th>
                    <th className="text-center px-3 py-2 font-medium">Classe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {fs.map((f) => (
                    <tr key={f.id} className="hover:bg-gray-50/60">
                      <td className="px-3 py-2 font-medium text-torg-dark">{f.nome}{!f.ativo && <span className="ml-1.5 text-[10px] text-gray-400">(inativo)</span>}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-torg-gray whitespace-nowrap">{f.comprasAno ? fmtBRL(f.comprasAno) : "—"}</td>
                      <td className="px-3 py-2 text-center"><Nota v={f.resposta} sub={f.avgRespostaDias != null ? `${f.avgRespostaDias} d.ú.` : (f.nCotacoes ? "sem resposta" : "")} /></td>
                      <td className="px-3 py-2 text-center"><Nota v={f.entrega} sub={f.nEntregasAvaliadas ? `${f.nEntregasAvaliadas} avaliados` : "sem sync"} /></td>
                      <td className="px-3 py-2 text-center"><Nota v={f.qualidade} sub={f.nRncAbertas ? `${f.nRncAbertas} RNC aberta${f.nRncAbertas > 1 ? "s" : ""}` : "sem reclamação"} /></td>
                      <td className="px-3 py-2 text-center"><span className="px-2.5 py-0.5 rounded-full text-[13px] font-extrabold tabular-nums" style={{ color: corNota(f.iqf).c, background: corNota(f.iqf).bg }}>{f.iqf == null ? "—" : f.iqf}</span></td>
                      <td className="px-3 py-2 text-center"><span className="text-sm font-extrabold" style={{ color: corClasse[f.classe] }}>{f.classe}</span></td>
                    </tr>
                  ))}
                  {fs.length === 0 && <tr><td colSpan={7} className="px-3 py-10 text-center text-torg-gray">Nenhum fornecedor com cotação neste ano.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
