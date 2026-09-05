"use client";
import { useEffect, useState } from "react";
import { PADRAO_CRONOGRAMA, comprasEspeciais, montarCronogramaPrevio, textoDaProposta } from "@/lib/cronograma-previo";
import { Inp } from "./campos";
import { num } from "../_lib/formatos";

/**
 * CRONOGRAMA PRÉVIO — o prazo que vai na proposta.
 *
 * Vitor (05/09/2026): "após o cenário financeiro precisamos de uma forma de gerar um cronograma
 * prévio para compor na proposta… temos que ter um tempo médio para engenharia, compras, produção
 * e, de acordo com a média de carga prevista, deixar a representação das cargas e de quantos em
 * quantos dias vamos ter entregas".
 *
 * ⚠ O NÚMERO NASCE MEDIDO, NÃO CHUTADO. Os ritmos vêm das obras que já rodaram (medidos em
 * /api/comercial/estudos/prazos) e aparecem escritos na tela, com a amostra. Quem quiser mudar,
 * muda — e o que foi mudado fica marcado, para ninguém confundir referência com decisão.
 */
export function CronogramaPrevio({ c, res, e, setComp }) {
  const cfg = c.cronograma || {};
  const [medido, setMedido] = useState(null);
  const [copiado, setCopiado] = useState(false);
  useEffect(() => {
    let vivo = true;
    fetch("/api/comercial/estudos/prazos").then((r) => r.json())
      .then((j) => { if (vivo && !j.error) setMedido(j); }).catch(() => {});
    return () => { vivo = false; };
  }, []);

  const set = (k, v) => setComp({ cronograma: { ...cfg, [k]: v } });
  // referência = o que a casa mediu; se ainda não mediu, o padrão conservador da lib
  // ⚠ o MEDIDO entra só onde ele descreve o mesmo fato. O ritmo de engenharia do histórico inclui
  // espera de documentação e o tempo até a lista ser importada — não é prazo a vender; e a cadência
  // por obra do histórico é obra dividindo a fábrica. Nos dois casos o padrão é a META da casa, e o
  // medido fica escrito ao lado para comparação. (Vitor, 05/09/2026.)
  const ref = {
    engenhariaKgDiaUtil: PADRAO_CRONOGRAMA.engenhariaKgDiaUtil,
    engDiasBase: PADRAO_CRONOGRAMA.engDiasBase,
    engDiasMax: PADRAO_CRONOGRAMA.engDiasMax,
    liberacaoFabricaPct: PADRAO_CRONOGRAMA.liberacaoFabricaPct,
    comprasDias: medido?.comprasDias || PADRAO_CRONOGRAMA.comprasDias,
    comprasInicioPct: PADRAO_CRONOGRAMA.comprasInicioPct,
    producaoTonMes: PADRAO_CRONOGRAMA.producaoTonMes,
    ocupacaoPct: PADRAO_CRONOGRAMA.ocupacaoPct,
    diasCarregamento: PADRAO_CRONOGRAMA.diasCarregamento,
  };
  const vale = (k) => (cfg[k] === "" || cfg[k] == null ? ref[k] : num(cfg[k]));
  const mexido = (k) => cfg[k] !== "" && cfg[k] != null && num(cfg[k]) !== ref[k];

  const pesoKg = num(res.pesoTotal);
  const cargas = res.cargas?.totalCargas || 0;
  const especiais = comprasEspeciais(res);
  const cron = montarCronogramaPrevio(
    { pesoKg, cargas, comprasEspeciais: especiais },
    { ...Object.fromEntries(Object.keys(ref).map((k) => [k, vale(k)])), inicio: cfg.inicio || null },
  );
  // ── o que vai na folha (o cálculo é sempre inteiro; muda o que o cliente vê) ──
  const folha = cfg.folha || {};
  const setFolha = (k, v) => setComp({ cronograma: { ...cfg, folha: { ...folha, [k]: v } } });
  const ocultas = new Set(folha.etapasOcultas || []);
  const alternarEtapa = (k) => {
    const nova = new Set(ocultas);
    if (nova.has(k)) nova.delete(k); else nova.add(k);
    setFolha("etapasOcultas", [...nova]);
  };
  const [baixando, setBaixando] = useState(false);
  const baixarPdf = async () => {
    setBaixando(true);
    try {
      const r2 = await fetch(`/api/comercial/estudos/${e.id}/cronograma-pdf`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cfg: { ...Object.fromEntries(Object.keys(ref).map((k) => [k, vale(k)])), inicio: cfg.inicio || null }, folha }),
      });
      if (!r2.ok) throw new Error((await r2.json().catch(() => ({}))).error || "Falha ao gerar o PDF");
      const blob = await r2.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `Cronograma preliminar ${e.obra || e.cliente || ""}.pdf`.trim();
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (err) { alert(err.message); } finally { setBaixando(false); }
  };
  const texto = textoDaProposta(cron, { obra: e.obra || null });
  const total = Math.max(1, cron.resumo.totalUteis);
  const dt = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");

  return (
    <div className="space-y-4 max-w-5xl">
      <p className="text-[12px] text-torg-gray">
        O prazo sai do RITMO da casa vezes o peso do escopo — não de um número redondo. Engenharia e
        fabricação em quilos por dia útil; compras em dias, que é como o fornecedor promete. As fases
        se sobrepõem: a compra do aço começa com a estrutura ainda em detalhamento.
      </p>

      <div className="bg-white border border-gray-100 rounded-xl p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <p className="text-[12px] font-bold text-torg-dark">Ritmo e prazos</p>
          {medido && (
            <p className="text-[11px] text-torg-gray">
              Histórico da casa, para comparar: engenharia <b>{medido.engenhariaKgDiaUtil?.toLocaleString("pt-BR")} kg/dia</b> ({medido.amostras.engenharia} obras, inclui espera de documentação) ·
              compras <b>{medido.comprasDias} dias</b> ({medido.amostras.compras}) ·
              fabricação <b>{Math.round((medido.producaoKgDiaUtil || 0) * 22 / 1000)} t/mês por obra</b> ({medido.amostras.producao}, obra dividindo a fábrica)
            </p>
          )}
        </div>
        <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-3">
          {[
            ["engenhariaKgDiaUtil", "Engenharia", "kg por dia útil"],
            ["engDiasMax", "Teto da engenharia", "dias úteis, mesmo em obra grande"],
            ["liberacaoFabricaPct", "Libera a fábrica em", "% da engenharia"],
            ["comprasDias", "Compras", "dias até o aço chegar"],
            ["comprasInicioPct", "Compra começa em", "% da engenharia"],
            ["producaoTonMes", "Fábrica", "toneladas por mês (meta)"],
            ["ocupacaoPct", "Fatia desta obra", "% da fábrica dedicada"],
            ["diasCarregamento", "Carregamento", "dias após a última peça"],
          ].map(([k, rot, ajuda]) => (
            <label key={k} className="flex flex-col text-[11px] text-torg-dark">
              <span className="min-h-[2.75em] leading-snug">
                {rot}
                {mexido(k) && <span className="text-torg-orange-700" title="valor digitado, diferente da referência da casa"> ·alterado</span>}
              </span>
              <Inp value={cfg[k] ?? ""} placeholder={String(ref[k])} onChange={(ev) => set(k, ev.target.value)} className="block mt-1 w-full text-right" />
              <span className="block text-[10px] text-torg-gray mt-0.5">{ajuda}</span>
            </label>
          ))}
          <label className="flex flex-col text-[11px] text-torg-dark">
            <span className="min-h-[2.75em] leading-snug">Início previsto</span>
            <Inp type="date" value={cfg.inicio || ""} onChange={(ev) => set("inicio", ev.target.value)} className="block mt-1 w-full" />
            <span className="block text-[10px] text-torg-gray mt-0.5">opcional — gera as datas</span>
          </label>
        </div>
        {Object.keys(ref).some(mexido) && (
          <button onClick={() => setComp({ cronograma: { inicio: cfg.inicio || "" } })}
            className="mt-3 text-[11px] font-semibold text-torg-blue hover:underline">
            voltar ao ritmo medido da casa
          </button>
        )}
      </div>

      {pesoKg <= 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-6 text-center text-[12px] text-torg-gray">
          Sem peso no escopo — o cronograma sai do quantitativo.
        </div>
      ) : (
        <>
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[12px] font-bold text-torg-dark">
                {cron.resumo.totalCorridos} dias corridos · {Number(pesoKg).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg
              </p>
              <p className="text-[11px] text-torg-gray">
                {cron.resumo.dataInicio ? <>{dt(cron.resumo.dataInicio)} → {dt(cron.resumo.dataFim)} · </> : null}
                {cron.resumo.totalUteis} dias úteis
              </p>
            </div>
            <div className="p-4 space-y-2">
              {cron.fases.map((f) => (
                <div key={f.key} className="flex items-center gap-3">
                  <div className="w-40 shrink-0">
                    <p className="text-[12px] font-semibold text-torg-dark">{f.nome}</p>
                    <p className="text-[10px] text-torg-gray leading-tight">{f.detalhe}</p>
                  </div>
                  <div className="flex-1 h-6 bg-gray-50 rounded relative min-w-0">
                    <div className="absolute top-0 bottom-0 rounded flex items-center px-2"
                      style={{ left: `${(f.inicio / total) * 100}%`, width: `${Math.max(1.5, (f.dias / total) * 100)}%`, background: f.cor }}>
                      <span className="text-[10px] font-semibold text-white whitespace-nowrap">{f.dias} d</span>
                    </div>
                  </div>
                  <div className="w-32 shrink-0 text-right text-[10px] text-torg-gray tabular-nums">
                    {cron.resumo.dataInicio ? <>{dt(f.dataInicio)} → {dt(f.dataFim)}</> : <>dia {f.inicio} → {f.fim}</>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-[12px] font-bold text-torg-dark">
                Entregas — {cargas} {cargas === 1 ? "carga" : "cargas"}
                {cargas > 1 && <span className="text-torg-gray font-normal"> · {cron.resumo.ritmoEntregas}</span>}
              </p>
              <p className="text-[11px] text-torg-gray mt-0.5">
                As cargas saem da aba de Frete, por classe de estrutura, e acompanham a fabricação.
              </p>
            </div>
            {cargas === 0 ? (
              <p className="px-4 py-6 text-center text-[12px] text-torg-gray">Nenhuma carga calculada — confira a aba Frete.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead className="bg-gray-50 text-[10px] uppercase text-torg-gray">
                    <tr><th className="text-left px-4 py-2">Carga</th><th className="text-right px-2 py-2">Dia útil</th>
                      <th className="text-right px-2 py-2">Dia corrido</th><th className="text-right px-2 py-2">Data</th>
                      <th className="text-right px-4 py-2">Peso</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {cron.entregas.map((x) => (
                      <tr key={x.n}>
                        <td className="px-4 py-1.5">{x.n}ª carga</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{x.diaUtil}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{Math.round((x.diaUtil * 7) / 5)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{dt(x.data)}</td>
                        <td className="px-4 py-1.5 text-right tabular-nums">{x.kg.toLocaleString("pt-BR")} kg</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ⚠⚠ NEM TUDO QUE O ESTUDO SABE VAI PARA O CLIENTE. Vitor (05/09/2026): "precisamos ter
              como editar as informações, pois tem horas que não vamos querer usar a quantidade de
              cargas para mostrar ao cliente". O cálculo continua inteiro — muda o que a folha
              mostra, e a escolha fica gravada no estudo. */}
          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
              <p className="text-[12px] font-bold text-torg-dark">O que vai na folha do cliente</p>
              <button onClick={baixarPdf} disabled={baixando}
                className="text-[11px] font-semibold text-white bg-torg-blue hover:bg-torg-dark rounded-lg px-3 py-1.5 disabled:opacity-50">
                {baixando ? "gerando…" : "Baixar PDF"}
              </button>
            </div>
            <label className="block text-[11px] text-torg-dark mb-3">
              Título da folha
              <Inp value={folha.titulo ?? ""} placeholder="CRONOGRAMA PRELIMINAR DE FORNECIMENTO"
                onChange={(ev) => setFolha("titulo", ev.target.value)} className="block mt-1 w-full" />
            </label>
            <label className="flex items-center gap-2 text-[12px] text-torg-dark mb-3">
              <input type="checkbox" checked={folha.mostrarCargas !== false} onChange={(ev) => setFolha("mostrarCargas", ev.target.checked)} />
              Mostrar as cargas (quantidade, intervalo e quadro de entregas)
              {folha.mostrarCargas === false && <span className="text-[10px] text-torg-gray">— a folha mostra a fabricação e a primeira entrega no lugar</span>}
            </label>
            <p className="text-[11px] font-semibold text-torg-dark mb-1">Etapas na folha</p>
            <div className="space-y-1 mb-3">
              {cron.fases.map((f2) => (
                <div key={f2.key} className="flex items-center gap-2 text-[12px]">
                  <input type="checkbox" checked={!ocultas.has(f2.key)} onChange={() => alternarEtapa(f2.key)} />
                  <Inp value={folha.rotulos?.[f2.key] ?? ""} placeholder={f2.nome}
                    onChange={(ev) => setFolha("rotulos", { ...(folha.rotulos || {}), [f2.key]: ev.target.value })}
                    className="w-64" />
                  <span className="text-[11px] text-torg-gray">{Math.round(f2.dias * 7 / 5)} dias</span>
                </div>
              ))}
            </div>
            <label className="block text-[11px] text-torg-dark">
              Observação (entra no fim das premissas)
              <Inp value={folha.observacao ?? ""} onChange={(ev) => setFolha("observacao", ev.target.value)}
                className="block mt-1 w-full" placeholder="ex.: prazo condicionado à liberação da área pelo cliente" />
            </label>
          </div>

          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
              <p className="text-[12px] font-bold text-torg-dark">Para a proposta</p>
              <button onClick={() => { navigator.clipboard?.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }}
                className="text-[11px] font-semibold text-torg-blue hover:underline">
                {copiado ? "copiado" : "copiar texto"}
              </button>
            </div>
            <p className="text-[12px] text-torg-dark leading-relaxed bg-gray-50 border border-gray-100 rounded-lg p-3">{texto}</p>
          </div>
        </>
      )}
    </div>
  );
}
