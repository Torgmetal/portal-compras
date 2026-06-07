"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Loader2, AlertCircle, RefreshCw, ChevronDown, ChevronRight,
  FileText, Package, Truck, Search, ExternalLink, Download,
  Weight, Hash, Box,
} from "lucide-react";

const fmtKg = (v) =>
  v != null ? `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg` : "—";
const fmtData = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
};

export default function RomaneiosSharepoint({ ops }) {
  const [opSelecionada, setOpSelecionada] = useState("");
  const [busca, setBusca] = useState("");
  const [romaneios, setRomaneios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [expandedNum, setExpandedNum] = useState(null);
  const [detalhe, setDetalhe] = useState(null);
  const [erroDetalhe, setErroDetalhe] = useState("");
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);

  const carregarRomaneios = useCallback(async (opNumero) => {
    if (!opNumero) { setRomaneios([]); return; }
    setLoading(true);
    setErro("");
    setExpandedNum(null);
    setDetalhe(null);
    try {
      const res = await fetch(`/api/romaneios/sharepoint?op=${encodeURIComponent(opNumero)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao carregar");
      setRomaneios(data.romaneios || []);
    } catch (e) {
      setErro(e.message);
      setRomaneios([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const expandir = async (rom) => {
    if (expandedNum === rom.numero) {
      setExpandedNum(null);
      setDetalhe(null);
      setErroDetalhe("");
      return;
    }
    setExpandedNum(rom.numero);
    setErroDetalhe("");
    if (!rom.xlsm) { setDetalhe(null); return; }
    setLoadingDetalhe(true);
    try {
      const res = await fetch(`/api/romaneios/sharepoint?op=${encodeURIComponent(opSelecionada)}&arquivo=${encodeURIComponent(rom.xlsm.name)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao carregar detalhe");
      setDetalhe(data);
    } catch (e) {
      setDetalhe(null);
      setErroDetalhe(e.message || "Erro desconhecido ao ler romaneio");
    } finally {
      setLoadingDetalhe(false);
    }
  };

  // Filtrar OPs pela busca
  const opsFiltradas = ops.filter((op) => {
    if (!busca) return true;
    const q = busca.toLowerCase();
    return op.numero.toLowerCase().includes(q) || op.cliente?.toLowerCase().includes(q) || op.obra?.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      {/* Seletor de OP */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 shrink-0">
            <Package size={16} className="text-torg-blue" />
            <span className="text-sm font-semibold text-torg-dark">Selecionar OP</span>
          </div>
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por número, cliente ou obra..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue"
            />
          </div>
          <select
            value={opSelecionada}
            onChange={(e) => { setOpSelecionada(e.target.value); carregarRomaneios(e.target.value); }}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue max-w-xs"
          >
            <option value="">— Selecione uma OP —</option>
            {opsFiltradas.map((op) => (
              <option key={op.id} value={op.numero}>
                OP {op.numero} — {op.cliente}{op.obra ? ` — ${op.obra}` : ""}
              </option>
            ))}
          </select>
          {opSelecionada && (
            <button
              onClick={() => carregarRomaneios(opSelecionada)}
              className="p-2 text-torg-gray hover:text-torg-blue rounded-lg hover:bg-gray-100"
              title="Recarregar"
            >
              <RefreshCw size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-torg-blue" />
          <span className="ml-3 text-sm text-torg-gray">Buscando romaneios no SharePoint...</span>
        </div>
      )}

      {/* Erro */}
      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <AlertCircle size={16} />
          {erro}
        </div>
      )}

      {/* Estado vazio */}
      {!loading && !erro && opSelecionada && romaneios.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <FileText size={36} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-torg-gray">Nenhum romaneio encontrado para OP {opSelecionada}.</p>
          <p className="text-xs text-torg-gray mt-1">Verifique se a pasta 4.2 Romaneios existe no SharePoint.</p>
        </div>
      )}

      {/* Sem OP selecionada */}
      {!opSelecionada && !loading && (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <Truck size={36} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-torg-gray">Selecione uma OP para ver os romaneios do SharePoint.</p>
        </div>
      )}

      {/* Lista de romaneios */}
      {!loading && romaneios.length > 0 && (
        <div className="space-y-2">
          {romaneios.map((rom) => (
            <RomaneioCard
              key={rom.numero}
              rom={rom}
              expanded={expandedNum === rom.numero}
              onToggle={() => expandir(rom)}
              detalhe={expandedNum === rom.numero ? detalhe : null}
              erroDetalhe={expandedNum === rom.numero ? erroDetalhe : ""}
              loadingDetalhe={expandedNum === rom.numero && loadingDetalhe}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RomaneioCard({ rom, expanded, onToggle, detalhe, erroDetalhe, loadingDetalhe }) {
  const modified = rom.xlsm?.modified || rom.pdf?.modified;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <button onClick={onToggle} className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50/50 transition-colors flex-wrap gap-2">
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown size={14} className="text-torg-gray" /> : <ChevronRight size={14} className="text-torg-gray" />}
          <span className="text-sm font-bold text-torg-blue font-mono">Romaneio {rom.numero.padStart(2, "0")}</span>
          <span className="text-xs text-torg-gray">{fmtData(modified)}</span>
        </div>
        <div className="flex items-center gap-2">
          {rom.pdf && (
            <a
              href={rom.pdf.webUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="px-2 py-0.5 text-[10px] font-medium text-red-600 bg-red-50 border border-red-200 rounded flex items-center gap-1 hover:bg-red-100"
              title="Abrir PDF"
            >
              <FileText size={10} /> PDF
            </a>
          )}
          {rom.xlsm && (
            <a
              href={rom.xlsm.webUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="px-2 py-0.5 text-[10px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded flex items-center gap-1 hover:bg-emerald-100"
              title="Abrir Excel"
            >
              <Download size={10} /> XLSM
            </a>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100">
          {loadingDetalhe ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={18} className="animate-spin text-torg-blue" />
              <span className="ml-2 text-sm text-torg-gray">Lendo romaneio...</span>
            </div>
          ) : detalhe ? (
            <RomaneioDetalhe data={detalhe} />
          ) : erroDetalhe ? (
            <div className="py-6 text-center">
              <AlertCircle size={20} className="mx-auto text-red-400 mb-2" />
              <p className="text-sm text-red-600 font-medium">Erro ao ler romaneio</p>
              <p className="text-xs text-red-500 mt-1">{erroDetalhe}</p>
            </div>
          ) : (
            <div className="py-6 text-center text-sm text-torg-gray">
              {rom.xlsm ? "Clique para carregar os dados do romaneio." : "Apenas PDF disponível — sem dados para extrair."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RomaneioDetalhe({ data }) {
  const { cabecalho, itens, pesoTotal, qtdTotal, totalMarcas } = data;
  const [filtro, setFiltro] = useState("");

  const itensFiltrados = itens.filter((i) => {
    if (!filtro) return true;
    const q = filtro.toLowerCase();
    return i.marca.toLowerCase().includes(q) || i.descricao.toLowerCase().includes(q);
  });

  return (
    <div className="p-4 space-y-4">
      {/* Cabeçalho do romaneio */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <InfoCard icon={Hash} label="Romaneio" value={cabecalho.numeroRomaneio || "—"} />
        <InfoCard icon={Package} label="OP" value={cabecalho.op || "—"} />
        <InfoCard
          icon={Weight}
          label="Peso total"
          value={fmtKg(pesoTotal)}
          highlight
        />
        <InfoCard icon={Box} label="Marcas / Peças" value={`${totalMarcas} marcas · ${qtdTotal} pçs`} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
        <div className="min-w-0">
          <span className="text-torg-gray">Cliente:</span>{" "}
          <span className="font-medium text-torg-dark truncate block" title={cabecalho.cliente || ""}>{cabecalho.cliente || "—"}</span>
        </div>
        <div className="min-w-0">
          <span className="text-torg-gray">Data saída:</span>{" "}
          <span className="font-medium text-torg-dark">{fmtData(cabecalho.dataSaida)}</span>
        </div>
        <div className="min-w-0">
          <span className="text-torg-gray">Transportador:</span>{" "}
          <span className="font-medium text-torg-dark truncate block" title={cabecalho.transportador || ""}>{cabecalho.transportador || "—"}</span>
        </div>
      </div>

      {/* Filtro de itens */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Filtrar marca ou descrição..."
            className="w-full pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue"
          />
        </div>
        <span className="text-[10px] text-torg-gray">
          {itensFiltrados.length} de {itens.length} itens
        </span>
      </div>

      {/* Tabela de itens */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[600px]">
          <thead>
            <tr className="bg-gray-50/60 text-torg-gray">
              <th className="text-left px-2 py-1.5 font-medium">Vol.</th>
              <th className="text-left px-2 py-1.5 font-medium">Marca</th>
              <th className="text-right px-2 py-1.5 font-medium">Qtd</th>
              <th className="text-left px-2 py-1.5 font-medium">Un</th>
              <th className="text-left px-2 py-1.5 font-medium">Descrição</th>
              <th className="text-left px-2 py-1.5 font-medium">Amarrado</th>
              <th className="text-right px-2 py-1.5 font-medium">Peso (kg)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {itensFiltrados.map((item, i) => (
              <tr key={i} className="hover:bg-gray-50/50">
                <td className="px-2 py-1.5 text-torg-gray">{item.volume || "—"}</td>
                <td className="px-2 py-1.5 font-mono font-medium text-torg-blue">{item.marca}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{item.qtd}</td>
                <td className="px-2 py-1.5 text-torg-gray">{item.unidade}</td>
                <td className="px-2 py-1.5 text-torg-dark max-w-[200px] truncate" title={item.descricao}>{item.descricao || "—"}</td>
                <td className="px-2 py-1.5 text-torg-gray">{item.amarrado || "—"}</td>
                <td className="px-2 py-1.5 text-right tabular-nums font-medium">{fmtKg(item.pesoKg)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 font-semibold">
              <td colSpan={2} className="px-2 py-2 text-torg-dark">Total</td>
              <td className="px-2 py-2 text-right tabular-nums">{qtdTotal}</td>
              <td colSpan={3}></td>
              <td className="px-2 py-2 text-right tabular-nums text-torg-blue">{fmtKg(pesoTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function InfoCard({ icon: Icon, label, value, highlight }) {
  return (
    <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
      <div className="flex items-center gap-1.5">
        <Icon size={12} className="text-torg-gray" />
        <span className="text-[10px] text-torg-gray">{label}</span>
      </div>
      <p className={`text-sm font-bold mt-0.5 whitespace-nowrap ${highlight ? "text-torg-blue" : "text-torg-dark"}`}>{value}</p>
    </div>
  );
}
