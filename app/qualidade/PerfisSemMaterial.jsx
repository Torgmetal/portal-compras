"use client";
import { useState } from "react";
import { Loader2, PackageSearch, Check, AlertTriangle } from "lucide-react";
import { useStore } from "@/lib/store";

const fmtN = (v) => Number(v || 0).toLocaleString("pt-BR");
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");

/**
 * PERFIL SEM MATERIAL NA OP — de onde veio esse aço?
 *
 * Vitor (22/08/2026), sobre as peças sem R no data book da OP-067: "você não consegue preencher
 * essa informação através dos certificados que te falei que estava na pasta?".
 *
 * ⚠ A PASTA NÃO PREENCHE ISSO. Os PDFs de lá são indexados POR R ("R 260787.pdf"): dizem qual
 * certificado pertence a um R, não qual peça consumiu qual R. Quem atribui R a peça é o consumo
 * FIFO sobre o CMR — o registro de RECEBIMENTO —, não o arquivo digitalizado.
 *
 * O que preenche é o próprio CMR, quando o material existe mas está lançado em OUTRA OP: é o
 * "material de estoque" que ele descreveu. Na OP-067, 391 das 520 marcas sem material são o mesmo
 * perfil (TB 1.1/4"), com entrada sob a OP-079.
 *
 * ⚠ E O PORTAL PROPÕE, NÃO AFIRMA. Puxar sozinho o certificado de outra OP seria inventar
 * rastreabilidade — ninguém além de quem separou sabe se aquele fardo é mesmo este. Confirmado,
 * grava a troca por OP+perfil, que o motor já respeita acima do FIFO: UM registro resolve as 391.
 */
