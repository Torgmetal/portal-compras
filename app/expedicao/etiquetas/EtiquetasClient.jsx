"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, Loader2, Printer, Search, Tag } from "lucide-react";
import { useFiltroColunas, ThFiltro } from "@/components/FiltroColuna";
import { lerJson } from "@/lib/ler-json";
import ModeloEtiqueta from "./ModeloEtiqueta";

// ETIQUETAS DE CARREGAMENTO — a aba que substitui o BarTender.
//
// Matheus (08/09/2026): "hoje é feito essa emissão utilizando o software BarTender e importamos
// uma planilha com as Marcas e quantidades de cada peça".
//
// ⚠ NÃO TEM CAMPO DE PLANILHA, E É O PONTO DA TELA. Marca, descrição, quantidade e peso já estão
// no portal; escolher a OP já é escolher os dados. O que a planilha fazia era só atravessar a
// informação de um sistema que enxerga o banco para outro que não enxerga.
//
// ⚠ O PDF ABRE EM ABA NOVA em vez de baixar: quem imprime etiqueta imprime de novo em seguida
// (faltou uma, descolou, borrou), e reaproveitar a aba aberta é um clique em vez de quatro.

/** "05/09 14:20" — dia e hora bastam; o ano não ajuda a decidir se reimprime. */
const quando = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(+d)
    ? null
    : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

const nkg = (n) =>
  Number(n) > 0 ? Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";

function BarraSelecao({ busca, setBusca, visiveis, sel, totalEtiquetas, marcarVisiveis, limpar, imprimir, gerando, filtrosAtivos }) {
  return (
    <div className="flex flex-wrap items-center gap-3 p-3 border-b border-gray-100 bg-gray-50/60">
      <div className="relative flex-1 min-w-[220px]">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-torg-gray" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Filtrar por marca ou descrição"
          className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-1.5 text-sm" />
      </div>
      <button onClick={marcarVisiveis} className="text-[13px] font-semibold text-torg-blue hover:underline">
        Marcar {busca ? "os filtrados" : "todas"} ({visiveis.length})
      </button>
      {/* ⚠ HABILITADO TAMBÉM COM FUNIL ATIVO E NADA MARCADO. Antes olhava só a seleção, e aí quem
          filtrasse uma coluna encontrava um "Limpar" apagado — morto justamente na hora em que ele
          é mais necessário, porque é o filtro que está escondendo marca da tela. */}
      <button onClick={limpar} disabled={!sel.size && !filtrosAtivos}
        className="text-[13px] text-torg-gray hover:underline disabled:opacity-40">Limpar</button>
      <div className="ml-auto flex items-center gap-3">
        {/* Quantas ETIQUETAS, não quantas marcas: é o número que decide se o rolo aguenta. */}
        <span className="text-[13px] text-torg-gray">
          <b className="text-torg-dark">{sel.size}</b> marca(s) ·{" "}
          <b className="text-torg-dark">{totalEtiquetas}</b> etiqueta(s)
        </span>
        <button onClick={imprimir} disabled={!sel.size || gerando}
          className="bg-torg-blue text-white text-sm font-semibold rounded-lg px-4 py-2 flex items-center gap-2 disabled:opacity-40">
          {gerando ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}
          {gerando ? "Gerando…" : "Gerar etiquetas"}
        </button>
      </div>
    </div>
  );
}

/**
 * Se a etiqueta desta marca já saiu, e quando.
 *
 * ⚠ Matheus (08/09/2026): "deixar uma coluna na lista no portal mostrando quais etiquetas já foram
 * impressas". O "×2" não é enfeite: reimpressão é rotina (descolou, borrou), mas reimprimir SEM
 * saber que já tinha saído é como a peça sai do pátio com dois adesivos diferentes.
 */
function Impressa({ peca }) {
  const em = quando(peca.impressaEm);
  if (!em) return <span className="text-gray-300">—</span>;
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-emerald-700 whitespace-nowrap">
      <Check size={13} className="shrink-0" />
      {em}
      {peca.impressoes > 1 && <b className="text-torg-gray">×{peca.impressoes}</b>}
    </span>
  );
}

