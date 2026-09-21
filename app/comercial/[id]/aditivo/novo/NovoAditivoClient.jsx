"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Loader2, AlertCircle, Hash, Coins, ShoppingCart, CalendarRange, FolderOpen } from "lucide-react";
import CampoData from "@/components/CampoData";
import ItemFormRow, { novoItem } from "@/components/ItemFormRow";
import OrcamentoComercial from "@/components/OrcamentoComercial";
import ReferenciasClienteEditor, { pedidoVazio } from "@/components/comercial/ReferenciasClienteEditor";
import ReceitasAditivoEditor from "@/components/comercial/ReceitasAditivoEditor";
import { itensDaPlanilhaComercial } from "@/lib/op-categorias";
import { linhaReceitaVazia, linhasDaPlanilha, linhasParaEnvio, totalDasLinhas } from "@/lib/receita-aditivo";
import { numeroBR } from "@/lib/numero-br";
import { fmtOP } from "@/lib/utils";

// A abertura do aditivo em PÁGINA, em blocos, na ordem em que o Comercial pensa nele: o pedido do
// cliente → o que vai ser faturado → o que o Compras pode gastar → prazo e o comunicado aos
// setores → proposta e estudo. Vitor (17/09/2026), sobre o modal que existia: "está muito ruim de
// ver essas info" e "onde eu descrevo a receita?". O modal punha a pasta de orçamentos no topo,
// espremia a OC em quatro colunas e não tinha receita — ela nascia sozinha.
//
// ⚠ Sem <form>: o navegador de pastas e as linhas de item têm botões próprios, e um Enter num
// campo não pode criar o aditivo pela metade.
const fmtMoeda = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const campoData = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm";

