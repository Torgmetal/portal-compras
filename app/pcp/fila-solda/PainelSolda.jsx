"use client";
// ─── REPARTIR A FILA DA SOLDA ENTRE AS BANCADAS ───────────────────────────────
// Espelha o painel da montagem (app/producao/programacao/montagem/PainelBancadas.jsx). O PCP marca
// os conjuntos, escolhe quantas bancadas vai usar, e o painel divide pelo CUSTO real de cada peça.
//
// ⚠⚠ NÃO DIVIDE POR QUANTIDADE DE PEÇA. Na solda, 58% das peças pesam ≤25 kg e valem 6% dos quilos;
// 6% pesam mais de 300 kg e valem 51%. Dividir 60 peças em 6 pilhas de 10 daria uma bancada com um
// dia de trabalho e outra com uma semana.
import { useState, useMemo } from "react";
import { Flame, Loader2, Download, ArrowRight } from "lucide-react";
import { BANCADAS, RITMO_CONSERVADOR, RITMO_META, RITMO_COMPLEXAS, repartirPorBancada, distribuirEmDias, ocupacaoDasBancadas } from "@/lib/solda-capacidade";
import { gerarFolhaSolda } from "@/lib/folha-solda";

const fmtKg = (v) => `${Math.round(Number(v) || 0).toLocaleString("pt-BR")} kg`;
// ⚠ peça e peso do QUE FALTA soldar — ver custoDoConjunto em lib/solda-capacidade
const unPend = (c) => (c?.qtePendente != null ? Math.max(0, Number(c.qtePendente) || 0) : Math.max(1, Number(c?.qte) || 1));
const kgPend = (c) => (c?.pesoPendenteKg != null ? Number(c.pesoPendenteKg) || 0 : Number(c?.pesoTotalKg) || 0);
const fmtN = (v) => (Number(v) || 0).toLocaleString("pt-BR");
const isoHoje = () => new Date().toISOString().split("T")[0];
const fmtDia = (iso) => {
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00Z");
  const s = d.toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" }).replace(".", "");
  return `${s} ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" })}`;
};

// ⚠ AS TRÊS RÉGUAS APARECEM, e a meta é a padrão. Vitor (01/09/2026): "a meta tem que ser acima de
// 200 ton" e "vamos para a guerra, precisa ser o desafio maior para validarmos". Mostrar as três
// lado a lado é o que deixa o desafio honesto: dá para ver quanto ele pede a mais do que a fábrica
// faz hoje, em vez de esconder o número dentro da conta.
//
// ⚠⚠ OS NOMES SÃO DO VITOR (01/09/2026): "deixa o guerra como meta, o do meio conservador e o
// último peças complexas". Não é só rótulo — muda o uso do terceiro. Ele era "dia comum" (a mediana
// medida) e servia só para enxergar; agora é o ritmo que se escolhe QUANDO O LOTE É DIFÍCIL, que é
// o caso em que planejar pela média estoura o prazo. O número não mudou, a pergunta que ele
// responde mudou.
const CURVAS = [
  { k: "META", rot: "meta · 200 t/mês", curva: RITMO_META, kgDia: 1588 },
  { k: "CONSERVADOR", rot: "conservador", curva: RITMO_CONSERVADOR, kgDia: 918 },
  { k: "COMPLEXAS", rot: "peças complexas", curva: RITMO_COMPLEXAS, kgDia: 453 },
];

