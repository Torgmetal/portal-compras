"use client";
// ─── O MODELO 3D NA TELA DO CLIENTE ───────────────────────────────────────────
//
// Vitor (03/09/2026): "conseguimos ter a opção de disponibilizar esse painel no portal do cliente
// para eles conseguirem olhar e navegar no modelo e ver tudo que precisa: status de peças, apenas a
// rastreabilidade (…), relatórios de qualidade, peso, marca, tipo".
//
// ⚠⚠ MESMO MOTOR, PAINEL OUTRO. O visualizador é o mesmo do portal interno — obra é obra, e manter
// dois renderizadores seria manter dois conjuntos de defeitos. O que muda é o que se lê ao clicar:
// aqui não há R interno, croqui, liberação, carga nem nada de fornecedor. O corte não é feito nesta
// tela: vem pronto da rota, que por sua vez só chama lib/portal-obra-consulta.
//
// ⚠⚠ FALTA DE DADO SE ESCREVE "SEM INFORMAÇÃO". Vitor: "se por acaso não estiver apontado no CMR
// deixar como sem informação para não levantar suspeita". Nada nesta tela pode dizer "não apontado",
// "pendente" ou "não conferido" — é a mesma regra dos documentos ao cliente.
import { useCallback, useEffect, useState } from "react";
import { Loader2, Box } from "lucide-react";
import VisualizadorIfc from "@/components/VisualizadorIfc";

const SEM = "sem informação";

const fmtKg = (v) => (v == null ? null : `${Math.round(v).toLocaleString("pt-BR")} kg`);
const fmtData = (d) => { try { return new Date(d).toLocaleDateString("pt-BR"); } catch { return ""; } };

