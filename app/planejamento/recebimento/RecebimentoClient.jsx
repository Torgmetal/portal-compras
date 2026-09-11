"use client";
import { useEffect, useState } from "react";
import { Loader2, PackageCheck, Search } from "lucide-react";
import SeparacaoModal from "@/components/SeparacaoModal";

const numero = (v) => v == null ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
export default function RecebimentoClient({ rInicial = "" }) {
  const [busca, setBusca] = useState(rInicial);
  const [filtro, setFiltro] = useState(rInicial);
  const [ano, setAno] = useState("");
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [tentativa, setTentativa] = useState(0);
  const [opId, setOpId] = useState("");
  const [separacao, setSeparacao] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    setCarregando(true); setErro("");
    const qs = new URLSearchParams({ q: filtro, pagina: String(pagina), ...(ano ? { ano } : {}) });
    fetch(`/api/planejamento/recebimento?${qs}`, { signal: controller.signal })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; })
      .then(setDados).catch((e) => { if (e.name !== "AbortError") setErro(e.message || "Falha ao consultar recebimentos."); })
      .finally(() => { if (!controller.signal.aborted) setCarregando(false); });
    return () => controller.abort();
  }, [filtro, ano, pagina, tentativa]);
  const selecionada = dados?.ops.find((op) => op.id === opId);
  return <div className="space-y-5 text-torg-dark">
    <div><h1 className="text-2xl font-bold flex gap-2 items-center"><PackageCheck className="text-torg-blue" /> Recebimento</h1>
      <p className="text-torg-gray mt-1">Confira os materiais recebidos e a rastreabilidade antes de encaminhar ao PCP.</p></div>
    <form className="flex flex-wrap gap-3" onSubmit={(e) => { e.preventDefault(); setPagina(1); setFiltro(busca); }}>
      <label className="flex-1 min-w-[220px] text-sm">Buscar material, OP, R, corrida, certificado ou NF
        <input value={busca} onChange={(e) => setBusca(e.target.value)} className="block w-full border rounded-lg p-2 mt-1" placeholder="Ex.: 261234 ou CH 12,5" /></label>
      <label className="text-sm">Ano do R<input aria-label="Ano do R" type="number" min="2000" max="2099" placeholder="Todos" value={ano} onChange={(e) => { setAno(e.target.value); setPagina(1); }} className="block border rounded-lg p-2 mt-1 w-28" /></label>
      <button className="self-end bg-torg-blue text-white px-4 py-2 rounded-lg flex gap-2 items-center"><Search size={18} /> Buscar</button>
    </form>
    <div className="bg-white border border-gray-100 rounded-xl p-4 flex flex-wrap items-end gap-3">
      <label className="text-sm flex-1 min-w-[220px]">OP que receberá o material
        <select value={opId} onChange={(e) => setOpId(e.target.value)} className="block border rounded-lg p-2 mt-1 w-full"><option value="">Selecione a OP</option>
          {dados?.ops.map((op) => <option key={op.id} value={op.id}>OP-{op.numero} · {op.obra || "Sem nome"}</option>)}</select></label>
      <button disabled={!selecionada || carregando} onClick={() => setSeparacao(selecionada)} className="bg-torg-blue text-white rounded-lg px-4 py-2 disabled:opacity-40">Conferir Rs e encaminhar ao PCP</button>
      <p className="w-full text-xs text-torg-gray">As quantidades abaixo são de recebimento. Para usar material de estoque, confira a disponibilidade física e selecione o R na separação.</p>
    </div>
    {carregando ? <div className="py-12 text-center"><Loader2 className="animate-spin mx-auto" />Carregando recebimentos…</div>
      : erro ? <div role="alert" className="p-4 bg-red-50 rounded-lg">{erro}<button className="ml-3 underline" onClick={() => setTentativa((v) => v + 1)}>Tentar novamente</button></div>
      : !dados?.itens.length ? <div className="py-12 text-center text-torg-gray"><PackageCheck className="mx-auto mb-2" />Nenhum recebimento encontrado para estes filtros.</div>
      : <><div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto"><table className="w-full text-sm min-w-[1000px]">
        <thead className="bg-gray-50/60"><tr>{["R / recebido em", "OP / material", "Quantidade recebida", "Corrida / certificado", "NF / fornecedor"].map((t) => <th key={t} className="p-3 text-left">{t}</th>)}</tr></thead>
        <tbody className="divide-y divide-gray-50">{dados.itens.map((e) => <tr key={e.id}>
          <td className="p-3"><b className="text-torg-blue">R {e.importRef}</b><p className="text-xs text-torg-gray">{e.dataRecebimento ? new Date(e.dataRecebimento).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "Data não informada"}</p></td>
          <td className="p-3"><b>{e.opNumero ? `OP-${e.opNumero}` : "Sem OP"}</b><p>{e.nome}</p><p className="text-xs text-torg-gray">{e.norma}</p></td>
          <td className="p-3">{numero(e.quantidade)}<p className="text-xs text-torg-gray">{numero(e.pesoKg)} kg</p></td>
          <td className="p-3">{e.numeroCorrida || "Corrida não informada"}<p className="text-xs">Certificado: {e.numeroDocumento || "não informado"}</p>{/^https?:\/\//i.test(e.arquivoUrl || "") && <a href={e.arquivoUrl} target="_blank" rel="noreferrer" className="text-torg-blue underline">Abrir certificado</a>}</td>
          <td className="p-3">NF {e.nfNumero || "—"}<p className="text-xs text-torg-gray">{e.fornecedor || "Fornecedor não informado"}</p></td>
        </tr>)}</tbody></table></div>
        <div className="flex items-center justify-between text-sm"><span>{dados.total} recebimentos · página {pagina} de {dados.paginas}</span><div className="flex gap-3"><button disabled={pagina === 1} onClick={() => setPagina((v) => v - 1)} className="disabled:opacity-40">Anterior</button><button disabled={pagina >= dados.paginas} onClick={() => setPagina((v) => v + 1)} className="disabled:opacity-40">Próxima</button></div></div></>}
    {separacao && <SeparacaoModal opId={separacao.id} obra={`OP-${separacao.numero}`} encaminharPCP onClose={() => setSeparacao(null)} />}
  </div>;
}
