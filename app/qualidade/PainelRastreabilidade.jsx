"use client";
import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertCircle, RefreshCw, Link2, ChevronDown, ChevronRight, FolderSearch, CheckCircle2 } from "lucide-react";

const fmtN = (v) => Number(v || 0).toLocaleString("pt-BR");

/**
 * O QUE FALTA DE CERTIFICADO — ao abrir a tela, sem anexar pasta nenhuma.
 *
 * Vitor (19/08/2026): "preciso ficar anexando a pasta de rastreabilidade e atualizando na aba
 * rastreabilidade, queria tirar isso. Quero algo dinâmico, e sempre que abro essa tela ficam
 * justamente os certificados que faltam alguma coisa".
 *
 * Três estados, nunca dois — é o que torna a tela acionável:
 *   com arquivo  já resolvido, sai da frente
 *   o portal acha  o PDF existe no servidor, só não estava vinculado → um clique
 *   falta mesmo   não existe em lugar nenhum → cobrar o Almoxarifado
 *
 * Juntar os dois últimos num "faltando" só esconde o que se resolve sozinho dentro do que precisa
 * de gente. Era exatamente o que fazia parecer que "sempre falta alguma coisa".
 */
export default function PainelRastreabilidade() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [aberta, setAberta] = useState(null);
  const [casando, setCasando] = useState(null);

  const carregar = useCallback((recarregar = false) => {
    setLoading(true); setErro("");
    fetch(`/api/qualidade/rastreabilidade/status${recarregar ? "?recarregar=1" : ""}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Erro"); return j; })
      .then(setData).catch((e) => setErro(e.message)).finally(() => setLoading(false));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const casar = async (opNumero) => {
    setCasando(opNumero || "todas");
    try {
      const res = await fetch("/api/qualidade/rastreabilidade/status", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opNumero ? { opNumero } : {}),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Erro");
      alert(`${j.casados} certificado(s) vinculado(s).`);
      carregar();
    } catch (e) { alert(e.message); } finally { setCasando(null); }
  };

  const t = data?.totais;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-4">
      <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-torg-dark inline-flex items-center gap-1.5">
            <FolderSearch size={15} className="text-torg-blue" /> Certificados — o que falta
          </p>
          <p className="text-[11px] text-torg-gray mt-0.5">
            Lido direto do servidor a cada abertura. Varre a pasta de Rastreabilidade inteira —
            todos os anos e subpastas —, não só a do ano corrente.
            {data?.servidor && <> {fmtN(data.servidor.arquivos)} arquivos em {data.servidor.pastas} pastas.</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {t?.achaveis > 0 && (
            <button onClick={() => casar(null)} disabled={!!casando}
              className="text-[12px] font-semibold text-white bg-torg-blue hover:bg-torg-dark rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-50">
              {casando === "todas" ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
              Vincular os {fmtN(t.achaveis)} encontrados
            </button>
          )}
          <button onClick={() => carregar(true)} disabled={loading}
            className="text-[12px] font-semibold text-torg-blue border border-torg-blue-200 hover:bg-torg-blue-50 rounded-lg px-2.5 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-50">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Revarrer
          </button>
        </div>
      </div>

      {t && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100 border-b border-gray-100">
          <Kpi rotulo="No CMR" valor={fmtN(t.documentos)} />
          <Kpi rotulo="Com certificado" valor={fmtN(t.comArquivo)} cor="text-green-700" />
          <Kpi rotulo="O portal acha" valor={fmtN(t.achaveis)} cor="text-torg-blue" nota="um clique resolve" />
          <Kpi rotulo="Falta mesmo" valor={fmtN(t.faltando)} cor="text-torg-orange-700" nota="não existe no servidor" />
        </div>
      )}

      <div className="p-4">
        {loading && <p className="text-[12px] text-torg-gray inline-flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> lendo o servidor…</p>}
        {erro && !loading && <p className="text-[12px] text-red-600 inline-flex items-center gap-1.5"><AlertCircle size={13} /> {erro}</p>}
        {!loading && !erro && (data?.ops || []).filter((o) => o.achaveis + o.faltando > 0).length === 0 && (
          <p className="text-[12px] text-green-700 inline-flex items-center gap-1.5"><CheckCircle2 size={13} /> Nenhuma pendência de certificado.</p>
        )}

        {!loading && !erro && (data?.ops || []).filter((o) => o.achaveis + o.faltando > 0).map((o) => {
          const chave = o.opNumero || "(sem OP)";
          const ab = aberta === chave;
          return (
            <div key={chave} className="border-b border-gray-50 last:border-0">
              <button onClick={() => setAberta(ab ? null : chave)}
                className="w-full text-left py-2 flex flex-wrap items-center gap-x-4 gap-y-1 hover:bg-gray-50 px-1 rounded">
                <span className="text-torg-gray">{ab ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                <span className="text-[13px] font-semibold text-torg-dark w-24">{o.opNumero ? `OP-${o.opNumero}` : "sem OP"}</span>
                <span className="text-[11px] text-torg-gray">{fmtN(o.total)} no CMR</span>
                {o.achaveis > 0 && <span className="text-[11px] font-semibold text-torg-blue">{fmtN(o.achaveis)} encontrados</span>}
                {o.faltando > 0 && <span className="text-[11px] font-semibold text-torg-orange-700">{fmtN(o.faltando)} faltando</span>}
                <span className="ml-auto text-[11px] text-torg-gray tabular-nums">{o.pct}% completo</span>
              </button>

              {ab && (
                <div className="pb-3 pl-7 space-y-2">
                  {o.achaveis > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-[11px] font-semibold text-torg-blue">Encontrados no servidor ({fmtN(o.achaveis)})</p>
                        <button onClick={() => casar(o.opNumero)} disabled={!!casando}
                          className="text-[10px] font-semibold text-torg-blue hover:underline disabled:opacity-50">
                          {casando === o.opNumero ? "vinculando…" : "vincular só desta OP"}
                        </button>
                      </div>
                      <div className="max-h-40 overflow-y-auto text-[11px] space-y-0.5">
                        {o.itensAchaveis.map((i) => (
                          <div key={i.id} className="flex items-center gap-2 text-torg-gray">
                            <span className="font-medium text-torg-dark w-16 shrink-0">R {i.r}</span>
                            <span className="truncate">{i.arquivo}</span>
                            <span className="text-[10px] shrink-0">· {i.pasta}</span>
                            {i.duplicado && <span className="text-[10px] text-amber-700 shrink-0">· {i.duplicado} cópias</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {o.faltando > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-torg-orange-700 mb-1">
                        Sem certificado no servidor ({fmtN(o.faltando)}) — pedir ao Almoxarifado
                      </p>
                      <div className="max-h-40 overflow-y-auto text-[11px] space-y-0.5">
                        {o.itensFaltando.map((i) => (
                          <div key={i.id} className="flex items-center gap-2 text-torg-gray">
                            <span className="font-medium text-torg-dark w-16 shrink-0">R {i.r}</span>
                            <span className="truncate">{i.nome}</span>
                            {i.numeroDocumento && <span className="text-[10px] shrink-0">· cert. {i.numeroDocumento}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Kpi({ rotulo, valor, cor, nota }) {
  return (
    <div className="bg-white p-3">
      <p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider">{rotulo}</p>
      <p className={`text-lg font-extrabold tabular-nums ${cor || "text-torg-dark"}`}>{valor}</p>
      {nota && <p className="text-[10px] text-torg-gray">{nota}</p>}
    </div>
  );
}
