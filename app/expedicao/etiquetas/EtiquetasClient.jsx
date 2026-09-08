"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, Loader2, Printer, Search, Tag } from "lucide-react";

// ETIQUETAS DE CARREGAMENTO — a aba que substitui o BarTender.
//
// Matheus (08/09/2026): "hoje é feito essa emissão utilizando o software BarTender e importamos
// uma planilha com as Marcas e quantidades de cada peça".
//
// ⚠ NÃO TEM CAMPO DE PLANILHA, E É O PONTO DA TELA. Marca, descrição, quantidade e peso já estão
// no portal; escolher a OP já é escolher os dados. O que a planilha fazia era só atravessar a
// informação de um sistema que enxerga o banco para outro que não enxerga.
//
// ⚠ O PDF ABRE EM ABA NOVA em vez de baixar: quem imprime etiqueta imprime de novo em seguida
// (faltou uma, descolou, borrou), e reaproveitar a aba aberta é um clique em vez de quatro.

/** Ler a resposta como TEXTO antes de interpretar — erro sem corpo JSON não pode virar mensagem de parser. */
async function lerJson(r, oQue) {
  const bruto = await r.text().catch(() => "");
  if (!bruto.trim()) throw new Error(`${oQue}: o servidor respondeu ${r.status} sem conteúdo.`);
  let j;
  try { j = JSON.parse(bruto); }
  catch { throw new Error(`${oQue}: resposta ${r.status} não é JSON — "${bruto.slice(0, 100)}"`); }
  if (!r.ok) throw new Error(j.error || `${oQue}: erro ${r.status}`);
  return j;
}

/** "05/09 14:20" — dia e hora bastam; o ano não ajuda a decidir se reimprime. */
const quando = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(+d)
    ? null
    : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

const nkg = (n) =>
  Number(n) > 0 ? Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";

function BarraSelecao({ busca, setBusca, visiveis, sel, totalEtiquetas, marcarVisiveis, limpar, imprimir, gerando }) {
  return (
    <div className="flex flex-wrap items-center gap-3 p-3 border-b border-gray-100 bg-gray-50/60">
      <div className="relative flex-1 min-w-[220px]">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-torg-gray" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Filtrar por marca ou descrição"
          className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-1.5 text-sm" />
      </div>
      <button onClick={marcarVisiveis} className="text-[13px] font-semibold text-torg-blue hover:underline">
        Marcar {busca ? "os filtrados" : "todas"} ({visiveis.length})
      </button>
      <button onClick={limpar} disabled={!sel.size}
        className="text-[13px] text-torg-gray hover:underline disabled:opacity-40">Limpar</button>
      <div className="ml-auto flex items-center gap-3">
        {/* Quantas ETIQUETAS, não quantas marcas: é o número que decide se o rolo aguenta. */}
        <span className="text-[13px] text-torg-gray">
          <b className="text-torg-dark">{sel.size}</b> marca(s) ·{" "}
          <b className="text-torg-dark">{totalEtiquetas}</b> etiqueta(s)
        </span>
        <button onClick={imprimir} disabled={!sel.size || gerando}
          className="bg-torg-blue text-white text-sm font-semibold rounded-lg px-4 py-2 flex items-center gap-2 disabled:opacity-40">
          {gerando ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}
          {gerando ? "Gerando…" : "Gerar etiquetas"}
        </button>
      </div>
    </div>
  );
}

/**
 * Se a etiqueta desta marca já saiu, e quando.
 *
 * ⚠ Matheus (08/09/2026): "deixar uma coluna na lista no portal mostrando quais etiquetas já foram
 * impressas". O "×2" não é enfeite: reimpressão é rotina (descolou, borrou), mas reimprimir SEM
 * saber que já tinha saído é como a peça sai do pátio com dois adesivos diferentes.
 */