function Bloco({ n, icone: Icone, titulo, ajuda, children }) {
  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 md:p-6 space-y-4" aria-label={titulo}>
      <header className="flex items-start gap-3">
        <span className="w-8 h-8 rounded-full bg-[#F4801F] text-white font-black flex items-center justify-center shrink-0">{n}</span>
        <div>
          <h3 className="text-base font-bold text-torg-dark flex items-center gap-2">{Icone && <Icone size={16} className="text-torg-gray" />}{titulo}</h3>
          {ajuda && <p className="text-xs text-torg-gray mt-0.5">{ajuda}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

export default function NovoAditivoClient({ op, proximoNumero }) {
  const router = useRouter();
  const [termos, setTermos] = useState(null);
  const [pedido, setPedido] = useState(pedidoVazio());
  const [receitas, setReceitas] = useState([linhaReceitaVazia()]);
  const [itens, setItens] = useState([novoItem()]);
  const [prazo, setPrazo] = useState({ inicio: "", fim: "" });
  const [descricao, setDescricao] = useState("");
  const [orc, setOrc] = useState({ pasta: null, ref: null, propostas: [], estudo: null, dados: null });
  const [mostrarOrc, setMostrarOrc] = useState(false);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    fetch(`/api/comercial/op/${op.id}/referencias`).then((r) => r.json()).then((j) => setTermos(j.termos || null)).catch(() => {});
  }, [op.id]);

  const totalReceita = totalDasLinhas(receitas);
  const totalVerba = itens.reduce((s, it) => s + (Number(it.valorVerba) || 0), 0);
  const valorPedido = numeroBR(pedido.valor);
  const voltar = `/comercial/${op.id}?vista=obra`;

  // proposta/estudo anexados preenchem o que ainda está em branco — nunca por cima do que foi digitado
  const aoAnexar = (v) => {
    setOrc(v);
    if (v.dados) {
      const rec = linhasDaPlanilha(v.dados);
      if (rec.length) setReceitas((prev) => (prev.some((l) => String(l.descricao || "").trim()) ? prev : rec));
      const daPlanilha = itensDaPlanilhaComercial(v.dados?.comercial, v.dados?.custos, v.dados);
      if (daPlanilha.length) setItens((prev) => (prev.some((i) => String(i.descricao || "").trim()) ? prev : daPlanilha));
    }
    const prop = (v.propostas || []).find((p) => p.descricao);
    if (prop?.descricao) setDescricao((d) => d || `Aditivo ${proximoNumero} — ${prop.obra || prop.numeroProposta || ""}\n\n${prop.descricao}`);
  };

  const submit = async () => {
    setErro("");
    const receitasEnvio = linhasParaEnvio(receitas);
    const itensValidos = itens.filter((it) => String(it.descricao || "").trim());
    if (!receitasEnvio.length && !orc.dados && !(valorPedido > 0)) return setErro("Informe a receita do aditivo (descrição, peso e unitário) — ou, no mínimo, o valor do pedido do cliente.");
    if (!descricao.trim()) return setErro("Descreva o que muda com este aditivo — é o texto que vai aos setores no comunicado.");
    if (!itensValidos.length) return setErro("Informe ao menos um item de verba de compras (pode ser uma linha só, com o total).");
    setSalvando(true);
    try {
      const res = await fetch(`/api/comercial/op/${op.id}/aditivo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          descricao: descricao.trim(),
          itens: itensValidos.map((it) => ({ ...it, qtdContratada: Number(it.qtdContratada) || null, meses: Number(it.meses) || null, valorPorMes: Number(it.valorPorMes) || null, valorVerba: Number(it.valorVerba) || 0 })),
          dataInicio: prazo.inicio || null,
          dataFimPrevista: prazo.fim || null,
          orcamentoPasta: orc.pasta, orcamentoRef: orc.ref, propostas: orc.propostas, estudoArquivo: orc.estudo, estudoDados: orc.dados,
          pedido: pedido.codigo?.trim() ? pedido : null,
          receitas: receitasEnvio,
          valor: totalReceita > 0 ? totalReceita : (valorPedido > 0 ? valorPedido : null),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível criar o aditivo.");
      router.push(`/comercial/${op.id}?vista=obra#aditivo-${data.numero}`);
      router.refresh();
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-28">
      <div>
        <Link href={voltar} className="text-sm text-torg-gray hover:text-torg-dark inline-flex items-center gap-1 mb-2"><ArrowLeft size={14} /> Voltar para a obra</Link>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center rounded-lg bg-orange-100 text-[#c2610f] font-black text-xl px-3 py-1 border border-orange-200">ADITIVO {proximoNumero}</span>
          <h2 className="text-2xl font-extrabold text-torg-dark tracking-tight">{fmtOP(op.numero)} · {op.cliente}</h2>
        </div>
        <p className="text-sm text-torg-gray mt-1">{op.obra}{op.refCliente ? ` · ${op.refCliente}` : ""}. O aditivo é um pedido novo do cliente dentro desta obra: tem receita, verba e medição próprias, e é comunicado aos setores depois de criado.</p>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2" role="alert">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> <span>{erro}</span>
        </div>
      )}

      <Bloco n={1} icone={Hash} titulo="Pedido do cliente" ajuda="O documento que o cliente emitiu para este aditivo, nas palavras dele. Uma TAG por linha.">
        <ReferenciasClienteEditor termos={termos} valor={{ pedidos: [pedido] }} onChange={(v) => setPedido(v.pedidos?.[0] || pedidoVazio())} modo="aditivo" />
      </Bloco>

      <Bloco n={2} icone={Coins} titulo="Receita do aditivo" ajuda="O que passa a ser faturado. Digite a descrição, o peso e o unitário — o total sai sozinho. Vira linha de receita da obra e base da medição do aditivo.">
        <ReceitasAditivoEditor linhas={receitas} onChange={setReceitas} valorPedido={valorPedido} />
      </Bloco>

      <Bloco n={3} icone={ShoppingCart} titulo="Verba de compras" ajuda="O que o Compras pode gastar neste aditivo, por categoria — não é a receita. Vai para a aba Resumo, junto com a verba da obra.">
        <div className="flex items-center justify-end gap-3 flex-wrap">
          <button type="button" onClick={() => setItens((p) => [...p, novoItem("MATERIA_PRIMA")])} className="text-xs text-torg-blue hover:text-torg-dark font-medium inline-flex items-center gap-1"><Plus size={12} /> Material</button>
          <button type="button" onClick={() => setItens((p) => [...p, novoItem("ALUGUEL_PLATAFORMA")])} className="text-xs text-torg-orange-700 hover:text-torg-dark font-medium inline-flex items-center gap-1"><Plus size={12} /> Aluguel</button>
          <button type="button" onClick={() => setItens((p) => [...p, novoItem("OUTRO")])} className="text-xs text-torg-gray hover:text-torg-dark font-medium inline-flex items-center gap-1"><Plus size={12} /> Outro</button>
        </div>
        <div className="border border-gray-100 rounded-lg divide-y divide-gray-100">
          {itens.map((it, i) => (
            <ItemFormRow key={i} item={it} onChange={(novo) => setItens((p) => p.map((x, idx) => (idx === i ? novo : x)))} onRemove={() => setItens((p) => p.filter((_, idx) => idx !== i))} canRemove={itens.length > 1} />
          ))}
        </div>
        <p className="text-right text-sm text-torg-gray">Total da verba do aditivo: <span className="font-bold text-torg-orange-700 tabular-nums">{fmtMoeda(totalVerba)}</span></p>
      </Bloco>

      <Bloco n={4} icone={CalendarRange} titulo="Prazo e comunicado aos setores" ajuda="O que muda com este aditivo, do jeito que a fábrica precisa ler. É o texto do comunicado (PDF + aceite) que vai a todos os setores.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg">
          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">Início</label>
            <CampoData value={prazo.inicio} onChange={(iso) => setPrazo((p) => ({ ...p, inicio: iso }))} className={campoData} />
          </div>
          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">Fim previsto</label>
            <CampoData value={prazo.fim} onChange={(iso) => setPrazo((p) => ({ ...p, fim: iso }))} className={campoData} />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-torg-dark mb-1" htmlFor="aditivo-descricao">O que muda com este aditivo</label>
          <textarea id="aditivo-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={5}
            placeholder={`Ex.: Aditivo ${proximoNumero} — inclusão da passarela TC 8011: 233 longarinas e 246 apoios ajustáveis. Pintura no mesmo padrão da obra.`}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue" />
        </div>
      </Bloco>

      <Bloco n={5} icone={FolderOpen} titulo="Proposta e estudo" ajuda="Opcional. Anexe a proposta e a planilha de estudo do aditivo: as linhas de venda preenchem a receita e a verba acima, se ainda estiverem em branco.">
        {mostrarOrc || orc.pasta ? (
          <OrcamentoComercial valor={orc} onChange={aoAnexar} />
        ) : (
          <button type="button" onClick={() => setMostrarOrc(true)} className="text-sm text-torg-blue font-medium inline-flex items-center gap-1 hover:underline"><FolderOpen size={14} /> Abrir a pasta de orçamentos</button>
        )}
      </Bloco>

      <div className="fixed bottom-0 left-64 right-0 bg-white/95 backdrop-blur border-t border-gray-200 px-6 py-3 z-20">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="text-sm text-torg-gray flex gap-4 flex-wrap">
            <span>Receita <b className="text-torg-dark tabular-nums">{fmtMoeda(totalReceita)}</b></span>
            <span>Verba <b className="text-torg-orange-700 tabular-nums">{fmtMoeda(totalVerba)}</b></span>
          </div>
          <div className="flex gap-3">
            <Link href={voltar} className="px-4 py-2 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100 text-sm">Cancelar</Link>
            <button type="button" onClick={submit} disabled={salvando} className="px-5 py-2 bg-[#F4801F] text-white rounded-lg hover:bg-[#dd7119] text-sm font-semibold flex items-center gap-2 disabled:opacity-50">
              {salvando && <Loader2 size={14} className="animate-spin" />} Criar aditivo {proximoNumero}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
