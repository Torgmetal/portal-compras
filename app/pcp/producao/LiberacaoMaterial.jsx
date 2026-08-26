"use client";
// O PORTÃO DO PCP — analisa o material da liberação antes de imprimir.
//
// Vitor (25/08/2026), a sequência: "pcp recebe a solicitação, manda separar o material, analisa se
// está tudo em estoque, caso seja usado um material de estoque informa o R usado, e caso não tenha
// o material não libera aquele projeto para preparar. Avaliou isso, imprime os desenhos para o
// setor já marcando o R e imprime marcando na GRD".
//
// ⚠⚠ TRÊS ESTADOS, NÃO DOIS. "Tem ou não tem" pararia a fábrica: dos perfis que não casam com o CMR
// da própria obra, 180 existem no CMR de OUTRA e só 97 não existem em lugar nenhum. Os 180 são
// material de estoque — rotina da casa. Só o terceiro estado bloqueia.
import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertCircle, Check, Printer, PackageSearch, ShieldAlert, Boxes } from "lucide-react";

const fmtN = (n) => Number(n || 0).toLocaleString("pt-BR");
const fmtKg = (n) => `${Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
// classes por extenso: Tailwind não gera classe montada em runtime
const EST = {
  NA_OP:        { rot: "material da obra",    chip: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  ESTOQUE:      { rot: "material de estoque", chip: "bg-amber-50 text-amber-700 border-amber-200" },
  SEM_MATERIAL: { rot: "sem material",        chip: "bg-red-100 text-red-800 border-red-200" },
};
// ⚠ FALTAR MATERIAL NÃO É UMA COISA SÓ — e a diferença é de quem é a bola. Vitor (25/08/2026):
// "material aguardando entrega se já tiver pedido emitido, ou não comprado se não tiver nem RM".
const FALTA = {
  AGUARDANDO_ENTREGA: { rot: "aguardando entrega", chip: "bg-sky-50 text-sky-700 border-sky-200" },
  SOLICITADO:         { rot: "solicitado, sem pedido", chip: "bg-amber-50 text-amber-700 border-amber-200" },
  NAO_COMPRADO:       { rot: "não comprado", chip: "bg-red-100 text-red-800 border-red-200" },
};

export default function LiberacaoMaterial({ liberacaoId, opNumero, onImprimir }) {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [editando, setEditando] = useState(null); // perfil onde se digita o R
  const [rDigitado, setRDigitado] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await fetch(`/api/pcp/liberacao-material?id=${liberacaoId}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao analisar o material");
      setD(j);
    } catch (e) { setErro(e.message); } finally { setCarregando(false); }
  }, [liberacaoId]);
  useEffect(() => { carregar(); }, [carregar]);

  async function informarR(perfil) {
    if (!rDigitado.trim()) return;
    setSalvando(true); setErro("");
    try {
      const r = await fetch("/api/pcp/liberacao-material", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opNumero, perfil, rUsado: rDigitado.trim() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao informar o R");
      setEditando(null); setRDigitado("");
      await carregar();
    } catch (e) { setErro(e.message); } finally { setSalvando(false); }
  }

  if (carregando && !d) return <p className="text-[12px] text-torg-gray inline-flex items-center gap-2 py-3"><Loader2 size={14} className="animate-spin" /> analisando o material…</p>;
  if (erro && !d) return <p className="text-[12px] text-red-700 inline-flex items-center gap-2 py-3"><AlertCircle size={14} /> {erro}</p>;
  if (!d) return null;

  const r = d.resumo;

  return (
    <div className="space-y-3">
      {erro && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[12px] text-red-700">{erro}</div>}

      {/* ── o veredito, em uma linha ── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase text-torg-gray-light">material</span>
        <span className="text-[12px] text-emerald-700"><b>{fmtN(r.naOp)}</b> da obra</span>
        {r.estoque > 0 && <span className="text-[12px] text-amber-700"><b>{fmtN(r.estoque)}</b> de estoque{r.estoqueSemR > 0 && <> · <b>{fmtN(r.estoqueSemR)}</b> esperando o R</>}</span>}
        {r.semMaterial > 0 && (
          <span className="text-[12px] text-red-700">
            <b>{fmtN(r.semMaterial)}</b> sem material ({fmtKg(r.kgSemMaterial)})
            {(r.aguardandoEntrega > 0 || r.solicitado > 0) && (
              <span className="text-torg-gray font-normal">
                {" — "}{[r.aguardandoEntrega && `${fmtN(r.aguardandoEntrega)} a caminho`,
                         r.solicitado && `${fmtN(r.solicitado)} no Compras`,
                         r.naoComprado && `${fmtN(r.naoComprado)} não comprado`].filter(Boolean).join(" · ")}
              </span>
            )}
          </span>
        )}
        <span className="ml-auto text-[12px] text-torg-dark"><b>{fmtN(r.liberaveis)}</b> de {fmtN(r.pecas)} liberáveis · {fmtKg(r.kgLiberavel)}</span>
      </div>

      {/* ── por perfil: é assim que se separa no almoxarifado ── */}
      <div className="border border-gray-100 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
        <table className="w-full text-[12px]">
          <thead className="bg-gray-50 text-[10px] uppercase text-torg-gray sticky top-0">
            <tr>
              <th className="px-2.5 py-1.5 text-left font-semibold">Perfil</th>
              <th className="px-2.5 py-1.5 text-right font-semibold">Peças</th>
              <th className="px-2.5 py-1.5 text-right font-semibold">Peso</th>
              <th className="px-2.5 py-1.5 text-left font-semibold">Situação</th>
              <th className="px-2.5 py-1.5 text-left font-semibold">R</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {d.perfis.map((pf) => {
              const e = EST[pf.estado];
              return (
                <tr key={pf.perfil} className={pf.estado === "SEM_MATERIAL" ? "bg-red-50/40" : ""}>
                  <td className="px-2.5 py-1.5 font-mono text-torg-dark">{pf.perfil}</td>
                  <td className="px-2.5 py-1.5 text-right tabular-nums text-torg-gray">{fmtN(pf.un)}</td>
                  <td className="px-2.5 py-1.5 text-right tabular-nums text-torg-gray">{fmtKg(pf.kg)}</td>
                  <td className="px-2.5 py-1.5">
                    {/* ⚠ no "sem material" o chip mostra o SUB-ESTADO: aguardando entrega é prazo do
                        fornecedor, não comprado é o Compras. São donos diferentes. */}
                    {pf.estado === "SEM_MATERIAL" && pf.falta ? (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${FALTA[pf.falta].chip}`}>{FALTA[pf.falta].rot}</span>
                    ) : (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${e.chip}`}>{e.rot}</span>
                    )}
                    {pf.descricaoCmr && <span className="block text-[10px] text-torg-gray-light truncate max-w-[30ch]" title={pf.descricaoCmr}>{pf.descricaoCmr}</span>}
                    {pf.rm?.descricao && <span className="block text-[10px] text-torg-gray-light truncate max-w-[30ch]" title={pf.rm.descricao}>{pf.rm.descricao}</span>}
                  </td>
                  <td className="px-2.5 py-1.5">
                    {pf.estado === "SEM_MATERIAL" ? (
                      pf.rm?.pedido ? (
                        <span className="text-[11px] text-sky-700">
                          pedido {pf.rm.pedido.numero || "—"}{pf.rm.pedido.fornecedor ? ` · ${String(pf.rm.pedido.fornecedor).slice(0, 22)}` : ""}
                        </span>
                      ) : pf.rm ? (
                        <span className="text-[11px] text-amber-700">RM feita, pedido não emitido</span>
                      ) : (
                        <span className="text-[11px] text-red-700">sem RM e sem pedido</span>
                      )
                    ) : pf.estado === "NA_OP" ? (
                      <span className="font-mono text-[11px] text-torg-gray">{(pf.rs || []).slice(0, 3).join(" ") || "—"}</span>
                    ) : pf.rInformado ? (
                      <span className="font-mono text-[11px] text-emerald-700 inline-flex items-center gap-1"><Check size={11} /> {pf.rInformado}</span>
                    ) : editando === pf.perfil ? (
                      <span className="inline-flex items-center gap-1">
                        <input value={rDigitado} onChange={(ev) => setRDigitado(ev.target.value)} autoFocus
                          onKeyDown={(ev) => { if (ev.key === "Enter") informarR(pf.perfil); if (ev.key === "Escape") setEditando(null); }}
                          placeholder="ex.: 260066" className="w-24 text-[11px] border border-gray-200 rounded px-1.5 py-0.5 font-mono focus:border-torg-blue outline-none" />
                        <button onClick={() => informarR(pf.perfil)} disabled={salvando} className="text-torg-blue hover:underline text-[11px]">ok</button>
                        <button onClick={() => setEditando(null)} className="text-torg-gray text-[11px]">✕</button>
                      </span>
                    ) : (
                      /* ⚠ "entrou na OP 079" não dizia nada. O que a pessoa precisa saber é: o aço
                         EXISTE, a nota dele foi lançada em outra obra, e este é o R que sai da
                         prateleira. Mostrar o R sugerido evita que ela vá procurar em outra tela. */
                      <button onClick={() => { setEditando(pf.perfil); setRDigitado((pf.rs || [])[0] || ""); }}
                        className="text-left text-[11px] text-torg-blue hover:underline">
                        informar o R usado
                        {(pf.rs || [])[0] && (
                          <span className="block text-[10px] text-torg-gray-light font-normal">
                            sugerido: R <b className="font-mono">{pf.rs[0]}</b>
                            {pf.opsDoMaterial?.length > 0 && <> — nota lançada na OP {pf.opsDoMaterial.slice(0, 2).join(", ")}</>}
                          </span>
                        )}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── o que trava, dito por extenso ── */}
      {r.semMaterial > 0 && (
        /* ⚠ o bloqueio precisa dizer O QUE fazer, senão vira parede. Falta material = compra ou
           lançamento no CMR, e as duas coisas são de outra pessoa. */
        <p className="text-[12px] text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2">
          <ShieldAlert size={15} className="mt-0.5 shrink-0" />
          {/* ⚠ o bloqueio diz de QUEM é a bola: prazo de fornecedor, fila do Compras, ou ninguém
              pediu. Sem isso o PCP vai cobrar quem não pode resolver. */}
          <span>
            <b>{fmtN(r.semMaterial)} peça(s) não vão para a impressão.</b>{" "}
            {r.aguardandoEntrega > 0 && <>{fmtN(r.aguardandoEntrega)} com <b>pedido emitido</b> — é prazo de entrega. </>}
            {r.solicitado > 0 && <>{fmtN(r.solicitado)} com <b>RM feita e pedido não emitido</b> — está no Compras. </>}
            {r.naoComprado > 0 && <>{fmtN(r.naoComprado)} <b>sem RM e sem pedido</b> — ninguém comprou ainda. </>}
            As outras {fmtN(r.liberaveis)} seguem normalmente.
          </span>
        </p>
      )}
      {r.estoqueSemR > 0 && (
        <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
          <Boxes size={15} className="mt-0.5 shrink-0" />
          <span>
            <b>{fmtN(r.estoqueSemR)} peça(s) usam material de estoque</b> e ainda não têm o R informado.
            O aço está no pátio — a nota dele foi lançada em outra obra, então o CMR desta não o
            enxerga. Informe qual R saiu da prateleira: é o que amarra a peça ao certificado certo.
          </span>
        </p>
      )}

      <div className="flex items-center gap-2">
        <button onClick={() => onImprimir?.(d.liberaveis)} disabled={!r.liberaveis}
          title={r.liberaveis ? `Imprimir ${fmtN(r.liberaveis)} peça(s) com o R carimbado` : "Nada liberável ainda"}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-torg-blue text-white hover:opacity-90 disabled:opacity-40">
          <Printer size={14} /> Imprimir {fmtN(r.liberaveis)} projeto(s) e gerar a GRD
        </button>
        <button onClick={carregar} disabled={carregando}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-torg-gray border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40">
          {carregando ? <Loader2 size={12} className="animate-spin" /> : <PackageSearch size={12} />} reanalisar
        </button>
        {r.pronto && <span className="text-[12px] text-emerald-700 inline-flex items-center gap-1"><Check size={14} /> material todo resolvido</span>}
      </div>
    </div>
  );
}
