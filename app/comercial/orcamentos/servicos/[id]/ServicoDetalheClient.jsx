"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, AlertCircle, RefreshCw, Save, Wrench, Plus, Trash2, Layers, DollarSign, FolderUp, FileText } from "lucide-react";
import { useStore } from "@/lib/store";
import { SERVICOS, SERVICO_LABEL, STATUS_SERVICO } from "@/lib/orcamento-servico";
import { precoHoraDoServico } from "@/lib/custo-hora-calc";

const os = (n) => (n ? `OS-${String(n).padStart(3, "0")}` : "—");
const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
const CAT_LABEL = { VIGAS_W: "Vigas W", PERFIS_HP: "Perfis HP" };
const num = (v) => Number(v) || 0;
const fmtKg = (v) => num(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " kg";
const fmtH = (min) => { const m = Math.round(num(min)); return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`; };
const fmtBRL = (v) => num(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtTam = (b) => { const n = num(b); if (n < 1024) return `${n} B`; if (n < 1048576) return `${Math.round(n / 1024)} KB`; return `${(n / 1048576).toFixed(1)} MB`; };
const pesoLinha = (l) => num(l.pesoKgM) * num(l.comprimento) * num(l.qtdBarras);
const tempoLinha = (l) => num(l.tempoMinBarra) * num(l.qtdBarras);

export default function ServicoDetalheClient({ id }) {
  const { showToast } = useStore();
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [numero, setNumero] = useState(null);
  const [cliente, setCliente] = useState("");
  const [obra, setObra] = useState("");
  const [contato, setContato] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [endereco, setEndereco] = useState("");
  const [servSel, setServSel] = useState([]);
  const [status, setStatus] = useState("RASCUNHO");
  const [obs, setObs] = useState("");
  const [composicao, setComposicao] = useState({});
  const [perfis, setPerfis] = useState([]);
  const [aba, setAba] = useState("dados");
  const [dirty, setDirty] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [arquivos, setArquivos] = useState([]);
  const [subindoArq, setSubindoArq] = useState(0);
  const [configCH, setConfigCH] = useState(null);
  const autoValorRef = useRef(false);
  const arqRef = useRef(null);

  const marcar = () => setDirty(true);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const [r1, r2, r3] = await Promise.all([
        fetch(`/api/comercial/orcamento-servico/${id}`),
        fetch(`/api/comercial/orcamento-servico/perfis`),
        fetch(`/api/comercial/custo-hora`),
      ]);
      const d = await r1.json();
      if (!r1.ok) throw new Error(d.error || "Falha ao carregar");
      const o = d.orcamento;
      setNumero(o.numero || null); setCliente(o.cliente || ""); setObra(o.obra || ""); setContato(o.contato || "");
      setEmail(o.email || ""); setTelefone(o.telefone || ""); setEndereco(o.endereco || "");
      setServSel(Array.isArray(o.servicos) ? o.servicos : []); setStatus(o.status || "RASCUNHO"); setObs(o.observacoes || "");
      setComposicao(o.composicao && typeof o.composicao === "object" ? o.composicao : {});
      setArquivos(Array.isArray(o.arquivos) ? o.arquivos : []);
      const d2 = await r2.json().catch(() => ({}));
      if (r2.ok) setPerfis(d2.perfis || []);
      const d3 = await r3.json().catch(() => ({}));
      if (r3.ok) setConfigCH(d3.config || null);
      setDirty(false);
    } catch (e) { setErro(e.message); } finally { setCarregando(false); }
  }, [id]);
  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => { if (aba !== "dados" && aba !== "arquivos" && aba !== "resumo" && !servSel.includes(aba)) setAba("dados"); }, [servSel, aba]);

  const toggleServ = (k) => { setServSel((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k])); marcar(); };

  const addArquivos = async (files) => {
    const lista = Array.from(files || []);
    if (!lista.length) return;
    setSubindoArq((n) => n + lista.length);
    for (const file of lista) {
      try {
        const fd = new FormData(); fd.append("file", file);
        const r = await fetch("/api/upload-blob", { method: "POST", body: fd });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Falha no upload");
        setArquivos((p) => [...p, { url: d.url, nome: d.nomeArquivo || file.name, tamanho: d.tamanho || file.size, tipo: d.tipo || file.type }]);
        marcar();
      } catch (e) { showToast(e.message || "Falha ao subir arquivo", "error"); }
      finally { setSubindoArq((n) => n - 1); }
    }
  };
  const rmArquivo = (i) => { setArquivos((p) => p.filter((_, idx) => idx !== i)); marcar(); };

  const salvar = async () => {
    if (cliente.trim().length < 2) { showToast("Informe o cliente", "error"); return; }
    if (!servSel.length) { showToast("Selecione ao menos um serviço", "error"); return; }
    setSalvando(true);
    try {
      const r = await fetch(`/api/comercial/orcamento-servico/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliente, obra: obra || null, contato: contato || null, email: email || null, telefone: telefone || null, endereco: endereco || null, servicos: servSel, status, observacoes: obs || null, composicao, arquivos, valor: custoTotal ? Math.round(custoTotal * 100) / 100 : null }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao salvar");
      setDirty(false); showToast("Salvo", "success");
    } catch (e) { showToast(e.message, "error"); } finally { setSalvando(false); }
  };

  // ─── Corte e furação ───
  const cfLinhas = Array.isArray(composicao?.CORTE_FURACAO?.linhas) ? composicao.CORTE_FURACAO.linhas : [];
  const setCf = (linhas) => { setComposicao((p) => ({ ...p, CORTE_FURACAO: { ...(p.CORTE_FURACAO || {}), linhas } })); marcar(); };
  const addLinha = () => setCf([...cfLinhas, { id: uid(), perfil: "", pesoKgM: 0, comprimento: 12, qtdBarras: 1, tempoMinBarra: 0 }]);
  const rmLinha = (i) => setCf(cfLinhas.filter((_, idx) => idx !== i));
  const setLinha = (i, campo, valor) => {
    setCf(cfLinhas.map((l, idx) => {
      if (idx !== i) return l;
      const nl = { ...l, [campo]: valor };
      if (campo === "perfil") { const pp = perfis.find((x) => x.perfil === valor); nl.pesoKgM = pp ? pp.pesoKgM : 0; }
      return nl;
    }));
  };
  const perfisPorCat = perfis.reduce((acc, p) => { (acc[p.categoria] = acc[p.categoria] || []).push(p); return acc; }, {});
  const cfPesoTotal = cfLinhas.reduce((a, l) => a + pesoLinha(l), 0);
  const cfTempoTotal = cfLinhas.reduce((a, l) => a + tempoLinha(l), 0);
  const cfValorHora = num(composicao?.CORTE_FURACAO?.valorHora);
  const setCfValorHora = (v) => { setComposicao((p) => ({ ...p, CORTE_FURACAO: { ...(p.CORTE_FURACAO || {}), valorHora: v } })); marcar(); };
  const cfMetodo = composicao?.CORTE_FURACAO?.metodoPreco === "KG" ? "KG" : "HORA"; // precificar por hora ou por kg
  const setCfMetodo = (m) => { setComposicao((p) => ({ ...p, CORTE_FURACAO: { ...(p.CORTE_FURACAO || {}), metodoPreco: m } })); marcar(); };
  const cfPrecoKg = num(composicao?.CORTE_FURACAO?.precoKg);
  const setCfPrecoKg = (v) => { setComposicao((p) => ({ ...p, CORTE_FURACAO: { ...(p.CORTE_FURACAO || {}), precoKg: v } })); marcar(); };
  const custoPorHora = (cfTempoTotal / 60) * cfValorHora; // tempo (h) × R$/h
  const custoPorKg = cfPesoTotal * cfPrecoKg;             // peso (kg) × R$/kg
  const custoCf = cfMetodo === "KG" ? custoPorKg : custoPorHora;
  const cfRkgEq = cfPesoTotal > 0 ? custoCf / cfPesoTotal : 0;         // R$/kg equivalente
  const cfRhEq = cfTempoTotal > 0 ? custoCf / (cfTempoTotal / 60) : 0; // R$/h equivalente
  const custoTotal = custoCf; // soma dos serviços (por ora só corte/furação)

  // Puxa a preço-hora do custo-hora (setor de preparação/corte) pro valor/hora.
  const cfSetorPreco = precoHoraDoServico(configCH, "CORTE_FURACAO"); // { nome, precoHora } | null
  const cfPrecoSugerido = cfSetorPreco ? Math.round(cfSetorPreco.precoHora * 100) / 100 : 0;
  const cfPrecoKgSugerido = cfPesoTotal > 0 && cfPrecoSugerido > 0 ? Math.round(((cfPrecoSugerido * (cfTempoTotal / 60)) / cfPesoTotal) * 100) / 100 : 0; // R$/kg equivalente ao custo-hora
  useEffect(() => {
    if (autoValorRef.current || carregando) return;
    if (cfPrecoSugerido > 0 && !num(composicao?.CORTE_FURACAO?.valorHora)) {
      setCfValorHora(cfPrecoSugerido);
      autoValorRef.current = true;
    }
  }, [cfPrecoSugerido, carregando, composicao]);

  // ─── Resumo da proposta (prévia do custo) ───
  const chMargem = num(configCH?.margemPct);
  const chImpostos = num(configCH?.impostosVendaPct);
  const resumoServicos = servSel.map((s) => {
    if (s === "CORTE_FURACAO") return { key: s, label: "Corte a laser", unid: cfMetodo === "KG" ? "kg" : "h", qtd: cfMetodo === "KG" ? cfPesoTotal : cfTempoTotal / 60, valorUnit: cfMetodo === "KG" ? cfPrecoKg : cfValorHora, valorTotal: custoCf };
    return { key: s, label: SERVICO_LABEL[s] || s, unid: "", qtd: 0, valorUnit: 0, valorTotal: 0, pendente: true };
  });
  const valorProposta = resumoServicos.reduce((a, s) => a + num(s.valorTotal), 0);
  const impostosRs = (valorProposta * chImpostos) / 100;
  const baseComMargem = valorProposta - impostosRs;
  const custoBaseResumo = chMargem > 0 ? baseComMargem / (1 + chMargem / 100) : baseComMargem;
  const margemRs = baseComMargem - custoBaseResumo;

  if (carregando) return <div className="py-20 text-center text-torg-gray"><Loader2 size={30} className="mx-auto animate-spin mb-2" /> Carregando...</div>;
  if (erro) return (
    <div className="py-20 text-center">
      <AlertCircle size={30} className="mx-auto text-red-400 mb-2" /><p className="text-sm text-red-600 mb-3">{erro}</p>
      <button onClick={carregar} className="px-3 py-1.5 text-sm bg-torg-blue text-white rounded-lg inline-flex items-center gap-2"><RefreshCw size={14} /> Tentar novamente</button>
    </div>
  );

  const tabs = [{ key: "dados", label: "Dados" }, { key: "arquivos", label: "Arquivos do cliente" }, ...servSel.map((s) => ({ key: s, label: SERVICO_LABEL[s] || s })), { key: "resumo", label: "Resumo / Proposta" }];

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/comercial/orcamentos/servicos" className="text-sm text-torg-gray hover:text-torg-dark inline-flex items-center gap-1.5"><ArrowLeft size={16} /> Orçamentos de serviço</Link>
          {numero && <span className="text-xs font-mono font-semibold text-torg-blue bg-torg-blue-50 rounded-full px-2 py-0.5">{os(numero)}</span>}
        </div>
        <div className="flex items-center gap-2">
          {dirty && <span className="text-xs text-amber-600">não salvo</span>}
          <select value={status} onChange={(e) => { setStatus(e.target.value); marcar(); }} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-torg-blue">
            {Object.entries(STATUS_SERVICO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <button onClick={salvar} disabled={salvando || subindoArq > 0} className="px-4 py-2 bg-torg-orange text-white text-sm rounded-lg hover:bg-torg-orange/90 font-medium inline-flex items-center gap-2 disabled:opacity-50">
            {salvando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <span className="text-sm font-semibold text-torg-dark mr-2">{cliente || "—"}{obra ? ` · ${obra}` : ""}</span>
      </div>

      {/* Abas */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit flex-wrap">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setAba(t.key)}
            className={`px-3.5 py-1.5 text-sm font-medium rounded-lg transition-colors ${aba === t.key ? "bg-white text-torg-dark shadow-sm" : "text-torg-gray hover:text-torg-dark"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {aba === "dados" && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
          <h3 className="text-lg font-semibold text-torg-dark flex items-center gap-2"><Wrench size={18} className="text-torg-blue" /> Dados do orçamento</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><label className="text-xs text-torg-gray">Cliente</label><input value={cliente} onChange={(e) => { setCliente(e.target.value); marcar(); }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-torg-blue" /></div>
            <div><label className="text-xs text-torg-gray">Obra</label><input value={obra} onChange={(e) => { setObra(e.target.value); marcar(); }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-torg-blue" /></div>
            <div><label className="text-xs text-torg-gray">Contato</label><input value={contato} onChange={(e) => { setContato(e.target.value); marcar(); }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-torg-blue" /></div>
            <div><label className="text-xs text-torg-gray">E-mail</label><input type="email" value={email} onChange={(e) => { setEmail(e.target.value); marcar(); }} placeholder="cliente@empresa.com" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-torg-blue" /></div>
            <div><label className="text-xs text-torg-gray">Telefone</label><input value={telefone} onChange={(e) => { setTelefone(e.target.value); marcar(); }} placeholder="(19) 99999-9999" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-torg-blue" /></div>
            <div className="sm:col-span-3"><label className="text-xs text-torg-gray">Endereço</label><input value={endereco} onChange={(e) => { setEndereco(e.target.value); marcar(); }} placeholder="Rua, nº, bairro, cidade/UF" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-torg-blue" /></div>
          </div>
          <div>
            <label className="text-xs text-torg-gray">Serviços</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
              {SERVICOS.map((s) => {
                const sel = servSel.includes(s.key);
                return (
                  <button key={s.key} type="button" onClick={() => toggleServ(s.key)} className={`text-left text-sm rounded-lg border px-3 py-2 ${sel ? "border-torg-blue bg-torg-blue-50 text-torg-blue font-medium" : "border-gray-200 text-torg-dark hover:border-torg-blue-200"}`}>
                    <span className="inline-flex items-center gap-2"><span className={`w-4 h-4 rounded border flex items-center justify-center ${sel ? "bg-torg-blue border-torg-blue" : "border-gray-300"}`}>{sel && <span className="text-white text-[10px]">✓</span>}</span>{s.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="text-xs text-torg-gray">Observações</label>
            <textarea value={obs} onChange={(e) => { setObs(e.target.value); marcar(); }} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-torg-blue resize-y" />
          </div>
        </div>
      )}

      {aba === "arquivos" && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-lg font-semibold text-torg-dark flex items-center gap-2 mb-1"><FolderUp size={18} className="text-torg-blue" /> Arquivos do cliente</h3>
          <p className="text-sm text-torg-gray mb-3">Desenhos, listas, modelos e o que o cliente enviar — PDF, DWG, DXF, <strong>IGS/IGES</strong>, STEP, XLSX, imagens, ZIP. Até 50 MB por arquivo; pode selecionar vários de uma vez.</p>
          {arquivos.length > 0 && (
            <div className="divide-y divide-gray-50 border border-gray-100 rounded-lg mb-3">
              {arquivos.map((a, i) => (
                <div key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                  <a href={a.url} target="_blank" rel="noreferrer" className="text-sm text-torg-blue hover:underline inline-flex items-center gap-2 min-w-0"><FileText size={15} className="shrink-0" /> <span className="truncate">{a.nome}</span></a>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[11px] text-torg-gray">{fmtTam(a.tamanho)}</span>
                    <button onClick={() => rmArquivo(i)} className="text-red-400 hover:text-red-600" title="Remover"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button onClick={() => arqRef.current?.click()} disabled={subindoArq > 0}
            className="w-full py-6 border-2 border-dashed border-gray-200 rounded-xl text-torg-gray hover:border-torg-blue hover:text-torg-blue font-medium flex flex-col items-center justify-center gap-1 transition-colors disabled:opacity-50">
            {subindoArq > 0 ? <Loader2 size={22} className="animate-spin" /> : <FolderUp size={22} />}
            <span>{subindoArq > 0 ? `Enviando ${subindoArq}…` : "Adicionar arquivos"}</span>
          </button>
          <input ref={arqRef} type="file" multiple className="hidden" onChange={(e) => { addArquivos(e.target.files); e.target.value = ""; }} />
          <p className="text-[11px] text-torg-gray mt-2">Clique em Salvar para guardar a lista de arquivos.</p>
        </div>
      )}

      {aba === "CORTE_FURACAO" && (
        <div className="space-y-3">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/60">
                  <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                    <th className="px-3 py-2">Perfil</th>
                    <th className="px-3 py-2 text-right">Compr. (m)</th>
                    <th className="px-3 py-2 text-right">Qtd barras</th>
                    <th className="px-3 py-2 text-right">Peso</th>
                    <th className="px-3 py-2 text-right">Tempo (min/barra)</th>
                    <th className="px-3 py-2 text-right">Tempo total</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {cfLinhas.length === 0 ? (
                    <tr><td colSpan={7} className="px-3 py-6 text-center text-torg-gray text-sm">Nenhum perfil. Adicione abaixo.</td></tr>
                  ) : cfLinhas.map((l, i) => (
                    <tr key={l.id || i}>
                      <td className="px-3 py-1.5 min-w-[210px]">
                        <select value={l.perfil} onChange={(e) => setLinha(i, "perfil", e.target.value)} className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-torg-blue">
                          <option value="">— perfil —</option>
                          {Object.entries(perfisPorCat).map(([cat, arr]) => (
                            <optgroup key={cat} label={CAT_LABEL[cat] || cat}>
                              {arr.map((pp) => <option key={pp.perfil} value={pp.perfil}>{pp.perfil} · {pp.pesoKgM} kg/m</option>)}
                            </optgroup>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-1.5 text-right"><input type="number" step="0.01" value={l.comprimento} onChange={(e) => setLinha(i, "comprimento", e.target.value)} className="w-20 border border-gray-200 rounded px-1.5 py-1 text-xs text-right tabular-nums focus:ring-1 focus:ring-torg-blue" /></td>
                      <td className="px-3 py-1.5 text-right"><input type="number" step="1" value={l.qtdBarras} onChange={(e) => setLinha(i, "qtdBarras", e.target.value)} className="w-20 border border-gray-200 rounded px-1.5 py-1 text-xs text-right tabular-nums focus:ring-1 focus:ring-torg-blue" /></td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-torg-dark font-medium whitespace-nowrap">{fmtKg(pesoLinha(l))}</td>
                      <td className="px-3 py-1.5 text-right"><input type="number" step="0.1" value={l.tempoMinBarra} onChange={(e) => setLinha(i, "tempoMinBarra", e.target.value)} className="w-24 border border-gray-200 rounded px-1.5 py-1 text-xs text-right tabular-nums focus:ring-1 focus:ring-torg-blue" /></td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-torg-dark whitespace-nowrap">{fmtH(tempoLinha(l))}</td>
                      <td className="px-3 py-1.5 text-center"><button onClick={() => rmLinha(i)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
                {cfLinhas.length > 0 && (
                  <tfoot className="bg-gray-50/60 font-semibold text-torg-dark">
                    <tr>
                      <td className="px-3 py-2" colSpan={3}>Total</td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fmtKg(cfPesoTotal)}</td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fmtH(cfTempoTotal)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
          <button onClick={addLinha} className="w-full py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-torg-gray hover:border-torg-blue hover:text-torg-blue font-medium inline-flex items-center justify-center gap-2 transition-colors">
            <Plus size={16} /> Adicionar perfil
          </button>
          <p className="text-xs text-torg-gray">Peso = kg/m do perfil × comprimento × qtd de barras. O <strong>tempo médio (min/barra)</strong> você informa a partir da programação da máquina.</p>

          {/* Custos — por hora ou por kg */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mt-2">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <h4 className="text-sm font-semibold text-torg-dark flex items-center gap-2"><DollarSign size={16} className="text-torg-blue" /> Custo do corte / furação</h4>
              <div className="inline-flex rounded-lg border border-gray-200 p-0.5 text-xs">
                <button type="button" onClick={() => setCfMetodo("HORA")} className={`px-3 py-1 rounded-md font-medium ${cfMetodo === "HORA" ? "bg-torg-blue text-white" : "text-torg-gray hover:text-torg-dark"}`}>Por hora</button>
                <button type="button" onClick={() => setCfMetodo("KG")} className={`px-3 py-1 rounded-md font-medium ${cfMetodo === "KG" ? "bg-torg-blue text-white" : "text-torg-gray hover:text-torg-dark"}`}>Por kg</button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
              {cfMetodo === "HORA" ? (
                <div>
                  <label className="text-xs text-torg-gray">Valor por hora (R$/h)</label>
                  <input type="number" step="0.01" value={cfValorHora || ""} onChange={(e) => setCfValorHora(e.target.value === "" ? 0 : Number(e.target.value))} placeholder="0,00"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-torg-blue tabular-nums" />
                  {cfPrecoSugerido > 0 ? (
                    <p className="text-[11px] text-torg-gray mt-1">Custo-hora ({cfSetorPreco.nome}): <strong className="text-torg-dark tabular-nums">{fmtBRL(cfPrecoSugerido)}/h</strong>{num(cfValorHora) !== cfPrecoSugerido && (<button type="button" onClick={() => setCfValorHora(cfPrecoSugerido)} className="ml-1.5 text-torg-blue hover:underline font-medium">usar</button>)}</p>
                  ) : (
                    <p className="text-[11px] text-amber-600 mt-1"><Link href="/comercial/orcamentos/custo-hora" className="hover:underline">Defina o custo-hora</Link> pra puxar automático.</p>
                  )}
                </div>
              ) : (
                <div>
                  <label className="text-xs text-torg-gray">Preço por kg (R$/kg)</label>
                  <input type="number" step="0.01" value={cfPrecoKg || ""} onChange={(e) => setCfPrecoKg(e.target.value === "" ? 0 : Number(e.target.value))} placeholder="0,00"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-torg-blue tabular-nums" />
                  {cfPrecoKgSugerido > 0 && (
                    <p className="text-[11px] text-torg-gray mt-1">Pelo custo-hora daria <strong className="text-torg-dark tabular-nums">{fmtBRL(cfPrecoKgSugerido)}/kg</strong>{num(cfPrecoKg) !== cfPrecoKgSugerido && (<button type="button" onClick={() => setCfPrecoKg(cfPrecoKgSugerido)} className="ml-1.5 text-torg-blue hover:underline font-medium">usar</button>)}</p>
                  )}
                </div>
              )}
              <div>
                <label className="text-xs text-torg-gray">{cfMetodo === "KG" ? "Peso total" : "Tempo total"}</label>
                <div className="text-lg font-semibold text-torg-dark mt-1 tabular-nums">
                  {cfMetodo === "KG" ? fmtKg(cfPesoTotal) : <>{fmtH(cfTempoTotal)} <span className="text-xs text-torg-gray font-normal">({(cfTempoTotal / 60).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} h)</span></>}
                </div>
              </div>
              <div className="sm:text-right">
                <label className="text-xs text-torg-gray">Custo</label>
                <div className="text-2xl font-extrabold text-torg-blue mt-0.5 tabular-nums">{fmtBRL(custoCf)}</div>
                {custoCf > 0 && <div className="text-[11px] text-torg-gray mt-0.5 tabular-nums">≈ {fmtBRL(cfMetodo === "KG" ? cfRhEq : cfRkgEq)}/{cfMetodo === "KG" ? "h" : "kg"}</div>}
              </div>
            </div>
            <p className="text-xs text-torg-gray mt-3">
              {cfMetodo === "KG"
                ? <>Custo = peso total (kg) × preço por kg. Tempo total: <strong>{fmtH(cfTempoTotal)}</strong>.</>
                : <>Custo = tempo total (h) × valor por hora. Peso total do lote: <strong>{fmtKg(cfPesoTotal)}</strong>.</>}
            </p>
          </div>
        </div>
      )}

      {["JATEAMENTO", "PINTURA", "SOLDA"].includes(aba) && (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-6 text-center">
          <Layers size={26} className="mx-auto text-gray-300 mb-2" />
          <p className="text-torg-dark font-medium">{SERVICO_LABEL[aba]} — composição em breve</p>
          <p className="text-sm text-torg-gray mt-1">Vamos montar aqui os itens e o cálculo deste serviço.</p>
        </div>
      )}

      {aba === "resumo" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100"><h3 className="font-semibold text-torg-dark flex items-center gap-2"><DollarSign size={17} className="text-torg-blue" /> Resumo da proposta</h3></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/60"><tr className="text-left text-xs font-medium text-gray-500 uppercase">
                  <th className="px-4 py-2">Item</th><th className="px-4 py-2">Serviço</th><th className="px-4 py-2 text-center">Unid.</th><th className="px-4 py-2 text-right">Qtd.</th><th className="px-4 py-2 text-right">Valor unit.</th><th className="px-4 py-2 text-right">Valor total</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {resumoServicos.map((s, i) => (
                    <tr key={s.key} className={s.pendente ? "text-torg-gray" : ""}>
                      <td className="px-4 py-2 tabular-nums">{String(i + 1).padStart(2, "0")}</td>
                      <td className="px-4 py-2">{s.label}</td>
                      <td className="px-4 py-2 text-center">{s.unid || "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{s.qtd ? s.qtd.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{s.valorUnit ? fmtBRL(s.valorUnit) : "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium text-torg-dark">{s.valorTotal ? fmtBRL(s.valorTotal) : (s.pendente ? "a definir" : "—")}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="border-t-2 border-gray-100 bg-gray-50/40"><td colSpan={5} className="px-4 py-2.5 text-right font-semibold text-torg-dark uppercase text-xs">Valor total</td><td className="px-4 py-2.5 text-right font-extrabold text-torg-blue tabular-nums">{fmtBRL(valorProposta)}</td></tr></tfoot>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h4 className="text-sm font-semibold text-torg-dark mb-3">Composição do preço <span className="text-xs font-normal text-torg-gray">(embutida — vem do custo-hora)</span></h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div><div className="text-[11px] text-torg-gray uppercase">Custo</div><div className="font-semibold text-torg-dark tabular-nums">{fmtBRL(custoBaseResumo)}</div></div>
              <div><div className="text-[11px] text-torg-gray uppercase">Margem ({chMargem}%)</div><div className="font-semibold text-torg-dark tabular-nums">{fmtBRL(margemRs)}</div></div>
              <div><div className="text-[11px] text-torg-gray uppercase">Impostos ({chImpostos}%)</div><div className="font-semibold text-torg-dark tabular-nums">{fmtBRL(impostosRs)}</div></div>
              <div><div className="text-[11px] text-torg-gray uppercase">Preço de venda</div><div className="font-extrabold text-torg-blue tabular-nums">{fmtBRL(valorProposta)}</div></div>
            </div>
            <p className="text-[11px] text-torg-gray mt-3">Margem e impostos já vêm embutidos no valor/hora (ou R$/kg) do custo-hora — todos os impostos inclusos (lucro real). Esta é a prévia que vai pra proposta.</p>
          </div>

          <div className="bg-torg-blue-50/40 border border-torg-blue-100 rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="text-sm text-torg-dark">Gerar a <strong>proposta em Word</strong> no padrão Torg (PTC), com destinatário, descrição e a tabela de preços já preenchidos.</div>
            <button type="button" disabled title="Em construção" className="px-4 py-2 bg-torg-blue text-white text-sm rounded-lg font-medium inline-flex items-center gap-2 opacity-50 cursor-not-allowed"><FileText size={15} /> Gerar proposta (.docx) — em breve</button>
          </div>
        </div>
      )}
    </div>
  );
}