function Impressa({ peca }) {
  const em = quando(peca.impressaEm);
  if (!em) return <span className="text-gray-300">—</span>;
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-emerald-700 whitespace-nowrap">
      <Check size={13} className="shrink-0" />
      {em}
      {peca.impressoes > 1 && <b className="text-torg-gray">×{peca.impressoes}</b>}
    </span>
  );
}

function TabelaMarcas({ visiveis, sel, alterna, busca }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]" style={{ minWidth: 640 }}>
        <thead className="bg-gray-50/60 text-[11px] uppercase text-torg-gray">
          <tr>
            <th className="w-10 px-3 py-2"></th>
            <th className="text-left px-2 py-2">Marca</th>
            <th className="text-left px-2 py-2">Descrição</th>
            <th className="text-right px-2 py-2">Peças</th>
            <th className="text-right px-2 py-2">Peso unit. (kg)</th>
            <th className="text-left px-4 py-2">Etiqueta</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {visiveis.map((p) => (
            <tr key={p.id} onClick={() => alterna(p.marca)}
              className={`cursor-pointer ${sel.has(p.marca) ? "bg-torg-blue-50/50" : "hover:bg-gray-50/60"}`}>
              <td className="px-3 py-2">
                <input type="checkbox" readOnly checked={sel.has(p.marca)} className="pointer-events-none" />
              </td>
              <td className="px-2 py-2 font-bold text-torg-dark">{p.marca}</td>
              <td className="px-2 py-2 text-torg-gray">{p.descricao || "—"}</td>
              <td className="px-2 py-2 text-right tabular-nums">{Math.max(1, p.qte || 1)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{nkg(p.pesoUnitKg)}</td>
              <td className="px-4 py-2"><Impressa peca={p} /></td>
            </tr>
          ))}
          {!visiveis.length && (
            <tr><td colSpan={6} className="px-4 py-10 text-center text-torg-gray">
              Nenhuma marca bate com &quot;{busca}&quot;.
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function EtiquetasClient() {
  const [ops, setOps] = useState([]);
  const [opId, setOpId] = useState("");
  const [dados, setDados] = useState(null);
  const [sel, setSel] = useState(() => new Set());
  const [busca, setBusca] = useState("");
  const [carregandoOps, setCarregandoOps] = useState(true);
  const [carregando, setCarregando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const j = await lerJson(await fetch("/api/expedicao/etiquetas", { cache: "no-store" }), "Lista de OPs");
        setOps(j.ops || []);
      } catch (e) { setErro(e.message); } finally { setCarregandoOps(false); }
    })();
  }, []);

  const buscarPecas = useCallback(async (id) => lerJson(
    await fetch(`/api/expedicao/etiquetas?opId=${encodeURIComponent(id)}`, { cache: "no-store" }),
    "Peças da OP"), []);

  const abrirOp = useCallback(async (id) => {
    setOpId(id); setDados(null); setSel(new Set()); setBusca(""); setErro("");
    if (!id) return;
    setCarregando(true);
    try { setDados(await buscarPecas(id)); }
    catch (e) { setErro(e.message); } finally { setCarregando(false); }
  }, [buscarPecas]);

  const pecas = dados?.pecas || [];
  const visiveis = useMemo(() => {
    const q = busca.trim().toUpperCase();
    if (!q) return pecas;
    return pecas.filter((p) =>
      p.marca.toUpperCase().includes(q) || String(p.descricao || "").toUpperCase().includes(q));
  }, [pecas, busca]);

  // Quantas ETIQUETAS, não quantas marcas: é o número que decide se o rolo aguenta.
  const totalEtiquetas = useMemo(
    () => pecas.filter((p) => sel.has(p.marca)).reduce((s, p) => s + Math.max(1, p.qte || 1), 0),
    [pecas, sel]);

  const alterna = (marca) => setSel((prev) => {
    const n = new Set(prev);
    if (n.has(marca)) n.delete(marca); else n.add(marca);
    return n;
  });
  const marcarVisiveis = () => setSel((prev) => new Set([...prev, ...visiveis.map((p) => p.marca)]));
  const limpar = () => setSel(new Set());

  const imprimir = async () => {
    if (!sel.size) return;
    setGerando(true); setErro("");
    try {
      const r = await fetch("/api/expedicao/etiquetas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opId, marcas: [...sel] }),
      });
      if (!r.ok) {
        const bruto = await r.text().catch(() => "");
        let msg = `Erro ${r.status}`;
        try { msg = JSON.parse(bruto).error || msg; } catch { /* corpo não-JSON: fica o status */ }
        throw new Error(msg);
      }
      const url = URL.createObjectURL(await r.blob());
      window.open(url, "_blank", "noopener");
      // Revogar na hora fecharia o PDF antes de a aba lê-lo.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      // Recarrega só os dados — a coluna "Etiqueta" tem que refletir o que acabou de sair, e o
      // filtro e a seleção continuam onde estavam (quem imprime costuma imprimir de novo).
      const atualizado = await buscarPecas(opId).catch(() => null);
      if (atualizado) setDados(atualizado);
    } catch (e) { setErro(e.message); } finally { setGerando(false); }
  };

  return (
    <div className="max-w-6xl">
      <div className="flex items-start gap-3 mb-1">
        <Tag className="text-torg-orange mt-1" size={26} />
        <div>
          <h1 className="text-2xl font-bold text-torg-dark">Etiquetas de carregamento</h1>
          <p className="text-torg-gray text-sm">
            Escolha a OP e as marcas. Sai uma etiqueta por peça, de 100×50&nbsp;mm, pronta para a Argox.
          </p>
        </div>
      </div>

      <div className="bg-torg-blue-50/60 border border-torg-blue-100 rounded-xl px-4 py-3 text-[12.5px] text-torg-dark mb-5 mt-4">
        <b>Antes de imprimir</b>, no diálogo do navegador: escolha a impressora
        <b> Argox OS-214 plus</b>, deixe a escala em <b>100%</b> (nunca &quot;ajustar à página&quot;) e as margens
        em <b>nenhuma</b>. A página do PDF já tem o tamanho exato da etiqueta — qualquer ajuste do
        navegador só faz ela sair torta.
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5 flex items-start gap-2 text-red-700">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <div className="flex-1 text-sm">{erro}</div>
          <button onClick={() => { setErro(""); if (opId) abrirOp(opId); }}
            className="text-sm font-semibold underline shrink-0">Tentar novamente</button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-5">
        <label className="block text-[11px] font-bold uppercase tracking-wide text-torg-gray mb-1.5">Obra</label>
        {carregandoOps ? (
          <div className="flex items-center gap-2 text-torg-gray text-sm py-2">
            <Loader2 size={16} className="animate-spin" /> Carregando as OPs…
          </div>
        ) : (
          <select value={opId} onChange={(e) => abrirOp(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">Selecione a OP…</option>
            {ops.map((o) => (
              <option key={o.id} value={o.id}>
                OP-{o.numero} · {o.cliente}{o.obra ? ` — ${o.obra}` : ""} ({o.marcas} marcas)
              </option>
            ))}
          </select>
        )}
      </div>

      {carregando && (
        <div className="flex items-center justify-center py-16 gap-3 text-torg-gray">
          <Loader2 size={22} className="animate-spin" /> Carregando as peças…
        </div>
      )}

      {dados && !carregando && (
        pecas.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center text-torg-gray">
            <Tag size={30} className="mx-auto mb-3 opacity-40" />
            Esta OP não tem peça cadastrada — não há o que etiquetar.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <BarraSelecao
              busca={busca} setBusca={setBusca}
              visiveis={visiveis} sel={sel} totalEtiquetas={totalEtiquetas}
              marcarVisiveis={marcarVisiveis} limpar={limpar}
              imprimir={imprimir} gerando={gerando}
            />
            <TabelaMarcas visiveis={visiveis} sel={sel} alterna={alterna} busca={busca} />
          </div>
        )
      )}
    </div>
  );
}
