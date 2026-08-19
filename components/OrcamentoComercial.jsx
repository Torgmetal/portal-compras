"use client";
import { useState, useEffect, useCallback } from "react";
import { Folder, FolderTree, ChevronRight, Home, FileSpreadsheet, FileText, Loader2, AlertCircle, Check } from "lucide-react";

// ORÇAMENTO DO COMERCIAL — vincula proposta e estudo à OP, e lê a planilha de estudo.
//
// NAVEGAÇÃO IGUAL À DOS DOCUMENTOS DO SGQ (Vitor 19/08: "quero que deixe igual ao da qualidade").
// Trilha no topo, pastas primeiro, clique pra entrar. A primeira versão era um buscador com
// sugestão automática — ele achou bagunçado, e faz sentido: o time já sabe navegar a pasta, e
// sugestão por semelhança de nome erra feio aqui (a OP-112 casava 75% com "250-25-DANPOWER-0328-PE"
// quando o estudo certo é o "249-26-DANPOWER-0328").
//
// Dentro da pasta do orçamento, os documentos ficam em `6.Propostas` (PTC, técnica, comercial) e
// `5.Estudos` (a planilha LQC/EPC). Selecionar é um clique no arquivo.

const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
const fmtTam = (b) => (b == null ? "" : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const ehPlanilha = (n) => /\.(xls[xmb]?|csv)$/i.test(n);

export default function OrcamentoComercial({ valor, onChange, onPreencher, opId = null, onSalvar = null }) {
  const [path, setPath] = useState("");
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [lendo, setLendo] = useState(false);
  const [aberto, setAberto] = useState(!valor.pasta);

  const carregar = useCallback((p) => {
    setCarregando(true); setErro("");
    fetch(`/api/comercial/orcamento-sharepoint?path=${encodeURIComponent(p)}`)
      .then((r) => r.json())
      .then((j) => { if (j.error) setErro(j.error); else { setDados(j); if (j.erro) setErro(j.erro); } })
      .catch(() => setErro("Erro ao carregar a pasta"))
      .finally(() => setCarregando(false));
  }, []);
  useEffect(() => { if (aberto) carregar(path); }, [path, aberto, carregar]);

  const segmentos = path ? path.split("/") : [];
  const itens = dados?.itens || [];
  const pastas = itens.filter((i) => i.tipo === "folder");
  const arquivos = itens.filter((i) => i.tipo === "file");

  // A pasta do orçamento é a que está DOIS níveis abaixo da raiz:
  // ORÇAMENTOS_2026 / 2. Concluidos / <orçamento> — e é ela que fica gravada na OP.
  const pastaOrcamento = segmentos.length >= 3 ? segmentos.slice(0, 3).join("/") : null;
  const refOrcamento = segmentos.length >= 3 ? segmentos[2] : null;

  // ANEXA QUANTAS PROPOSTAS FOREM — sem rótulo à mão. O portal lê o PDF e diz o que tem em cada
  // uma (Vitor 19/08: "não ter uma escolha, deixar anexar mais de uma proposta, assim você avalia
  // e informa o que contém em cada uma").
  const propostas = valor.propostas || [];
  const anexarProposta = async (arq) => {
    if (propostas.some((p) => p.id === arq.id)) return;
    const nova = { id: arq.id, nome: arq.nome, lendo: true };
    const base = { ...valor, pasta: pastaOrcamento || valor.pasta, ref: refOrcamento || valor.ref, propostas: [...propostas, nova] };
    onChange(base);
    try {
      const r = await fetch("/api/comercial/ler-proposta", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: arq.id, nome: arq.nome }),
      });
      const j = await r.json();
      onChange({ ...base, propostas: base.propostas.map((p) => (p.id === arq.id ? { ...p, lendo: false, ...(r.ok ? j : { erro: j.error }) } : p)) });
    } catch {
      onChange({ ...base, propostas: base.propostas.map((p) => (p.id === arq.id ? { ...p, lendo: false, erro: "não consegui ler" } : p)) });
    }
  };
  const tirarProposta = (id) => onChange({ ...valor, propostas: propostas.filter((p) => p.id !== id) });

  const escolherEstudo = (arq) => onChange({
    ...valor, pasta: pastaOrcamento || valor.pasta, ref: refOrcamento || valor.ref,
    estudo: { id: arq.id, nome: arq.nome }, dados: null,
  });

  const lerEstudo = async () => {
    if (!valor.estudo) return;
    setLendo(true); setErro("");
    try {
      const r = await fetch("/api/comercial/ler-estudo-planilha", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: valor.estudo.id, nome: valor.estudo.nome }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Não consegui ler a planilha");
      onChange({ ...valor, dados: j });
    } catch (e) { setErro(e.message); } finally { setLendo(false); }
  };

  const d = valor.dados;
  const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 0 }));
  const money = (n) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }));

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold text-torg-dark flex items-center gap-2">
            <FolderTree size={18} className="text-torg-blue" /> Orçamento do Comercial
          </h3>
          <p className="text-sm text-torg-gray">
            Navegue até a pasta do orçamento e anexe os documentos. As propostas ficam em <b>6.Propostas</b> e a planilha em <b>5.Estudos</b>.
          </p>
        </div>
        <button type="button" onClick={() => setAberto((a) => !a)}
          className="text-[12px] font-semibold text-torg-blue border border-torg-blue-200 rounded-lg px-2.5 py-1.5 shrink-0">
          {aberto ? "fechar pasta" : "abrir pasta"}
        </button>
      </div>

      {erro && <p className="text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 inline-flex items-center gap-2"><AlertCircle size={15} /> {erro}</p>}

      {/* selecionados */}
      {(propostas.length > 0 || valor.estudo) && (
        <div className="rounded-lg border border-torg-blue-100 bg-torg-blue-50/40 px-3 py-2.5 space-y-2">
          {valor.ref && <p className="text-[12px] font-bold text-torg-blue">{valor.ref}</p>}

          {propostas.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] text-torg-gray uppercase tracking-wide">Propostas anexadas</p>
              {propostas.map((p) => (
                <div key={p.id} className="bg-white border border-gray-100 rounded-lg px-2.5 py-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <FileText size={14} className="text-torg-gray shrink-0" />
                    <span className="text-[12px] font-medium truncate flex-1 min-w-0" title={p.nome}>{p.nome}</span>
                    {p.lendo ? <span className="text-[11px] text-torg-gray inline-flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> lendo…</span>
                      : p.erro ? <span className="text-[11px] text-amber-700">{p.erro}</span>
                      : <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 border ${p.tipo === "PTC" ? "text-emerald-700 bg-emerald-50 border-emerald-200" : p.tipo === "INDEFINIDA" ? "text-amber-700 bg-amber-50 border-amber-200" : "text-torg-blue bg-torg-blue-50 border-torg-blue-200"}`}>{p.tipo}</span>}
                    <button type="button" onClick={() => tirarProposta(p.id)} className="text-[11px] text-torg-gray hover:text-red-600 underline shrink-0">tirar</button>
                  </div>
                  {!p.lendo && !p.erro && (
                    <p className="text-[11px] text-torg-gray mt-1">
                      {p.tecnica && "técnica"}{p.tecnica && p.comercial && " + "}{p.comercial && "comercial"}
                      {p.prazoDias ? ` · prazo ${p.prazoDias} dias` : ""}
                      {p.validadeDias ? ` · validade ${p.validadeDias} dias` : ""}
                      {p.paginas ? ` · ${p.paginas} pág.` : ""}
                    </p>
                  )}
                  {p.escopo && <p className="text-[11px] text-torg-dark mt-1 line-clamp-2">{p.escopo}</p>}
                </div>
              ))}
            </div>
          )}

          <p className="text-[12px] flex items-center gap-2">
            <span className="text-torg-gray w-32 shrink-0">Planilha de estudo</span>
            {valor.estudo ? (
              <>
                <span className="font-medium truncate">{valor.estudo.nome}</span>
                <button type="button" onClick={() => onChange({ ...valor, estudo: null, dados: null })}
                  className="text-torg-gray hover:text-red-600 text-[11px] underline shrink-0">tirar</button>
              </>
            ) : <span className="text-torg-gray-light">—</span>}
          </p>
        </div>
      )}

      {aberto && (
        <>
          {/* trilha */}
          <div className="flex items-center gap-1 flex-wrap text-sm">
            <button type="button" onClick={() => setPath("")}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-torg-blue-50 ${path === "" ? "text-torg-blue font-semibold" : "text-torg-gray"}`}>
              <Home size={14} /> Orçamentos
            </button>
            {segmentos.map((s, i) => (
              <span key={i} className="inline-flex items-center gap-1">
                <ChevronRight size={13} className="text-gray-300" />
                <button type="button" onClick={() => setPath(segmentos.slice(0, i + 1).join("/"))}
                  className={`px-2 py-1 rounded-lg hover:bg-torg-blue-50 ${i === segmentos.length - 1 ? "text-torg-dark font-semibold" : "text-torg-gray"}`}>{s}</button>
              </span>
            ))}
          </div>

          <div className="rounded-xl border border-gray-200 overflow-hidden max-h-80 overflow-y-auto">
            {carregando ? (
              <div className="py-10 text-center text-torg-gray"><Loader2 size={22} className="mx-auto animate-spin" /></div>
            ) : itens.length === 0 ? (
              <div className="py-10 text-center text-torg-gray text-sm">Pasta vazia.</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {pastas.map((it) => (
                  <button key={it.id} type="button" onClick={() => setPath(path ? `${path}/${it.nome}` : it.nome)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50/70 text-left transition-colors">
                    <Folder size={17} className="text-torg-blue shrink-0" />
                    <span className="flex-1 min-w-0 truncate text-[13px] font-medium text-torg-dark">{it.nome}</span>
                    {it.filhos != null && <span className="text-[11px] text-torg-gray tabular-nums">{it.filhos} {it.filhos === 1 ? "item" : "itens"}</span>}
                    <ChevronRight size={15} className="text-gray-300 shrink-0" />
                  </button>
                ))}
                {arquivos.map((it) => {
                  const jaEscolhido = valor.estudo?.id === it.id || propostas.some((p) => p.id === it.id);
                  return (
                    <div key={it.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50/70">
                      {ehPlanilha(it.nome) ? <FileSpreadsheet size={17} className="text-emerald-700 shrink-0" /> : <FileText size={17} className="text-torg-gray shrink-0" />}
                      <a href={it.webUrl || "#"} target="_blank" rel="noopener noreferrer"
                        className="flex-1 min-w-0 truncate text-[13px] text-torg-dark hover:text-torg-blue" title={it.nome}>{it.nome}</a>
                      <span className="text-[11px] text-torg-gray tabular-nums whitespace-nowrap hidden sm:inline">{fmtD(it.modificado)} · {fmtTam(it.tamanho)}</span>
                      {jaEscolhido && (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 shrink-0 inline-flex items-center gap-1">
                          <Check size={11} /> anexado
                        </span>
                      )}
                      {!jaEscolhido && (
                        <button type="button" onClick={() => (ehPlanilha(it.nome) ? escolherEstudo(it) : anexarProposta(it))}
                          className="text-[11px] font-semibold text-torg-blue border border-torg-blue-200 rounded px-2 py-0.5 hover:bg-torg-blue-50 shrink-0">
                          {ehPlanilha(it.nome) ? "usar como estudo" : "anexar proposta"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <p className="text-[11px] text-torg-gray">
            Clique na pasta pra navegar, no nome do arquivo pra abrir no servidor, ou em <b>anexar proposta</b> / <b>usar como estudo</b> pra vincular na OP.
            Pode anexar quantas propostas quiser — o portal lê cada uma e diz se é técnica, comercial ou as duas (PTC).
          </p>
        </>
      )}

      {valor.estudo && !d && (
        <button type="button" onClick={lerEstudo} disabled={lendo}
          className="bg-torg-dark text-white text-sm font-semibold rounded-lg px-4 py-2 disabled:opacity-50">
          {lendo ? "Lendo a planilha…" : "Ler o estudo"}
        </button>
      )}

      {d && (
        <div className="bg-blue-50/60 border border-blue-100 rounded-lg p-4 space-y-3">
          <p className="text-[12px] font-semibold text-torg-blue">Estudo lido ({d.modelo}) — estimativa do Comercial</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[13px]">
            <div><p className="text-torg-gray text-[11px]">Aço</p><p className="font-bold">{fmt(d.aco?.pesoKg)} kg</p></div>
            <div><p className="text-torg-gray text-[11px]">Área de pintura</p><p className="font-bold">{fmt(d.aco?.areaPinturaM2)} m²</p></div>
            <div><p className="text-torg-gray text-[11px]">Tinta</p><p className="font-bold">{fmt((d.pintura?.itens || []).reduce((a, x) => a + (x.litros || 0), 0))} L</p></div>
            <div><p className="text-torg-gray text-[11px]">Áreas da obra</p><p className="font-bold">{d.aco?.itens?.length || d.aco?.perfis?.length || 0}</p></div>
          </div>
          {d.comercial?.totalGeral && (
            <div>
              <p className="text-[11px] text-torg-gray mb-1">Resumo do orçamento</p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[12px]">
                {[["Total", d.comercial.totalGeral.valor, true], ["Material", d.comercial.totalGeral.material],
                  ["MDO terceirizada", d.comercial.totalGeral.mdoTerceirizada], ["Industrialização", d.comercial.totalGeral.industrializacao],
                  ["BDI", d.comercial.totalGeral.bdi]].map(([rot, v, forte]) => (
                  <div key={rot} className={`bg-white border rounded-lg px-2 py-1.5 ${forte ? "border-torg-blue-200" : "border-gray-100"}`}>
                    <p className="text-[10px] text-torg-gray">{rot}</p>
                    <p className={`font-bold ${forte ? "text-torg-blue" : "text-torg-dark"}`}>{money(v)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(d.comercial?.verbas || []).length > 0 && (
            <div>
              <p className="text-[11px] text-torg-gray mb-1">Verbas</p>
              <div className="flex flex-wrap gap-1.5">
                {d.comercial.verbas.map((v) => (
                  <span key={v.item} className="text-[11px] bg-white border border-amber-200 rounded-lg px-2 py-1">
                    <b>{v.descricao}</b> {money(v.valor)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(d.custos?.topo || []).length > 0 && (
            <div>
              <p className="text-[11px] text-torg-gray mb-1">Custo estimado ({money(d.custos.total)})</p>
              <div className="flex flex-wrap gap-1.5">
                {d.custos.topo.map((g) => (
                  <span key={g.item} className="text-[11px] bg-white border border-gray-200 rounded-lg px-2 py-1">
                    <b>{g.descricao}</b> {money(g.subtotal)}{g.precoKg ? ` · ${g.precoKg.toFixed(2)}/kg` : ""}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(d.familias?.familias || []).length > 0 && (
            <div>
              <p className="text-[11px] text-torg-gray mb-1">Famílias do orçamento</p>
              <div className="flex flex-wrap gap-1.5">
                {d.familias.familias.map((f) => (
                  <span key={f.nome} className="text-[11px] bg-white border border-blue-200 rounded-lg px-2 py-1">
                    <b>{f.nome}</b> {fmt(f.total)} {f.unidade}
                  </span>
                ))}
              </div>
            </div>
          )}
          {d.faltando?.length > 0 && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              Não consegui ler: {d.faltando.join(" · ")} — o resto foi importado.
            </p>
          )}
          {onPreencher && (
            <button type="button"
              onClick={() => onPreencher({ obra: d.aco?.itens?.[0]?.area || "", descricao: (d.familias?.familias || []).map((f) => `${f.nome}: ${fmt(f.total)} ${f.unidade}`).join(" · ") })}
              className="text-[12px] font-semibold text-torg-blue underline">usar isto para preencher obra e descrição</button>
          )}
        </div>
      )}

      {onSalvar && (valor.pasta || valor.estudo) && (
        <button type="button" onClick={() => onSalvar(valor)}
          className="bg-torg-blue text-white text-sm font-semibold rounded-lg px-4 py-2">
          Salvar vínculo na OP
        </button>
      )}
    </div>
  );
}
