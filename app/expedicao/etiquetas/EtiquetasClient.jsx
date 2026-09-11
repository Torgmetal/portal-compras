"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2, Tag } from "lucide-react";
import { useFiltroColunas } from "@/components/FiltroColuna";
import { lerJson } from "@/lib/ler-json";
import ModeloEtiqueta from "./ModeloEtiqueta";
import AvisoImpressao from "./AvisoImpressao";
import BarraSelecao from "./BarraSelecao";
import TabelaMarcas, { COLUNAS_ETIQUETA } from "./TabelaMarcas";
import Calibragem from "./Calibragem";

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


/**
 * Se a etiqueta desta marca já saiu, e quando.
 *
 * ⚠ Matheus (08/09/2026): "deixar uma coluna na lista no portal mostrando quais etiquetas já foram
 * impressas". O "×2" não é enfeite: reimpressão é rotina (descolou, borrou), mas reimprimir SEM
 * saber que já tinha saído é como a peça sai do pátio com dois adesivos diferentes.
 */

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

/**
 * O que a TAG da obra precisa saber do que veio do servidor.
 *
 * ⚠ Fora do componente de propósito: são três encadeamentos opcionais que, inline no JSX, empurram
 * o `EtiquetasClient` para fora do teto de complexidade. Aqui eles são uma função com um nome.
 */
/**
 * O nome do arquivo baixado.
 *
 * ⚠ URL de blob NÃO carrega nome: o `Content-Disposition` que a rota manda é ignorado, e o
 * navegador salva com o UUID do blob. O nome só existe se o `<a download>` disser qual é.
 */
const nomeDoArquivo = (opId, ops) => {
  const op = (ops || []).find((o) => o.id === opId);
  return `etiquetas-OP-${op?.numero || "obra"}.pdf`;
};

/**
 * O que está sendo preparado para imprimir: a TAG digitada e o último PDF gerado.
 *
 * ⚠ Os dois juntos porque são o mesmo assunto e têm o mesmo ciclo de vida — a obra muda, os dois
 * deixam de valer.
 *
 * ⚠⚠ O BLOB FICA VIVO ENQUANTO A TELA ESTIVER ABERTA. Antes era revogado em 60 s, e era isso que
 * quebrava o download: quem abre o PDF, confere as marcas e só então clica em baixar passa fácil de
 * um minuto — aí o link já não existe, e o navegador mostra "verifique a conexão com a Internet"
 * num arquivo com nome de UUID. Não era rede; era o link revogado.
 *
 * ⚠ Mas revoga ao SAIR da tela: blob de 400 etiquetas não é pequeno, e deixá-lo pendurado numa tela
 * que a expedição mantém aberta o dia todo é vazamento de memória com hora marcada.
 */
// ⚠ A TAG DA OBRA ZERA AO TROCAR DE OBRA, ao contrário do modelo da etiqueta. Ela é um código
// DAQUELE embarque: manter a de outra obra na tela carregaria, em centenas de adesivos, um código
// que não é daquela carga. O `abrirOp` repõe a da última impressão da obra nova, se houver.

function usarImpressao() {
  const [tagObra, setTagObra] = useState("");
  const [pdf, setPdf] = useState(null);
  // ⚠ As marcas que vão FECHADAS NUMA CAIXA: uma etiqueta só, dizendo "N/N". Vive aqui junto com a
  // TAG porque tem o mesmo ciclo de vida — trocou de obra, os dois deixam de valer.
  const [emCaixa, setEmCaixa] = useState(new Set());
  const alternarCaixa = (marca) => setEmCaixa((antes) => {
    const novo = new Set(antes);
    if (novo.has(marca)) novo.delete(marca); else novo.add(marca);
    return novo;
  });
  useEffect(() => () => { if (pdf) URL.revokeObjectURL(pdf.url); }, [pdf]);
  return { tagObra, setTagObra, pdf, setPdf, emCaixa, setEmCaixa, alternarCaixa };
}

const daObra = (dados) => ({ obra: dados?.op?.obra || "", tag: dados?.tagObra || "" });

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
  const { tagObra, setTagObra, pdf, setPdf, emCaixa, setEmCaixa, alternarCaixa } = usarImpressao();
  const { ops, carregandoOps } = useOps(setErro);

  const buscarPecas = useCallback(async (id) => lerJson(
    await fetch(`/api/expedicao/etiquetas?opId=${encodeURIComponent(id)}`, { cache: "no-store" }),
    "Peças da OP"), []);

  const abrirOp = useCallback(async (id) => {
    setOpId(id); setDados(null); setSel(new Set()); setBusca(""); setErro(""); setTagObra(""); setEmCaixa(new Set());
    if (!id) return;
    setCarregando(true);
    try {
      const j = await buscarPecas(id);
      setDados(j);
      // Vem preenchida com a da última impressão desta obra — ver `ultimaTagDaObra` na rota. Sem
      // condição: obra que nunca foi impressa devolve vazio, que é exatamente o que deve aparecer.
      setTagObra(daObra(j).tag);
    }
    catch (e) { setErro(e.message); } finally { setCarregando(false); }
  }, [buscarPecas]);

  const pecas = dados?.pecas || [];
  const { visiveis, fp, limparFiltros, filtrosAtivos } = useListaFiltrada(pecas, busca);

  // Quantas ETIQUETAS, não quantas marcas: é o número que decide se o rolo aguenta.
  const totalEtiquetas = useMemo(
    // ⚠ A CAIXA CONTA 1, e é por isso que este número existe: é ele que diz se o rolo aguenta.
    () => pecas.filter((p) => sel.has(p.marca))
      .reduce((s, p) => s + (emCaixa.has(p.marca) ? 1 : Math.max(1, p.qte || 1)), 0),
    [pecas, sel, emCaixa]);

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
        body: JSON.stringify({ opId, marcas: [...sel], modelo, tagObra, emCaixa: [...emCaixa] }),
      });
      if (!r.ok) {
        const bruto = await r.text().catch(() => "");
        let msg = `Erro ${r.status}`;
        try { msg = JSON.parse(bruto).error || msg; } catch { /* corpo não-JSON: fica o status */ }
        throw new Error(msg);
      }
      const url = URL.createObjectURL(await r.blob());
      window.open(url, "_blank", "noopener");
      // ⚠⚠ O BLOB FICA VIVO ENQUANTO A TELA ESTIVER ABERTA. Antes ele era revogado em 60 s, e era
      // isso que quebrava o download: Matheus (11/09/2026) "tento baixar o arquivo que gera das
      // etiquetas mas não baixa". Quem abre o PDF, confere as marcas e só então clica em baixar
      // passa fácil de um minuto — aí o blob já não existe, e o navegador mostra "verifique a
      // conexão com a Internet" num arquivo com nome de UUID. Não era rede; era o link revogado.
      setPdf({ url, nome: nomeDoArquivo(opId, ops) });
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
      <AvisoImpressao />
      <Calibragem />

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

      {opId && <ModeloEtiqueta opId={opId} modelo={modelo} setModelo={setModelo}
                               tagObra={tagObra} setTagObra={setTagObra}
                               sugestao={daObra(dados)} />}

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
              marcarVisiveis={marcarVisiveis} limpar={limpar} filtrosAtivos={filtrosAtivos} pdf={pdf}
              imprimir={imprimir} gerando={gerando}
            />
            <TabelaMarcas visiveis={visiveis} sel={sel} alterna={alterna} busca={busca} fp={fp}
              emCaixa={emCaixa} alternarCaixa={alternarCaixa} />
          </div>
        )
      )}
    </div>
  );
}