export default function PainelSolda({ conjuntos, filaCompleta = [], onSugerir, ocupado }) {
  const [n, setN] = useState(6);
  const [inicio, setInicio] = useState(isoHoje());
  const [curvaK, setCurvaK] = useState("META");
  const [baixando, setBaixando] = useState(false);

  const curva = (CURVAS.find((c) => c.k === curvaK) || CURVAS[0]).curva;

  // ⚠⚠ A BANCADA OCUPADA SAI DA ROLETA. Vitor (01/09/2026): "a bancada que eu já selecionei não
  // deve permitir eu selecionar ela também, até que eu selecione uma data posterior ao prazo que de
  // fato ele vai levar" — e depois: "o seletor de solda não há necessidade, apenas o número de
  // bancadas". As duas coisas juntas: você diz QUANTAS, o painel escolhe QUAIS entre as livres.
  //
  // O "prazo que de fato ele vai levar" é medido, não digitado: é a carga que sobrou naquela
  // bancada (conjuntos gravados e ainda não soldados) convertida em dias pelo ritmo escolhido.
  // Mudando a data de início para depois disso, a bancada volta a aparecer sozinha.
  const ocupacao = useMemo(
    () => ocupacaoDasBancadas(filaCompleta.filter((c) => c.soldaBancada), inicio, curva),
    [filaCompleta, inicio, curva]);
  const livres = useMemo(() => BANCADAS.filter((b) => !ocupacao[b] || ocupacao[b].livreEm <= inicio), [ocupacao, inicio]);
  const ocupadas = useMemo(() => BANCADAS.filter((b) => !livres.includes(b)), [livres]);
  // ⚠ n é o que ele PEDIU; usadas é o que dá para usar. A diferença aparece na tela — pedir 6 e
  // receber 4 em silêncio é o tipo de coisa que só se descobre quando a folha sai errada.
  const nomes = useMemo(() => livres.slice(0, n), [livres, n]);

  const distrib = useMemo(() => repartirPorBancada(conjuntos, n, { curva, nomes }), [conjuntos, n, curva, nomes]);
  const porDia = useMemo(() => distribuirEmDias(distrib, inicio), [distrib, inicio]);

  const resumo = useMemo(() => {
    const un = conjuntos.reduce((s, c) => s + unPend(c), 0);
    const kg = conjuntos.reduce((s, c) => s + kgPend(c), 0);
    const dias = Math.max(0, ...porDia.map((b) => b.dias.length));
    const ops = [...new Set(conjuntos.map((c) => c.opNumero).filter(Boolean))];
    return { un, kg, dias, ops, diasBancada: distrib.reduce((s, b) => s + b.custo, 0) };
  }, [conjuntos, porDia, distrib]);

  async function exportarFolha() {
    setBaixando(true);
    try {
      await gerarFolhaSolda(porDia.map((b) => ({ bancada: b.bancada, dias: b.dias, itens: b.dias.flatMap((d) => d.itens) })), {
        subtitulo: `${[...new Set(conjuntos.map((c) => c.opNumero).filter(Boolean))].map((o) => `OP ${o}`).join(", ")} · inicio ${fmtDia(inicio)}`,
        nomeArquivo: `Ordem de solda - ${[...new Set(conjuntos.map((c) => c.opNumero).filter(Boolean))].join("-")} - ${inicio}.xlsx`,
      });
    } catch (e) {
      alert("Erro ao gerar a folha: " + (e?.message || e));
    } finally { setBaixando(false); }
  }

  // ⚠ grava a bancada e baixa a planilha no MESMO clique — eram dois botões e duas decisões para
  // um ato só, e dava para gravar sem levar a folha (ou o contrário) sem perceber.
  // ⚠⚠ A PLANILHA SAI ANTES DE GRAVAR. Vitor (01/09/2026): "fiz uma e não consegui emitir a
  // planilha". Gravar limpa a seleção, o painel desmonta e leva o botão da folha junto — ele ficou
  // com 11 conjuntos na SOLDA 1 e sem papel para entregar. Exportando primeiro, o arquivo já saiu
  // quando a tela muda. (E a tela ganhou "Planilha das bancadas", que emite do que está gravado.)
  async function liberar() {
    await exportarFolha();
    await onSugerir(porDia);
  }

  if (!conjuntos.length) return null;

  return (
    <div className="rounded-xl border border-torg-blue-100 bg-white p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <Flame size={16} className="text-torg-orange" />
        <span className="font-semibold text-torg-dark">Repartir entre as bancadas</span>
        <span className="text-[12px] text-torg-gray">{fmtN(conjuntos.length)} conjuntos · {fmtN(resumo.un)} peças · {fmtKg(resumo.kg)}</span>
        {resumo.ops.length > 1 && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-torg-blue-50 border border-torg-blue-100 text-torg-blue font-semibold">
            {resumo.ops.length} OPs no lote
          </span>
        )}
        {/* ⚠ "quantas bancadas vão soldar", não "bancadas". Vitor (01/09/2026) precisou perguntar o
            que o seletor fazia — e rótulo que exige pergunta é rótulo errado. O número é QUANTAS;
            QUAIS quem escolhe é o painel, entre as livres na data. */}
        <span className="text-[11px] text-torg-gray ml-auto">quantas bancadas vão soldar:</span>
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
          {[1, 2, 3, 4, 5, 6].map((x) => (
            <button key={x} onClick={() => setN(x)}
              className={`px-2.5 py-1 text-sm font-semibold ${x === n ? "bg-torg-blue text-white" : "bg-white text-torg-gray hover:bg-gray-50"}`}>{x}</button>
          ))}
        </div>
        <span className="text-[11px] text-torg-gray">a partir de</span>
        <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)}
          className="px-2 py-1 text-sm border border-gray-200 rounded-lg" />
      </div>
      {/* ⚠ quais entraram, escrito por extenso: pedir 6 e receber 4 (bancada ocupada) precisa ser
          legível sem abrir o cartão de resumo. */}
      {nomes.length > 0 && (
        <p className="text-[11px] text-torg-gray -mt-1">
          vão soldar: <b className="text-torg-dark">{nomes.join(" · ")}</b>
          {nomes.length < n && <span className="text-amber-700 font-semibold"> — as outras estão ocupadas nesta data</span>}
        </p>
      )}

      {(ocupadas.length > 0 || nomes.length < n) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          {ocupadas.length > 0 && (
            <div>
              <b>Ocupadas nesta data:</b>{" "}
              {ocupadas.map((b) => `${b} até ${fmtDia(ocupacao[b].livreEm)} (${ocupacao[b].conj} conj)`).join(" · ")}
            </div>
          )}
          {nomes.length < n && (
            <div className="mt-0.5">
              Só <b>{nomes.length}</b> bancada(s) livre(s) — o plano abaixo usa essas. Mova o início para depois, ou solde com menos.
            </div>
          )}
        </div>
      )}

      {/* ⚠ as três réguas visíveis: sem isso o "200 t" viraria um número mágico dentro da conta */}
      <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
        <span className="text-torg-gray">ritmo:</span>
        {CURVAS.map((c) => (
          <button key={c.k} onClick={() => setCurvaK(c.k)}
            title={`${c.kgDia} kg por bancada-dia · ${Math.round(c.kgDia * 21 * 6 / 1000)} t/mês com 6 bancadas`}
            className={`px-2 py-1 rounded-md border font-semibold ${
              curvaK === c.k ? "border-torg-orange bg-torg-orange text-white" : "border-gray-200 bg-white text-torg-gray hover:bg-gray-50"}`}>
            {c.rot}
          </button>
        ))}
        <span className="text-torg-gray-light ml-1">
          {(CURVAS.find((c) => c.k === curvaK) || CURVAS[0]).kgDia} kg/bancada-dia
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Cx rot="fecha em" val={`${resumo.dias} dia(s)`} sub={`${nomes.length} bancada(s): ${nomes.map((b) => b.replace("SOLDA ", "")).join(", ") || "—"}`} forte />
        <Cx rot="carga total" val={`${resumo.diasBancada.toFixed(1)}`} sub="dias-bancada" />
        <Cx rot="por bancada/dia" val={`${Math.round(resumo.kg / Math.max(0.1, resumo.diasBancada))} kg`} sub="no ritmo escolhido" />
        <Cx rot="peças/bancada" val={fmtN(Math.round(resumo.un / Math.max(1, nomes.length)))} sub="no total do lote" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="text-[10px] uppercase text-torg-gray-light border-b border-gray-100">
            <tr><th className="text-left py-1">Bancada</th><th className="text-right">Conj</th><th className="text-right">Peças</th>
                <th className="text-right">kg</th><th className="text-right">Dias</th><th className="text-left pl-3">Quando</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {porDia.map((b) => {
              const itens = b.dias.flatMap((d) => d.itens);
              const un = itens.reduce((s, c) => s + unPend(c), 0);
              const kg = itens.reduce((s, c) => s + kgPend(c), 0);
              return (
                <tr key={b.bancada}>
                  <td className="py-1.5 font-semibold text-torg-dark">{b.bancada}</td>
                  <td className="text-right tabular-nums">{itens.length}</td>
                  <td className="text-right tabular-nums">{fmtN(un)}</td>
                  <td className="text-right tabular-nums">{fmtKg(kg)}</td>
                  <td className="text-right tabular-nums font-semibold">{b.dias.length}</td>
                  <td className="pl-3 text-torg-gray text-[11px]">
                    {b.dias.length ? `${fmtDia(b.dias[0].dia)} → ${fmtDia(b.dias[b.dias.length - 1].dia)}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2 flex-wrap pt-1">
        {/* ⚠⚠ LIBERAR NA SOLDA NÃO IMPRIME DESENHO NEM GERA GRD. Vitor (01/09/2026): "coloque a
            opção para liberar na aba de solda, pois não precisa de GRD, precisa apenas gerar a
            planilha para o líder e para cada bancada". A GRD existe para provar que o DESENHO desceu
            — e o desenho já desceu na montagem, com o R carimbado. Emitir de novo na solda criaria
            uma segunda GRD para a mesma marca e sujaria a auditoria com uma liberação que não
            aconteceu. Aqui liberar é: grava a bancada e sai a planilha. */}
        <button onClick={liberar} disabled={ocupado || baixando}
          className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue-700 inline-flex items-center gap-2 disabled:opacity-50">
          {ocupado || baixando ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
          Liberar para a solda
        </button>
        <button onClick={exportarFolha} disabled={baixando}
          title="Só a planilha, sem gravar a bancada"
          className="px-3 py-2 border border-torg-blue-100 text-torg-blue text-sm font-medium rounded-lg hover:bg-torg-blue-50 inline-flex items-center gap-2 disabled:opacity-50">
          {baixando ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
          Só a planilha
        </button>
        {/* ⚠ a bancada continua sendo SUGESTÃO — quem manda nela é o líder no chão (decisão do
            Vitor em 01/09). O painel reparte e registra a intenção; não cobra aderência. */}
        <span className="text-[11px] text-torg-gray">sem GRD: o desenho já desceu na montagem. A bancada é sugestão — quem senta nela é do líder.</span>
      </div>
    </div>
  );
}

function Cx({ rot, val, sub, forte }) {
  return (
    <div className={`rounded-lg border px-2.5 py-2 ${forte ? "border-torg-orange/40 bg-torg-orange/5" : "border-gray-100 bg-gray-50/60"}`}>
      <p className="text-[10px] uppercase tracking-wider text-torg-gray-light">{rot}</p>
      <p className="text-[15px] font-extrabold text-torg-dark tabular-nums leading-tight">{val}</p>
      <p className="text-[10px] text-torg-gray">{sub}</p>
    </div>
  );
}