export default function PerfisSemMaterial() {
  const { showToast } = useStore();
  const [op, setOp] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(null);

  const buscar = async (e) => {
    e?.preventDefault();
    const n = op.trim().replace(/\D/g, "").padStart(3, "0");
    if (!n || n === "000") return;
    setLoading(true); setErro(""); setData(null);
    try {
      const r = await fetch(`/api/qualidade/rastreabilidade/sem-material?op=${n}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      setData(j);
    } catch (e2) { setErro(e2.message); } finally { setLoading(false); }
  };

  // ⚠⚠ ATÉ ONDE A DECLARAÇÃO VALE. Perfil que não tem material nenhum na OP: vale para TODAS as
  // peças dele (foi assim que isso nasceu, em 22/08). Perfil que TEM material e só perdeu algumas
  // peças — a cortada antes da entrega — recebe SEM_R: preenche o que ficou sem R e não encosta no
  // que o CMR da própria OP já respondeu. Na OP-106 é a diferença entre resolver 1 peça e apagar o
  // rastreio bom das outras 3 do mesmo perfil. (Vitor, 28/08/2026: "sem você quebrar outras coisas".)
  const apontar = async (perfil, r, escopo) => {
    setSalvando(`${perfil}|${r}`);
    try {
      const res = await fetch("/api/pcp/separacao", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opId: data.op.id,
          trocas: [{
            perfil, rUsado: r, escopo,
            motivo: escopo === "SEM_R"
              ? "peça cortada antes da entrega — origem do estoque apontada na conferência de rastreabilidade"
              : "material de estoque — origem apontada na conferência de rastreabilidade",
          }],
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Erro");
      showToast("Origem registrada — o data book passa a trazer o certificado.", "success");
      buscar();
    } catch (e) { showToast(e.message, "error"); } finally { setSalvando(null); }
  };

  const t = data?.totais;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-4">
      <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-torg-dark inline-flex items-center gap-1.5">
            <PackageSearch size={15} className="text-torg-blue" /> Peça sem certificado — de onde veio o aço
          </p>
          <p className="text-[11px] text-torg-gray mt-0.5">
            As duas faltas que deixam a peça sem R no data book: <b>sem material</b> (não há entrada
            desse perfil na OP) e <b>cortada antes da entrega</b> (o aço da OP chegou depois do corte —
            saiu do estoque). Aponte de onde veio e o certificado passa a valer.
          </p>
        </div>
        <form onSubmit={buscar} className="flex items-center gap-2">
          <input value={op} onChange={(e) => setOp(e.target.value)} placeholder="OP (ex.: 067)"
            className="w-32 border border-gray-200 rounded-lg px-3 py-1.5 text-[13px]" />
          <button type="submit" disabled={loading}
            className="text-[12px] font-semibold text-white bg-torg-blue hover:bg-torg-dark rounded-lg px-3 py-1.5 disabled:opacity-50">
            {loading ? <Loader2 size={13} className="animate-spin" /> : "Conferir"}
          </button>
        </form>
      </div>

      <div className="p-4">
        {erro && <p className="text-[12px] text-red-600">{erro}</p>}
        {loading && <p className="text-[12px] text-torg-gray inline-flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> calculando o rastreio da OP…</p>}

        {data && !loading && (
          <>
            <p className="text-[12px] text-torg-gray mb-3">
              OP-{data.op.numero}{data.op.obra ? ` · ${data.op.obra}` : ""} —{" "}
              {t.perfis === 0
                ? "todo perfil desta OP tem material no CMR."
                : <>{fmtN(t.perfis)} {t.perfis === 1 ? "perfil" : "perfis"} sem material, somando {fmtN(t.marcas)} {t.marcas === 1 ? "marca" : "marcas"}.
                   {t.semCandidato > 0 && <> {fmtN(t.semCandidato)} sem candidato em nenhuma OP.</>}</>}
            </p>

            <div className="space-y-3">
              {(data.perfis || []).map((g) => (
                <div key={g.perfil} className="border border-gray-100 rounded-lg p-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
                    <span className="text-[13px] font-bold text-torg-dark font-mono">{g.perfil}</span>
                    <span className="text-[11px] text-torg-orange-700 font-semibold">{fmtN(g.marcas)} {g.marcas === 1 ? "marca" : "marcas"}</span>
                    {/* ⚠ dizer QUAL é a falta: "sem material" e "cortada antes" pedem decisões
                        diferentes — a primeira é material de outra OP, a segunda é sobra de estoque. */}
                    {g.motivo === "MISTO" && (
                      <span className="text-[10px] font-semibold text-torg-blue bg-torg-blue-50 border border-torg-blue-300 rounded-full px-2 py-0.5 whitespace-nowrap"
                        title="As demais peças deste perfil já têm R do CMR desta OP e não serão alteradas">
                        só as peças sem R
                      </span>
                    )}
                    {g.motivo !== "SEM_MATERIAL" && (
                      <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 whitespace-nowrap">
                        cortada antes da entrega{g.cortadoEm ? ` · corte ${fmtD(g.cortadoEm)}` : ""}
                      </span>
                    )}
                    <span className="text-[11px] text-torg-gray truncate">{g.exemplos.join(", ")}{g.marcas > g.exemplos.length ? "…" : ""}</span>
                    {g.jaApontado && (
                      <span className="text-[11px] font-semibold text-green-700 inline-flex items-center gap-1">
                        <Check size={12} /> origem R {g.jaApontado}
                      </span>
                    )}
                  </div>

                  {g.candidatos.length === 0 ? (
                    <p className="text-[11px] text-torg-gray inline-flex items-center gap-1.5">
                      <AlertTriangle size={12} className="text-torg-orange-700" />
                      Este perfil não existe no CMR de nenhuma OP — o material não foi lançado no recebimento.
                    </p>
                  ) : (
                    <div className="max-h-52 overflow-y-auto divide-y divide-gray-50">
                      {g.candidatos.map((c) => (
                        <div key={c.r} className="py-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
                          <span className="font-semibold text-torg-blue w-16 shrink-0">R {c.r}</span>
                          <span className="text-torg-gray shrink-0">{c.op ? `OP-${c.op}` : "sem OP"}</span>
                          <span className="text-torg-dark shrink-0">{c.corrida ? `corrida ${c.corrida}` : "sem corrida"}</span>
                          <span className="text-torg-gray truncate max-w-[190px]">{c.certificado || "—"}</span>
                          <span className={`shrink-0 ${c.antesDoCorte === false ? "text-amber-700 font-semibold" : "text-torg-gray"}`}
                            title={c.antesDoCorte === false ? "Chegou DEPOIS do corte — não pode ser a origem desta peça" : undefined}>
                            {fmtD(c.recebidoEm)}{c.antesDoCorte === false ? " ⚠" : ""}
                          </span>
                          <span className="text-torg-gray shrink-0">{fmtN(c.pesoKg)} kg</span>
                          {!c.temArquivo && <span className="text-torg-orange-700 shrink-0">sem PDF</span>}
                          <button onClick={() => apontar(g.perfil, c.r, g.motivo === "SEM_MATERIAL" ? "TODAS" : "SEM_R")} disabled={!!salvando}
                            className="ml-auto shrink-0 text-[10px] font-semibold text-torg-blue hover:underline disabled:opacity-50">
                            {salvando === `${g.perfil}|${c.r}` ? "gravando…" : g.jaApontado === c.r ? "apontado" : "veio deste"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