export default function ModeloObraCliente({ token }) {
  const [lista, setLista] = useState(null);
  const [modelo, setModelo] = useState(null);
  const [erro, setErro] = useState("");
  const [sel, setSel] = useState(null);
  const [peca, setPeca] = useState(null);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/portal/${token}/modelo-3d`, { cache: "no-store" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!vivo) return;
        if (!ok) return setErro(j.error || "Modelo indisponível.");
        setLista(j);
        setModelo(j.modelos?.find((m) => !m.grande) || null);
      })
      .catch(() => vivo && setErro("Modelo indisponível."));
    return () => { vivo = false; };
  }, [token]);

  const abrir = useCallback((item) => {
    setSel(item || null);
    const m = item?.marca;
    if (!m) return setPeca(null);
    setBuscando(true); setPeca(null);
    fetch(`/api/portal/${token}/peca?marca=${encodeURIComponent(m)}`, { cache: "no-store" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => setPeca(ok ? j : null))
      .catch(() => setPeca(null))
      .finally(() => setBuscando(false));
  }, [token]);

  const url = modelo ? `/api/portal/${token}/modelo-3d?rel=${encodeURIComponent(modelo.rel)}` : null;

  if (erro) return null;                       // seção ligada sem modelo publicado: não ocupa espaço
  if (!lista) {
    return (
      <p className="text-[13px] text-gray-500 inline-flex items-center gap-2">
        <Loader2 size={13} className="animate-spin" /> abrindo o modelo da obra…
      </p>
    );
  }
  if (!lista.modelos?.length) return null;

  return (
    <div className="space-y-3">
      {lista.modelos.length > 1 && (
        <select value={modelo?.rel || ""} onChange={(e) => { setModelo(lista.modelos.find((m) => m.rel === e.target.value)); setSel(null); setPeca(null); }}
          className="text-[13px] border border-gray-200 rounded-lg px-3 py-2 max-w-full outline-none focus:border-[#006EAB]">
          {lista.modelos.map((m) => (
            <option key={m.rel} value={m.rel} disabled={m.grande}>{m.nome}{m.grande ? " (grande demais)" : ""}</option>
          ))}
        </select>
      )}

      {/* ⚠ o modelo é a peça central da seção: altura generosa, painel ao lado só quando há peça
          escolhida — coluna vazia num portal de cliente parece defeito. */}
      <div className="flex flex-col lg:flex-row gap-0 border border-gray-200 rounded-xl overflow-hidden bg-white">
        <div className="flex-1 min-w-0 min-h-0 relative" style={{ height: 560 }}>
          {url && (
            <VisualizadorIfc key={url} url={url} onSelecionar={abrir} selecionada={sel?.id || null} altura="fill" />
          )}
        </div>

        {sel && (
          <aside className="w-full lg:w-[330px] shrink-0 border-t lg:border-t-0 lg:border-l border-gray-200 overflow-y-auto" style={{ maxHeight: 560 }}>
            <div className="p-4 space-y-3">
              {buscando && <p className="text-[13px] text-gray-500 inline-flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> buscando…</p>}

              {!buscando && !peca && (
                <p className="text-[13px] text-gray-500">
                  <b className="font-mono text-[#0D1F3C] block">{sel.marca || "peça do modelo"}</b>
                  {SEM}
                </p>
              )}

              {peca && (
                <>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <h4 className="font-mono text-[17px] font-bold text-[#0D1F3C]">{peca.marca}</h4>
                    <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-600">{peca.tipo}</span>
                    <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full border ${
                      peca.etapa === "expedida" ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : peca.etapa === SEM ? "border-gray-200 bg-gray-50 text-gray-500"
                      : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                      {peca.etapa}
                    </span>
                  </div>

                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
                    <dt className="text-gray-500">Quantidade</dt><dd className="text-[#0D1F3C]">{peca.qtd}</dd>
                    <dt className="text-gray-500">Peso</dt><dd className="text-[#0D1F3C]">{fmtKg(peca.pesoKg) || SEM}</dd>
                    {peca.perfil && <><dt className="text-gray-500">Material</dt><dd className="text-[#0D1F3C]">{peca.perfil}</dd></>}
                  </dl>

                  <Bloco titulo="Expedição">
                    {peca.expedicao?.length ? (
                      <ul className="space-y-0.5 text-[13px]">
                        {peca.expedicao.map((e, i) => (
                          <li key={i} className="text-[#0D1F3C]">Romaneio {e.romaneio} · {fmtData(e.data)}</li>
                        ))}
                      </ul>
                    ) : <p className="text-[13px] text-gray-500">ainda em fabricação</p>}
                  </Bloco>

                  <Bloco titulo="Rastreabilidade">
                    {Array.isArray(peca.rastreio) ? (
                      <ul className="space-y-1 text-[12.5px]">
                        {peca.rastreio.map((r, i) => (
                          <li key={i}>
                            <span className="text-[#0D1F3C]">{r.material || "material"}</span>
                            <span className="text-gray-500"> · corrida {r.corrida}</span>
                            {r.norma && <span className="text-gray-500"> · {r.norma}</span>}
                            {r.certificado && <span className="text-gray-500 block">certificado {r.certificado}</span>}
                          </li>
                        ))}
                      </ul>
                    ) : <p className="text-[13px] text-gray-500">{SEM}</p>}
                  </Bloco>

                  <Bloco titulo="Relatórios de inspeção">
                    {Array.isArray(peca.relatorios) ? (
                      <ul className="space-y-0.5 text-[12.5px]">
                        {peca.relatorios.map((r, i) => (
                          <li key={i} className="text-[#0D1F3C]">{r.codigo} <span className="text-gray-500">· {String(r.tipo || "").replace(/_/g, " ").toLowerCase()} · {fmtData(r.data)}</span></li>
                        ))}
                      </ul>
                    ) : <p className="text-[13px] text-gray-500">{SEM}</p>}
                  </Bloco>
                </>
              )}
            </div>
          </aside>
        )}
      </div>

      <p className="text-[12px] text-gray-400 inline-flex items-center gap-1.5">
        <Box size={12} /> Clique em qualquer peça do modelo para ver os dados dela.
      </p>
    </div>
  );
}

function Bloco({ titulo, children }) {
  return (
    <div className="border-t border-gray-100 pt-2">
      <p className="text-[10.5px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{titulo}</p>
      {children}
    </div>
  );
}
