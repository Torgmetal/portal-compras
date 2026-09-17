"use client";

// ─── PRAZOS DAS RMs — TODAS DE UMA VEZ ───────────────────────────────────────
//
// Matheus (16/09/2026): "preciso de uma aba fora para ver todas as RMs de uma vez, seus pedidos e
// prazos de cada", aberta pelo que aperta.
//
// ⚠ A conta não mora aqui: situação, ordem e resumo vêm de `lib/painel-prazos-rm`, que por sua vez
// usa a mesma `linhaDoTempo` da régua dentro da RM. Duas telas que contam o mesmo atraso não podem
// discordar em um dia.
import { useEffect, useState, useMemo } from "react";
import { Loader2, AlertCircle, Package, CalendarClock, ChevronRight } from "lucide-react";
import { rotuloSituacao, filtrarLinhas, resumoPorSituacao, fornecedoresDasLinhas, filtrarPorFornecedor } from "@/lib/painel-prazos-rm";


import CartaoRM from "./CartaoRM";
import BarraFiltros from "./BarraFiltros";


export default function PrazosRMClient() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  // ⚠ Abre em "pendentes" porque 71% do acervo já chegou (168 de 236 RMs, medido em 16/09/2026):
  // aberta em "todas", a tela saía com 31 mil pixels e escondia as 53 RMs que apertam atrás das
  // que já foram resolvidas.
  const [filtro, setFiltro] = useState("PENDENTES");
  const [obra, setObra] = useState(""); // OP.numero ("" = todas)
  const [fornecedor, setFornecedor] = useState(""); // fornecedorNome ("" = todos)

  const buscar = async () => {
    setCarregando(true);
    setErro("");
    try {
      const r = await fetch("/api/compras/prazos-rm");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Não foi possível carregar.");
      setDados(j);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  };
  useEffect(() => { buscar(); }, []);

  // ⚠⚠ A OBRA FILTRA ANTES DE TUDO — cartões, contadores e lista. Matheus (16/09/2026): "adicionar
  // filtros por obra se eu quiser ver RMs somente de uma obra os prazos".
  //
  // ⚠ Aqui o filtro pode ser do NAVEGADOR sem mentir, porque a rota não corta nada: ela devolve
  // todos os pedidos CRIADOS, sem `take`. Nas RMs de material o mesmo desenho escondeu 111 linhas
  // justamente porque lá havia um `take: 100` antes do filtro. Se um dia esta rota ganhar teto, o
  // filtro tem que subir para o servidor junto — senão o defeito volta igual.
  const daObra = useMemo(
    () => (obra ? (dados?.linhas || []).filter((l) => String(l.op?.numero || "") === obra) : (dados?.linhas || [])),
    [dados, obra]
  );

  // ⚠⚠ O FORNECEDOR FILTRA DEPOIS DA OBRA, e refaz a conta de cada RM (ver `filtrarPorFornecedor`).
  // Matheus (17/09/2026): "preciso de um filtro de fornecedor também na tela Prazos das RMs".
  //
  // ⚠ A ordem importa: obra → fornecedor. Ao contrário, as opções de fornecedor teriam de sair do
  // acervo inteiro e a pessoa escolheria um que não tem pedido nenhum naquela obra.
  const daFornecedor = useMemo(() => filtrarPorFornecedor(daObra, fornecedor), [daObra, fornecedor]);
  // As opções saem do que a OBRA já deixou passar — fornecedor sem pedido na obra escolhida não
  // entra na lista, senão o seletor oferece caminho que só leva à tela vazia.
  const fornecedores = useMemo(() => fornecedoresDasLinhas(daObra), [daObra]);

  // ⚠⚠ OS CONTADORES SEGUEM A OBRA. Deixá-los no resumo do servidor faria o cabeçalho dizer
  // "Atrasado 37" enquanto a lista da obra mostra 2 — número que não corresponde ao que está na
  // tela é pior que número nenhum.
  const resumo = useMemo(
    () => (obra || fornecedor ? resumoPorSituacao(daFornecedor) : dados?.resumo),
    [obra, fornecedor, daFornecedor, dados]
  );

  // As obras que têm RM com pedido, com quantas cada uma tem. Saem de TODAS as linhas, nunca das
  // já filtradas — senão escolher uma obra apagaria as outras da lista de opções.
  const obras = useMemo(() => {
    const m = new Map();
    for (const l of dados?.linhas || []) {
      const n = l.op?.numero ? String(l.op.numero) : null;
      if (!n) continue;
      if (!m.has(n)) m.set(n, { numero: n, cliente: l.op.cliente || l.op.obra || "", quantidade: 0 });
      m.get(n).quantidade++;
    }
    const num = (x) => parseInt(String(x).match(/\d+/)?.[0] || "0", 10);
    return [...m.values()].sort((a, b) => num(b.numero) - num(a.numero));
  }, [dados]);

  const visiveis = useMemo(() => filtrarLinhas(daFornecedor, filtro), [daFornecedor, filtro]);


  if (carregando) {
    return <p className="py-16 text-center text-sm text-torg-gray inline-flex items-center gap-2 justify-center w-full"><Loader2 size={16} className="animate-spin" /> Carregando os prazos…</p>;
  }
  if (erro) {
    return (
      <div className="py-16 text-center">
        <AlertCircle size={28} className="mx-auto text-red-400" />
        <p className="mt-2 text-sm text-red-700">{erro}</p>
        <button onClick={buscar} className="mt-3 px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">Tentar novamente</button>
      </div>
    );
  }

  const r = resumo;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-torg-dark flex items-center gap-2"><CalendarClock size={22} /> Prazos das RMs</h1>
        <p className="text-sm text-torg-gray mt-0.5">
          Todas as RMs com pedido no Omie, seus pedidos e o prazo de cada um. O que aperta vem primeiro.
        </p>
      </div>

      <BarraFiltros r={r} obras={obras} obra={obra} setObra={setObra}
        fornecedores={fornecedores} fornecedor={fornecedor} setFornecedor={setFornecedor}
        filtro={filtro} setFiltro={setFiltro} />

      {visiveis.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-xl border border-gray-100">
          <Package size={28} className="mx-auto text-gray-300" />
          <p className="mt-2 text-sm text-torg-gray">
            {(() => {
              // ⚠ Com obra escolhida o vazio diz QUAL obra: "nenhuma RM atrasada" sem dizer onde
              // faz parecer que o portal inteiro está em dia.
              const onde = [
                obra ? ` na OP-${String(obra).padStart(3, "0")}` : "",
                // ⚠ o NOME, não a chave: `fornecedor` guarda `cnpj:45987062`, que não diz nada
                // a quem está lendo a tela vazia.
                fornecedor ? ` com pedido de ${fornecedores.find((f) => f.chave === fornecedor)?.nome || "esse fornecedor"}` : "",
              ].join("");
              if (filtro === "PENDENTES") return `Nenhuma RM${onde} esperando entrega — o que foi pedido já chegou ou foi encerrado no Omie.`;
              if (filtro === "TODAS") return `Nenhuma RM${onde} com pedido gerado ainda.`;
              return `Nenhuma RM${onde} em "${rotuloSituacao(filtro)}".`;
            })()}
          </p>
          {(filtro !== "TODAS" || obra || fornecedor) && (
            <button onClick={() => { setFiltro("TODAS"); setObra(""); setFornecedor(""); }} className="mt-3 text-sm text-torg-blue hover:underline inline-flex items-center gap-1">
              ver todas <ChevronRight size={13} />
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {visiveis.map((l) => <CartaoRM key={l.rmId || l.numero} l={l} />)}
        </div>
      )}
    </div>
  );
}
