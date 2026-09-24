"use client";

// ─── PRAZOS DAS RMs — TODAS DE UMA VEZ ───────────────────────────────────────
//
// Matheus (16/09/2026): "preciso de uma aba fora para ver todas as RMs de uma vez, seus pedidos e
// prazos de cada", aberta pelo que aperta.
//
// ⚠ A conta não mora aqui: situação, ordem e resumo vêm de `lib/painel-prazos-rm`, que por sua vez
// usa a mesma `linhaDoTempo` da régua dentro da RM. Duas telas que contam o mesmo atraso não podem
// discordar em um dia. O RECORTE (obra, fornecedor, situação) mora em `usar-filtros-prazos`.
import { useEffect, useState } from "react";
import { Loader2, AlertCircle, Package, CalendarClock, ChevronRight, Mail } from "lucide-react";
import { rotuloSituacao } from "@/lib/painel-prazos-rm";
import { usarFiltrosPrazos } from "./usar-filtros-prazos";
import CartaoRM from "./CartaoRM";
import BarraFiltros from "./BarraFiltros";
import BotaoSincronizar from "./BotaoSincronizar";
import ModalCobrarAtrasados from "./ModalCobrarAtrasados";
import { usarPodeAgir } from "./usar-pode-agir";

/** O que dizer quando o recorte atual não deixou nada na tela. */
function textoVazio({ filtro, obra, fornecedor, fornecedores }) {
  // ⚠ Com obra escolhida o vazio diz QUAL obra: "nenhuma RM atrasada" sem dizer onde faz parecer
  // que o portal inteiro está em dia.
  const onde = [
    obra ? ` na OP-${String(obra).padStart(3, "0")}` : "",
    // ⚠ o NOME, não a chave: `fornecedor` guarda `cnpj:45987062`, que não diz nada a quem está
    // lendo a tela vazia.
    fornecedor ? ` com pedido de ${fornecedores.find((f) => f.chave === fornecedor)?.nome || "esse fornecedor"}` : "",
  ].join("");
  if (filtro === "PENDENTES") return `Nenhuma RM${onde} esperando entrega — o que foi pedido já chegou ou foi encerrado no Omie.`;
  if (filtro === "TODAS") return `Nenhuma RM${onde} com pedido gerado ainda.`;
  return `Nenhuma RM${onde} em "${rotuloSituacao(filtro)}".`;
}

export default function PrazosRMClient() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [cobrando, setCobrando] = useState(false);
  const podeAgir = usarPodeAgir();
  const f = usarFiltrosPrazos(dados);

  // ⚠⚠ `silencioso` existe para o botão Sincronizar e para a cobrança. Recarregando com o spinner
  // de página inteira, a tela se apagaria no fim de uma espera de um minuto — e a pessoa perderia
  // de vista justamente a linha que foi conferir. Aqui os dados são trocados por baixo.
  const buscar = async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    setErro("");
    try {
      const r = await fetch("/api/compras/prazos-rm");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Não foi possível carregar.");
      setDados(j);
    } catch (e) {
      // ⚠ Recarregar em silêncio que falha não pode apagar a tela que está lá: o dado antigo ainda
      // é o melhor que temos, e quem disparou já mostra o erro dele.
      if (!silencioso) setErro(e.message);
    } finally {
      if (!silencioso) setCarregando(false);
    }
  };
  useEffect(() => { buscar(); }, []);

  if (carregando) {
    return <p className="py-16 text-center text-sm text-torg-gray inline-flex items-center gap-2 justify-center w-full"><Loader2 size={16} className="animate-spin" /> Carregando os prazos…</p>;
  }
  if (erro) {
    return (
      <div className="py-16 text-center">
        <AlertCircle size={28} className="mx-auto text-red-400" />
        <p className="mt-2 text-sm text-red-700">{erro}</p>
        <button onClick={() => buscar()} className="mt-3 px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">Tentar novamente</button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-torg-dark flex items-center gap-2"><CalendarClock size={22} /> Prazos das RMs</h1>
          <p className="text-sm text-torg-gray mt-0.5">
            Todas as RMs com pedido no Omie, seus pedidos e o prazo de cada um. O que aperta vem primeiro.
          </p>
        </div>
        {/* ⚠ No cabeçalho, e não na barra de filtros: filtro muda o que você VÊ; sincronizar e
            cobrar mudam o MUNDO (o que o portal sabe, e a caixa de entrada do fornecedor). Entre
            os chips, pareceriam mais dois recortes da lista. */}
        {/* ⚠⚠ QUEM SÓ VÊ NÃO RECEBE OS BOTÕES. O Almoxarifado entra aqui para acompanhar a chegada
            do material; sincronizar bate no Omie (trava compartilhada com os crons) e cobrar manda
            e-mail para fornecedor. As rotas já recusam — deixar os botões à vista só entregaria um
            403 sem explicação a quem não fez nada de errado. */}
        {podeAgir && (
          <div className="flex flex-col sm:flex-row sm:items-start gap-2">
            {/* ⚠⚠ ABRE UM MODAL, NÃO DISPARA NADA. O botão que manda e-mail para gente de fora não
                pode ser o mesmo clique que escolhe para quem — e-mail não tem desfazer. */}
            <button type="button" onClick={() => setCobrando(true)}
              title="Enviar um e-mail para cada fornecedor com pedido vencido, perguntando a previsão"
              className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 bg-white text-torg-dark hover:bg-gray-50">
              <Mail size={15} /> Cobrar atrasados
            </button>
            <BotaoSincronizar onPronto={() => buscar(true)} />
          </div>
        )}
      </div>

      <BarraFiltros r={f.resumo} obras={f.obras} obra={f.obra} setObra={f.setObra}
        fornecedores={f.fornecedores} fornecedor={f.fornecedor} setFornecedor={f.setFornecedor}
        filtro={f.filtro} setFiltro={f.setFiltro} />

      {/* ⚠ Recarrega em silêncio depois de cobrar: a cobrança não muda prazo nenhum agora, mas o
          fornecedor pode responder pelo link em minutos, e a tela velha ao lado de um "enviado"
          faz duvidar de que algo aconteceu. */}
      {cobrando && (
        <ModalCobrarAtrasados onFechar={() => setCobrando(false)} onEnviado={() => buscar(true)} />
      )}

      {f.visiveis.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-xl border border-gray-100">
          <Package size={28} className="mx-auto text-gray-300" />
          <p className="mt-2 text-sm text-torg-gray">{textoVazio(f)}</p>
          {(f.filtro !== "TODAS" || f.obra || f.fornecedor) && (
            <button onClick={f.limpar} className="mt-3 text-sm text-torg-blue hover:underline inline-flex items-center gap-1">
              ver todas <ChevronRight size={13} />
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {f.visiveis.map((l) => <CartaoRM key={l.rmId || l.numero} l={l} onDecidido={() => buscar(true)} />)}
        </div>
      )}
    </div>
  );
}