// Os funis do cabeçalho. Matheus (08/09/2026): "no cabeçalho coloque os filtros igual fizemos
// anteriormente tipo excel" — é o `components/FiltroColuna`, o mesmo das Listas de Expedição e da
// consulta do Comercial, e não mais um filtro inventado só para esta tela.
//
// ⚠ Peças e Peso ficam SEM funil de propósito: são números contínuos, e uma lista de 200 valores
// distintos não é filtro, é ruído. Para eles vale a busca por texto que já está na barra.
export const COLUNAS_ETIQUETA = [
  { key: "marca", label: "Marca", valor: (p) => p.marca || "—" },
  { key: "descricao", label: "Descrição", valor: (p) => p.descricao || "—" },
  // ⚠ O QUE FILTRA É "JÁ SAIU OU NÃO", não a data. Filtrar por "08/09 14:20" separaria duas
  // impressões do mesmo lote; quem abre este funil quer as que faltam imprimir.
  { key: "impressa", label: "Etiqueta", valor: (p) => (p.impressaEm ? "Já impressa" : "Não impressa") },
];

function TabelaMarcas({ visiveis, sel, alterna, busca, fp }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]" style={{ minWidth: 640 }}>
        <thead className="bg-gray-50/60 text-[11px] uppercase text-torg-gray">
          <tr>
            <th className="w-10 px-3 py-2"></th>
            <ThFiltro col="marca" label="Marca" className="text-left px-2 py-2" {...fp} />
            <ThFiltro col="descricao" label="Descrição" className="text-left px-2 py-2" {...fp} />
            <th className="text-right px-2 py-2">Peças</th>
            <th className="text-right px-2 py-2">Peso unit. (kg)</th>
            <ThFiltro col="impressa" label="Etiqueta" className="text-left px-4 py-2" {...fp} />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {visiveis.map((p) => (
            <tr key={p.id} onClick={() => alterna(p.marca)}
              className={`cursor-pointer ${sel.has(p.marca) ? "bg-torg-blue-50/50" : "hover:bg-gray-50/60"}`}>
              <td className="px-3 py-2">
                <input type="checkbox" readOnly checked={sel.has(p.marca)} className="pointer-events-none" />
              </td>
              <td className="px-2 py-2 font-bold text-torg-dark">{p.marca}</td>
              <td className="px-2 py-2 text-torg-gray">{p.descricao || "—"}</td>
              <td className="px-2 py-2 text-right tabular-nums">{Math.max(1, p.qte || 1)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{nkg(p.pesoUnitKg)}</td>
              <td className="px-4 py-2"><Impressa peca={p} /></td>
            </tr>
          ))}
          {!visiveis.length && (
            <tr><td colSpan={6} className="px-4 py-10 text-center text-torg-gray">
              {busca
                ? <>Nenhuma marca bate com &quot;{busca}&quot;.</>
                : "Nenhuma marca passa pelos filtros do cabeçalho."}
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * O que a tabela mostra: a busca por texto e, depois dela, os funis do cabeçalho.
 *
 * ⚠ A ORDEM IMPORTA. Os funis leem a lista JÁ buscada, então as opções de cada um são as do que
 * está escrito na busca — filtrar "VIGA" e abrir o funil de Marca oferece só as vigas. Ao
 * contrário, o funil ofereceria marcas que a tela não está mostrando.
 */
function useListaFiltrada(pecas, busca) {
  const [colAberta, setColAberta] = useState(null);
  const buscadas = useMemo(() => {
    const q = busca.trim().toUpperCase();
    if (!q) return pecas;
    return pecas.filter((p) =>
      p.marca.toUpperCase().includes(q) || String(p.descricao || "").toUpperCase().includes(q));
  }, [pecas, busca]);

  const f = useFiltroColunas(buscadas, COLUNAS_ETIQUETA);
  return {
    visiveis: f.filtradas,
    limparFiltros: f.limpar,
    filtrosAtivos: f.ativos,
    fp: { filtros: f.filtros, setFiltros: f.setFiltros, opcoesDaColuna: f.opcoesDaColuna,
          aberta: colAberta, setAberta: setColAberta },
  };
}

/** As obras que têm item expedível — carregadas uma vez, quando a tela abre. */
function useOps(setErro) {
  const [ops, setOps] = useState([]);
  const [carregandoOps, setCarregandoOps] = useState(true);
  useEffect(() => {
    (async () => {
      try {
        const j = await lerJson(await fetch("/api/expedicao/etiquetas", { cache: "no-store" }), "Lista de OPs");
        setOps(j.ops || []);
      } catch (e) { setErro(e.message); } finally { setCarregandoOps(false); }
    })();
  }, [setErro]);
  return { ops, carregandoOps };
}

export default function EtiquetasClient() {
  const [opId, setOpId] = useState("");
  const [dados, setDados] = useState(null);
  const [sel, setSel] = useState(() => new Set());
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");
  // ⚠ O modelo NÃO volta ao padrão ao trocar de obra: quem imprime para um cliente costuma
  // imprimir várias OPs dele seguidas, e voltar sozinho faria a etiqueta errada sair sem aviso.
  const [modelo, setModelo] = useState("padrao");
  const { ops, carregandoOps } = useOps(setErro);

  const buscarPecas = useCallback(async (id) => lerJson(
    await fetch(`/api/expedicao/etiquetas?opId=${encodeURIComponent(id)}`, { cache: "no-store" }),
    "Peças da OP"), []);

  const abrirOp = useCallback(async (id) => {
    setOpId(id); setDados(null); setSel(new Set()); setBusca(""); setErro("");
    if (!id) return;
    setCarregando(true);
    try { setDados(await buscarPecas(id)); }
    catch (e) { setErro(e.message); } finally { setCarregando(false); }
  }, [buscarPecas]);

  const pecas = dados?.pecas || [];
  const { visiveis, fp, limparFiltros, filtrosAtivos } = useListaFiltrada(pecas, busca);

  // Quantas ETIQUETAS, não quantas marcas: é o número que decide se o rolo aguenta.
  const totalEtiquetas = useMemo(
    () => pecas.filter((p) => sel.has(p.marca)).reduce((s, p) => s + Math.max(1, p.qte || 1), 0),
    [pecas, sel]);

  const alterna = (marca) => setSel((prev) => {
    const n = new Set(prev);
    if (n.has(marca)) n.delete(marca); else n.add(marca);
    return n;
  });
  const marcarVisiveis = () => setSel((prev) => new Set([...prev, ...visiveis.map((p) => p.marca)]));
  // "Limpar" limpa TUDO o que restringe a tela — seleção e funis. Deixar um funil ativo depois de
  // limpar é a forma clássica de alguém jurar que a marca sumiu do portal.
  const limpar = () => { setSel(new Set()); limparFiltros(); };

  const imprimir = async () => {
    if (!sel.size) return;
    setGerando(true); setErro("");
    try {
      const r = await fetch("/api/expedicao/etiquetas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opId, marcas: [...sel], modelo }),
      });
      if (!r.ok) {
        const bruto = await r.text().catch(() => "");
        let msg = `Erro ${r.status}`;
        try { msg = JSON.parse(bruto).error || msg; } catch { /* corpo não-JSON: fica o status */ }
        throw new Error(msg);
      }
      const url = URL.createObjectURL(await r.blob());
      window.open(url, "_blank", "noopener");
      // Revogar na hora fecharia o PDF antes de a aba lê-lo.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      // Recarrega só os dados — a coluna "Etiqueta" tem que refletir o que acabou de sair, e o
      // filtro e a seleção continuam onde estavam (quem imprime costuma imprimir de novo).
      const atualizado = await buscarPecas(opId).catch(() => null);
      if (atualizado) setDados(atualizado);
    } catch (e) { setErro(e.message); } finally { setGerando(false); }
  };

  return (
    <div className="max-w-6xl">
      <div className="flex items-start gap-3 mb-1">
        <Tag className="text-torg-orange mt-1" size={26} />
        <div>
          <h1 className="text-2xl font-bold text-torg-dark">Etiquetas de carregamento</h1>
          <p className="text-torg-gray text-sm">
            Escolha a obra e as marcas. Sai uma etiqueta por peça, de 100×50&nbsp;mm, pronta para a Argox.
            <br />
            Aparecem só os itens da <b>Lista de Expedição</b> — as posições de fábrica não levam etiqueta.
          </p>
        </div>
      </div>

      <div className="bg-torg-blue-50/60 border border-torg-blue-100 rounded-xl px-4 py-3 text-[12.5px] text-torg-dark mb-5 mt-4">
        <b>Antes de imprimir</b>, no diálogo do navegador: impressora <b>Argox OS-214 plus</b>,
        <b> Tamanho do papel: USER</b>, <b>Escala: Padrão</b> (nunca &quot;ajustar à área de
        impressão&quot;) e margens <b>nenhuma</b>. A página do PDF já tem o tamanho exato da etiqueta.
        <br />
        {/* ⚠⚠ A LISTA DE PAPEL DO DRIVER ESTÁ EM POLEGADAS, E É POR ISSO QUE NADA CASA. Matheus,
            10/09/2026: a etiqueta saiu deitada e esticada por três etiquetas do rolo. O diálogo
            estava em "4 x 6" — que são 4 × 6 POLEGADAS (101,6 × 152,4 mm, em pé). A nossa etiqueta
            de 100 × 50 mm são 3,94 × 1,97 pol, ou seja "4 x 2", e ESSE TAMANHO NÃO EXISTE na lista
            do driver (2x1, 2x4, 2.25x1.25, 2.50x0.50, 4x1, 4x3, 4x4, 4x5, 4x6). Sobra o USER, que
            precisa ser definido uma vez nas preferências da impressora.

            ⚠ Um aviso anterior mandava procurar "100 × 50 mm" na lista. Nunca ia aparecer — a lista
            é em polegadas e não tem tamanho equivalente. Instrução que manda procurar o que não
            existe é pior que instrução nenhuma: faz quem está imprimindo achar que errou. */}
        <span className="block mt-1.5 text-torg-gray">
          <b>Saiu deitada, ocupando várias etiquetas?</b> Não é o PDF — é o tamanho do papel. A lista
          do driver está em <b>polegadas</b>: &quot;4 x 6&quot; são 4 × 6 pol (101,6 × 152,4 mm, em
          pé), e o navegador gira a etiqueta deitada para caber nesse papel. Os 100 × 50 mm da
          etiqueta equivalem a <b>4 × 2 pol</b>, que <b>não existe na lista</b> — por isso se usa o
          <b> USER</b>. Defina-o uma vez em <i>Painel de Controle → Dispositivos e Impressoras →
          Argox → Preferências de impressão</i> como <b>100 mm de largura × 50 mm de altura</b>,
          depois <b>recarregue esta página</b> (o diálogo só lê a lista ao abrir).
        </span>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5 flex items-start gap-2 text-red-700">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <div className="flex-1 text-sm">{erro}</div>
          <button onClick={() => { setErro(""); if (opId) abrirOp(opId); }}
            className="text-sm font-semibold underline shrink-0">Tentar novamente</button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-5">
        <label className="block text-[11px] font-bold uppercase tracking-wide text-torg-gray mb-1.5">Obra</label>
        {/* ⚠ Matheus (08/09/2026): "somente os produtos finais igual sai na Lista de Expedição". */}
        {carregandoOps ? (
          <div className="flex items-center gap-2 text-torg-gray text-sm py-2">
            <Loader2 size={16} className="animate-spin" /> Carregando as OPs…
          </div>
        ) : (
          <select value={opId} onChange={(e) => abrirOp(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">Selecione a OP…</option>
            {ops.map((o) => (
              <option key={o.id} value={o.id}>
                OP-{o.numero} · {o.cliente}{o.obra ? ` — ${o.obra}` : ""} ({o.marcas} marcas)
              </option>
            ))}
          </select>
        )}
      </div>

      {opId && <ModeloEtiqueta opId={opId} modelo={modelo} setModelo={setModelo} />}

      {carregando && (
        <div className="flex items-center justify-center py-16 gap-3 text-torg-gray">
          <Loader2 size={22} className="animate-spin" /> Carregando as peças…
        </div>
      )}

      {dados && !carregando && (
        pecas.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center text-torg-gray">
            <Tag size={30} className="mx-auto mb-3 opacity-40" />
            <div className="font-semibold text-torg-dark mb-1">Nada a etiquetar nesta obra</div>
            Nenhuma marca desta OP está na Lista de Expedição — só o que se expede leva etiqueta.
            Se a obra já tem LE, importe-a antes (Produção › Peças, ou a sincronização do SharePoint).
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <BarraSelecao
              busca={busca} setBusca={setBusca}
              visiveis={visiveis} sel={sel} totalEtiquetas={totalEtiquetas}
              marcarVisiveis={marcarVisiveis} limpar={limpar} filtrosAtivos={filtrosAtivos}
              imprimir={imprimir} gerando={gerando}
            />
            <TabelaMarcas visiveis={visiveis} sel={sel} alterna={alterna} busca={busca} fp={fp} />
          </div>
        )
      )}
    </div>
  );
}
