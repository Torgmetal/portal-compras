"use client";
import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fmtOP } from "@/lib/utils";
import {
  ArrowLeft, Loader2, AlertCircle, AlertTriangle, CheckCircle2,
  Trash2, Upload, FileSpreadsheet, X, RailSymbol, Building2, Plus, Search, Package,
  Forklift, Hammer,
} from "lucide-react";
import {
  labelCategoria,
  categoriasUnicasOP,
  CATEGORIAS_MATERIAL,
  CATEGORIAS_SERVICOS_TERCEIRIZADOS,
  CATEGORIAS_ALUGUEL,
  CATEGORIA_OUTRO,
} from "@/lib/op-categorias";
import { parseTekla } from "@/lib/parse-tekla";

const fmtMoeda = (v) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const TIPOS_RM = [
  {
    codigo: "ENGENHARIA",
    label: "Engenharia",
    desc: "Lista do Tekla pra fabricação. Vincula OP e tipo de material do escopo.",
    icon: RailSymbol,
    cor: "torg-blue",
  },
  {
    codigo: "INTERNA",
    label: "Interna Torg",
    desc: "Almoxarifado e demais — sem vínculo a OP.",
    icon: Building2,
    cor: "torg-dark",
  },
  {
    codigo: "ALUGUEL",
    label: "Aluguel de Equipamentos",
    desc: "Diária × dias com OP obrigatória — sem cotação; vira pedido Omie direto no extrato da obra.",
    icon: Forklift,
    cor: "torg-orange",
  },
  {
    codigo: "MONTAGEM",
    label: "Medição de Montagem",
    desc: "Valor informado pelo solicitante — sem cotação; vira pedido Omie direto no extrato da obra.",
    icon: Hammer,
    cor: "torg-blue",
  },
];

export default function NovaRMClient({ ops, userSetor, userModulos = [], userTipo }) {
  const router = useRouter();
  // ALMOXARIFADO sem modulo ENGENHARIA → default INTERNA
  const isAlmoxSemEng = userTipo !== "ADMIN" && userModulos.includes("ALMOXARIFADO") && !userModulos.includes("ENGENHARIA");
  const [tipoRM, setTipoRM] = useState(isAlmoxSemEng ? "INTERNA" : "ENGENHARIA");
  const [opSelecionada, setOpSelecionada] = useState("");
  const [categoriasCobertas, setCategoriasCobertas] = useState([]);
  const [faturamentoDireto, setFaturamentoDireto] = useState(false);
  const [numero, setNumero] = useState("");
  const [descricao, setDescricao] = useState("");
  const [observacao, setObservacao] = useState("");
  const [setor, setSetor] = useState(userSetor);
  const [itensImportados, setItensImportados] = useState([]);
  const [arquivoNome, setArquivoNome] = useState("");
  const [importando, setImportando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [proximoNumInterna, setProximoNumInterna] = useState(""); // preview RI-NNNN
  const fileRef = useRef(null);

  const ehInterna = tipoRM === "INTERNA";
  const ehAluguel = tipoRM === "ALUGUEL";
  const ehMontagem = tipoRM === "MONTAGEM";
  const ehAutoNum = ehInterna || ehAluguel || ehMontagem;

  // Busca o próximo número sequencial quando muda para Interna ou Aluguel
  useEffect(() => {
    if (!ehAutoNum) return;
    let ativo = true;
    const tipo = ehAluguel ? "ALUGUEL" : ehMontagem ? "MONTAGEM" : "INTERNA";
    fetch(`/api/rm/proximo-numero?tipo=${tipo}`)
      .then((r) => r.json())
      .then((d) => { if (ativo && d.numero) setProximoNumInterna(d.numero); })
      .catch(() => {});
    return () => { ativo = false; };
  }, [ehAutoNum, ehAluguel, ehMontagem]);

  // Adiciona um produto do Omie como item manual da RM
  const adicionarProdutoOmie = (p) => {
    setItensImportados((prev) => [
      ...prev,
      {
        descricao: p.descricao, codigo: p.codigo, codigoOmieEstoque: p.codigo,
        material: "", qtd: 1, unidade: p.unidade || "UN", peso: 0, comprimento: "", manual: true,
      },
    ]);
  };

  // Anexos (desenhos, especificacoes, etc) — uploaded ao Vercel Blob.
  // Quando a RM e criada, vinculamos via metadados no payload do POST /api/rm.
  // Cada item: { url, nomeArquivo, tamanho, tipo, _uploadingId? }
  const [anexos, setAnexos] = useState([]);
  const [anexosUploading, setAnexosUploading] = useState([]); // ids temp
  const [erroAnexo, setErroAnexo] = useState("");
  const anexoFileRef = useRef(null);

  const fmtBytes = (n) => {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  };

  const uploadAnexos = async (files) => {
    if (!files || files.length === 0) return;
    setErroAnexo("");
    for (const file of files) {
      const tempId = Math.random().toString(36).slice(2);
      setAnexosUploading((p) => [...p, tempId]);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload-blob", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Falha no upload");
        setAnexos((p) => [...p, {
          url: data.url,
          nomeArquivo: data.nomeArquivo,
          tamanho: data.tamanho,
          tipo: data.tipo,
        }]);
      } catch (e) {
        setErroAnexo(`Falha ao enviar "${file.name}": ${e.message}`);
      } finally {
        setAnexosUploading((p) => p.filter((id) => id !== tempId));
      }
    }
  };

  const removerAnexoLocal = (url) => {
    setAnexos((p) => p.filter((a) => a.url !== url));
  };

  const op = useMemo(() => ops.find((o) => o.id === opSelecionada), [ops, opSelecionada]);
  const categoriasOpDisponiveis = useMemo(() => (op ? categoriasUnicasOP(op) : []), [op]);

  const precisaOP = tipoRM === "ENGENHARIA" || tipoRM === "ALUGUEL" || tipoRM === "MONTAGEM";
  const precisaCategorias = tipoRM === "ENGENHARIA";

  const toggleCategoria = (cat) => {
    setCategoriasCobertas((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const importarArquivo = async (file) => {
    if (!file) return;
    setImportando(true);
    setErro("");
    try {
      const { meta, itens } = await parseTekla(file);
      if (itens.length === 0) {
        setErro("Nenhum item encontrado na planilha.");
        return;
      }
      setItensImportados(itens);
      setArquivoNome(file.name);
      // Pre-popula numero da RM com o rmRef do cabecalho do Tekla (ex: "T83-001")
      if (!numero && meta.rmRef) setNumero(meta.rmRef);
      if (!descricao && (meta.cliente || meta.obra)) {
        const parts = [meta.rmRef, meta.obra, meta.cliente].filter(Boolean);
        if (parts.length) setDescricao(`Importação ${parts.join(" — ")}`);
      }

      // Sobe o arquivo Excel original pro Vercel Blob e vincula como anexo
      // — assim fica disponivel pra consulta E vai pro fornecedor com a cotacao.
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload-blob", { method: "POST", body: fd });
        const data = await res.json();
        if (res.ok) {
          setAnexos((p) => {
            // Evita duplicar se ja existir um anexo com mesma URL
            if (p.some((a) => a.url === data.url)) return p;
            return [...p, {
              url: data.url,
              nomeArquivo: data.nomeArquivo,
              tamanho: data.tamanho,
              tipo: data.tipo,
            }];
          });
        } else {
          // Nao quebra o fluxo de import se o blob falhar — so avisa
          setErroAnexo(`Planilha importada, mas falhou salvar como anexo: ${data.error || "erro"}`);
        }
      } catch (e) {
        setErroAnexo(`Planilha importada, mas falhou salvar como anexo: ${e.message}`);
      }
    } catch (e) {
      setErro("Erro ao ler arquivo: " + e.message);
    } finally {
      setImportando(false);
    }
  };

  const removerImportado = (idx) => {
    setItensImportados((prev) => prev.filter((_, i) => i !== idx));
  };

  const adicionarItemManual = () => {
    setItensImportados((prev) => [
      ...prev,
      { descricao: "", codigo: "", material: "", qtd: 1, unidade: "UN", peso: 0, comprimento: "", manual: true },
    ]);
  };

  const editarItem = (idx, campo, valor) => {
    setItensImportados((prev) => prev.map((it, i) => (i === idx ? { ...it, [campo]: valor } : it)));
  };

  const submit = async () => {
    setErro("");
    if (precisaOP && !opSelecionada) return setErro("Escolha uma OP.");
    if (precisaCategorias && categoriasCobertas.length === 0) {
      return setErro("Marque pelo menos uma categoria do escopo coberta por essa RM.");
    }
    if (!ehAutoNum && !numero.trim()) return setErro("Informe o número da RM.");
    if (!descricao.trim()) return setErro("Descreva a RM.");
    // Filtra itens manuais vazios (descricao em branco)
    const itensValidos = itensImportados.filter((it) => it.descricao && it.descricao.trim());
    if (itensValidos.length === 0) {
      return setErro("Adicione ao menos um item — pela planilha ou manualmente.");
    }
    // Validação específica de Montagem: valor da medição obrigatório
    if (ehMontagem) {
      for (let i = 0; i < itensValidos.length; i++) {
        const it = itensValidos[i];
        if (!it.valorTotal || Number(it.valorTotal) <= 0) return setErro(`Item ${i + 1}: informe o valor da medição.`);
      }
    }
    // Validação específica de Aluguel: diária e dias obrigatórios
    if (ehAluguel) {
      for (let i = 0; i < itensValidos.length; i++) {
        const it = itensValidos[i];
        if (!it.valorDiaria || it.valorDiaria <= 0) return setErro(`Item ${i + 1}: informe o valor da diária.`);
        if (!it.qtdDias || it.qtdDias <= 0) return setErro(`Item ${i + 1}: informe a quantidade de dias.`);
      }
    }

    const itens = itensValidos.map((it) => ({
      opItemId: null,
      aditivoItemId: null,
      // Por linha: OP destino (multi-OP). Se vazio, usa a OP principal da RM.
      opDestinoId: it.opDestinoId || opSelecionada || null,
      // Se marcado como estoque, vincula ao EstoqueItem via codigoOmieEstoque
      destinoEstoque: !!it.destinoEstoque,
      codigoOmieEstoque: it.codigoOmieEstoque || it.codigo || null,
      descricao: it.descricao,
      unidade: it.unidade || "UN",
      qtd: Number(it.qtd) || 0,
      codigo: it.codigo || null,
      material: it.material || null,
      comprimento: it.comprimento || null,
      largura: it.largura || null,
      tratamento: it.tratamento || null,
      observacao: it.observacao?.trim() || null,
      peso: Number(it.peso) || null,
      pesoLinear: Number(it.pesoLinear) || null,
      valorDiaria: Number(it.valorDiaria) || null,
      qtdDias: Number(it.qtdDias) || null,
      valorTotal: Number(it.valorTotal) || null,
    }));

    setSalvando(true);
    try {
      const res = await fetch("/api/rm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numero: ehAutoNum ? null : numero.trim(),
          tipoRM,
          opId: precisaOP ? opSelecionada : null,
          categoriasOP: precisaCategorias ? categoriasCobertas : [],
          faturamentoDireto: ehAluguel ? faturamentoDireto : false,
          descricao: descricao.trim(),
          observacao: observacao.trim() || null,
          setor: setor || null,
          itens,
          anexos,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao criar RM");
      router.push(`/rm/${data.id}`);
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <Link href="/rm" className="text-sm text-torg-gray hover:text-torg-dark inline-flex items-center gap-1 mb-2">
          <ArrowLeft size={14} /> Voltar
        </Link>
        <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">Nova RM</h2>
        <p className="text-sm text-torg-gray mt-1">
          Solicitação de compra. Escolha o tipo conforme a origem.
        </p>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span>{erro}</span>
        </div>
      )}

      {/* Step 1: Tipo de RM */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-torg-dark mb-4">Tipo de RM</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TIPOS_RM.map((t) => {
            const Icon = t.icon;
            const ativo = tipoRM === t.codigo;
            return (
              <button
                key={t.codigo}
                type="button"
                onClick={() => {
                  setTipoRM(t.codigo);
                  if (t.codigo === "INTERNA") setOpSelecionada("");
                  if (t.codigo === "ALUGUEL") { setItensImportados([]); setArquivoNome(""); }
                  if (t.codigo !== "ENGENHARIA") setCategoriasCobertas([]);
                }}
                className={`text-left p-4 rounded-lg border-2 transition-colors ${
                  ativo
                    ? "border-torg-blue bg-torg-blue-50/50"
                    : "border-gray-200 hover:border-torg-blue-200"
                }`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-2 ${
                  ativo ? "bg-torg-blue text-white" : "bg-gray-100 text-torg-gray"
                }`}>
                  <Icon size={20} />
                </div>
                <p className="font-semibold text-torg-dark">{t.label}</p>
                <p className="text-xs text-torg-gray mt-1">{t.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 2: dados gerais */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h3 className="text-lg font-semibold text-torg-dark">Dados gerais</h3>

        {precisaOP && (
          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">
              Ordem de Produção (OP) *
            </label>
            <select
              value={opSelecionada}
              onChange={(e) => { setOpSelecionada(e.target.value); setCategoriasCobertas([]); }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue bg-white"
            >
              <option value="">— Escolher —</option>
              {ops.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.numero} — {o.cliente} {o.obra ? `(${o.obra})` : ""}
                </option>
              ))}
            </select>
            {ops.length === 0 && (
              <p className="mt-1 text-xs text-torg-orange-700">
                Nenhuma OP ativa. Solicite ao Comercial criar uma OP.
              </p>
            )}
          </div>
        )}

        {precisaCategorias && op && (
          <div>
            <label className="block text-sm font-medium text-torg-dark mb-2">
              Categorias da solicitação *
            </label>
            <p className="text-xs text-torg-gray mb-3">
              Marque do que se trata essa RM. Categorias marcadas com <span className="text-emerald-700 font-semibold">✓ no escopo</span> já estão previstas no contrato da OP.
            </p>

            {/* Materiais */}
            <div className="mb-3">
              <p className="text-[10px] text-torg-gray uppercase tracking-wide mb-1 font-semibold">Materiais</p>
              <div className="flex flex-wrap gap-2">
                {CATEGORIAS_MATERIAL.map((c) => (
                  <CategoriaChip
                    key={c.codigo}
                    codigo={c.codigo}
                    label={c.label}
                    selecionada={categoriasCobertas.includes(c.codigo)}
                    noEscopo={categoriasOpDisponiveis.includes(c.codigo)}
                    onClick={() => toggleCategoria(c.codigo)}
                  />
                ))}
              </div>
            </div>

            {/* Serviços terceirizados */}
            <div className="mb-3">
              <p className="text-[10px] text-torg-gray uppercase tracking-wide mb-1 font-semibold">Serviços Terceirizados</p>
              <div className="flex flex-wrap gap-2">
                {CATEGORIAS_SERVICOS_TERCEIRIZADOS.map((c) => (
                  <CategoriaChip
                    key={c.codigo}
                    codigo={c.codigo}
                    label={c.label}
                    selecionada={categoriasCobertas.includes(c.codigo)}
                    noEscopo={categoriasOpDisponiveis.includes(c.codigo)}
                    onClick={() => toggleCategoria(c.codigo)}
                  />
                ))}
              </div>
            </div>

            {/* Aluguéis */}
            <div className="mb-3">
              <p className="text-[10px] text-torg-gray uppercase tracking-wide mb-1 font-semibold">Aluguéis e Equipamentos</p>
              <div className="flex flex-wrap gap-2">
                {CATEGORIAS_ALUGUEL.map((c) => (
                  <CategoriaChip
                    key={c.codigo}
                    codigo={c.codigo}
                    label={c.label}
                    selecionada={categoriasCobertas.includes(c.codigo)}
                    noEscopo={categoriasOpDisponiveis.includes(c.codigo)}
                    onClick={() => toggleCategoria(c.codigo)}
                  />
                ))}
              </div>
            </div>

            {/* Outro */}
            <div>
              <p className="text-[10px] text-torg-gray uppercase tracking-wide mb-1 font-semibold">Outro</p>
              <div className="flex flex-wrap gap-2">
                <CategoriaChip
                  codigo={CATEGORIA_OUTRO.codigo}
                  label={CATEGORIA_OUTRO.label}
                  selecionada={categoriasCobertas.includes(CATEGORIA_OUTRO.codigo)}
                  noEscopo={categoriasOpDisponiveis.includes(CATEGORIA_OUTRO.codigo)}
                  onClick={() => toggleCategoria(CATEGORIA_OUTRO.codigo)}
                />
              </div>
            </div>

            {/* Aviso quando seleciona categoria fora do escopo */}
            {categoriasCobertas.some((c) => !categoriasOpDisponiveis.includes(c)) && (
              <p className="text-[11px] text-amber-700 italic mt-3 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                ⚠️ Você selecionou categoria(s) que não estão no escopo desta OP. Compras pode pedir aditivo se necessário.
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">Nº RM *</label>
            {ehAutoNum ? (
              <>
                <div className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm font-mono font-semibold text-torg-blue flex items-center gap-2">
                  {proximoNumInterna || (ehAluguel ? "RA-…" : "RI-…")}
                  <span className="text-[10px] font-sans font-normal text-torg-gray bg-white border border-gray-200 rounded px-1.5 py-0.5">automático</span>
                </div>
                <p className="text-[10px] text-torg-gray mt-1">
                  Número sequencial gerado automaticamente{ehAluguel ? " para aluguel de equipamentos" : " para RM interna"}.
                </p>
              </>
            ) : (
              <>
                <input
                  type="text"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value.toUpperCase())}
                  placeholder="Ex: T83-001"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono font-semibold focus:ring-2 focus:ring-torg-blue"
                />
                <p className="text-[10px] text-torg-gray mt-1">
                  Pré-preenchido com o número do Tekla quando você sobe a planilha. Pode editar.
                </p>
              </>
            )}
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-torg-dark mb-1">Descrição da RM *</label>
            <input
              type="text"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Compra inicial de chapas"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">Setor</label>
            <input
              type="text"
              value={setor}
              onChange={(e) => setSetor(e.target.value)}
              placeholder="Ex: Engenharia"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">Observação</label>
            <input
              type="text"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Opcional"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
            />
          </div>
        </div>
      </div>

      {/* Step 3: itens — versão Aluguel ou padrão */}
      {ehAluguel ? (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-torg-dark flex items-center gap-2">
              <Forklift size={20} className="text-torg-orange" /> Equipamentos
            </h3>
            <p className="text-sm text-torg-gray mt-1">
              Informe os equipamentos, valor da diária e quantidade de dias.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div
                onClick={() => setFaturamentoDireto(!faturamentoDireto)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${faturamentoDireto ? "bg-torg-orange" : "bg-gray-300"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${faturamentoDireto ? "translate-x-6" : "translate-x-1"}`} />
              </div>
              <span className="text-sm font-medium text-torg-dark">Faturamento direto</span>
            </label>
          </div>
          <button
            type="button"
            onClick={() => {
              setItensImportados((prev) => [
                ...prev,
                { descricao: "", qtd: 1, unidade: "UN", valorDiaria: "", qtdDias: "", valorTotal: "", manual: true },
              ]);
            }}
            className="px-4 py-2 bg-torg-orange text-white text-sm rounded-lg hover:bg-torg-orange/90 font-medium flex items-center gap-2"
          >
            <Plus size={16} /> Adicionar equipamento
          </button>
        </div>

        {itensImportados.length === 0 ? (
          <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center">
            <Forklift size={36} className="mx-auto text-gray-300 mb-3" />
            <p className="text-torg-gray text-sm">Nenhum equipamento adicionado</p>
            <p className="text-xs text-gray-400 mt-1">Clique em "Adicionar equipamento" para começar</p>
          </div>
        ) : (
          <div className="space-y-3">
            {itensImportados.map((it, i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-4 hover:border-torg-orange/40 transition-colors">
                <div className="flex items-start gap-3">
                  <span className="text-xs font-bold text-torg-gray bg-gray-100 rounded-full w-6 h-6 flex items-center justify-center mt-1">{i + 1}</span>
                  <div className="flex-1 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-torg-dark mb-1">Descrição do equipamento *</label>
                      <input
                        type="text"
                        value={it.descricao || ""}
                        onChange={(e) => editarItem(i, "descricao", e.target.value)}
                        placeholder="Ex: Guindaste 30 ton, Plataforma elevatória..."
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-orange"
                      />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-torg-dark mb-1">Valor da diária (R$) *</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={it.valorDiaria || ""}
                          onChange={(e) => {
                            const vd = parseFloat(e.target.value) || 0;
                            setItensImportados((prev) => prev.map((x, j) => j === i
                              ? { ...x, valorDiaria: vd, valorTotal: vd * (Number(x.qtdDias) || 0) }
                              : x));
                          }}
                          placeholder="0,00"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-orange"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-torg-dark mb-1">Qtd de dias *</label>
                        <input
                          type="number"
                          step="1"
                          min="1"
                          value={it.qtdDias || ""}
                          onChange={(e) => {
                            const dias = parseInt(e.target.value) || 0;
                            setItensImportados((prev) => prev.map((x, j) => j === i
                              ? { ...x, qtdDias: dias, valorTotal: (Number(x.valorDiaria) || 0) * dias }
                              : x));
                          }}
                          placeholder="0"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-orange"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-torg-dark mb-1">Valor total (R$)</label>
                        <div className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm font-semibold text-torg-dark tabular-nums">
                          {fmtMoeda((Number(it.valorDiaria) || 0) * (Number(it.qtdDias) || 0))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-torg-dark mb-1">Qtd</label>
                        <input
                          type="number"
                          step="1"
                          min="1"
                          value={it.qtd || 1}
                          onChange={(e) => editarItem(i, "qtd", parseInt(e.target.value) || 1)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-orange"
                        />
                      </div>
                    </div>
                  </div>
                  <button type="button" onClick={() => removerImportado(i)} className="text-red-400 hover:text-red-600 mt-1">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
            {/* Totalizador */}
            <div className="bg-torg-orange/5 border border-torg-orange/20 rounded-lg px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-medium text-torg-dark">{itensImportados.length} {itensImportados.length === 1 ? "equipamento" : "equipamentos"}</span>
              <span className="text-sm font-bold text-torg-dark">
                Total: {fmtMoeda(itensImportados.reduce((s, it) => s + (Number(it.valorDiaria) || 0) * (Number(it.qtdDias) || 0) * (Number(it.qtd) || 1), 0))}
              </span>
            </div>
          </div>
        )}
      </div>
      ) : ehMontagem ? (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-torg-dark flex items-center gap-2">
              <Hammer size={20} className="text-torg-blue" /> Medições de montagem
            </h3>
            <p className="text-sm text-torg-gray mt-1">
              Descreva o que está sendo medido e informe o valor — sem cotação; Compras gera o pedido Omie direto para o extrato da obra.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setItensImportados((prev) => [
                ...prev,
                { descricao: "", qtd: 1, unidade: "VB", valorTotal: "", manual: true },
              ]);
            }}
            className="px-4 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-2"
          >
            <Plus size={16} /> Adicionar medição
          </button>
        </div>

        {itensImportados.length === 0 ? (
          <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center">
            <Hammer size={36} className="mx-auto text-gray-300 mb-3" />
            <p className="text-torg-gray text-sm">Nenhuma medição adicionada</p>
            <p className="text-xs text-gray-400 mt-1">Ex.: "Medição 02 — montagem da cobertura galpão A"</p>
          </div>
        ) : (
          <div className="space-y-3">
            {itensImportados.map((it, i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-4 flex items-start gap-3 flex-wrap">
                <div className="flex-1 min-w-[260px]">
                  <label className="block text-xs font-medium text-torg-gray mb-1">Descrição da medição *</label>
                  <input
                    type="text"
                    value={it.descricao}
                    onChange={(e) => setItensImportados((prev) => prev.map((x, xi) => (xi === i ? { ...x, descricao: e.target.value } : x)))}
                    placeholder="Ex.: Medição 02 — montagem da cobertura galpão A"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none"
                  />
                </div>
                <div className="w-44">
                  <label className="block text-xs font-medium text-torg-gray mb-1">Valor da medição (R$) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={it.valorTotal}
                    onChange={(e) => setItensImportados((prev) => prev.map((x, xi) => (xi === i ? { ...x, valorTotal: e.target.value } : x)))}
                    placeholder="0,00"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg text-right focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setItensImportados((prev) => prev.filter((_, xi) => xi !== i))}
                  className="mt-6 text-gray-300 hover:text-red-500"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {/* Totalizador */}
            <div className="bg-torg-blue-50 border border-torg-blue-100 rounded-lg px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-medium text-torg-dark">{itensImportados.length} {itensImportados.length === 1 ? "medição" : "medições"}</span>
              <span className="text-sm font-bold text-torg-dark">
                Total: {fmtMoeda(itensImportados.reduce((s, it) => s + (Number(it.valorTotal) || 0), 0))}
              </span>
            </div>
          </div>
        )}
      </div>
      ) : (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-torg-dark flex items-center gap-2">
              <FileSpreadsheet size={20} className="text-torg-blue" /> Itens da RM
            </h3>
            <p className="text-sm text-torg-gray mt-1">
              Suba a planilha .xlsx ou adicione itens manualmente.
            </p>
          </div>
          {itensImportados.length > 0 && (
            <span className="text-xs bg-torg-blue-50 text-torg-blue px-3 py-1 rounded-full font-medium">
              {itensImportados.length} itens · {itensImportados.reduce((s, it) => s + (Number(it.peso) || 0), 0).toFixed(2)} kg total
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={importando}
            className="px-4 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-2 disabled:opacity-50"
          >
            {importando ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {importando ? "Lendo..." : arquivoNome ? "Trocar arquivo" : "Selecionar .xlsx"}
          </button>
          <button
            type="button"
            onClick={adicionarItemManual}
            className="px-4 py-2 bg-white border border-torg-blue-200 text-torg-blue text-sm rounded-lg hover:bg-torg-blue-50 font-medium flex items-center gap-2"
          >
            <Plus size={16} /> Adicionar item manual
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => { importarArquivo(e.target.files[0]); e.target.value = ""; }}
          />
          {arquivoNome && (
            <span className="text-sm text-torg-gray flex items-center gap-2">
              <CheckCircle2 size={14} className="text-torg-orange" />
              {arquivoNome}
              <button
                type="button"
                onClick={() => { setItensImportados([]); setArquivoNome(""); }}
                className="text-red-400 hover:text-red-600 ml-1"
              >
                <X size={14} />
              </button>
            </span>
          )}
        </div>

        {/* Busca no catálogo de produtos do Omie — digite e selecione pra adicionar */}
        <div className="mt-4">
          <BuscaProdutoOmie onAdd={adicionarProdutoOmie} />
        </div>

        {itensImportados.length > 0 && (
          <div className="mt-4 max-h-[500px] overflow-y-auto overflow-x-auto border border-gray-100 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase w-8">#</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase min-w-[220px]">Descrição *</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase">Cód.</th>
                  {!ehInterna && <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase">Material</th>}
                  <th className="px-2 py-2 text-right font-medium text-gray-500 uppercase">Qtd</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase">Un.</th>
                  {!ehInterna && <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase">Comp.</th>}
                  {!ehInterna && <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase">Larg.</th>}
                  {!ehInterna && <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase">Tratamento</th>}
                  {!ehInterna && <th className="px-2 py-2 text-right font-medium text-gray-500 uppercase">Peso (kg)</th>}
                  {!ehInterna && <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase" title="OP destino (multi-OP)">OP dest.</th>}
                  {!ehInterna && <th className="px-2 py-2 text-center font-medium text-gray-500 uppercase" title="Vai pro estoque (categoria 3.1)?">Estq.</th>}
                  {ehInterna && <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase min-w-[200px]">Observação</th>}
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {itensImportados.slice(0, 200).map((it, i) => (
                  <tr key={i} className={`hover:bg-gray-50 ${it.manual ? "bg-torg-blue-50/30" : ""}`}>
                    <td className="px-2 py-1.5 text-gray-400">{i + 1}</td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text" value={it.descricao || ""}
                        onChange={(e) => editarItem(i, "descricao", e.target.value)}
                        placeholder="Descrição do item"
                        className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-torg-blue"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text" value={it.codigo || ""}
                        onChange={(e) => editarItem(i, "codigo", e.target.value)}
                        placeholder="—"
                        className="w-20 border border-gray-200 rounded px-2 py-1 text-xs font-mono focus:ring-1 focus:ring-torg-blue"
                      />
                    </td>
                    {!ehInterna && (
                    <td className="px-2 py-1.5">
                      <input
                        type="text" value={it.material || ""}
                        onChange={(e) => editarItem(i, "material", e.target.value)}
                        placeholder="—"
                        className="w-24 border border-gray-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-torg-blue"
                      />
                    </td>
                    )}
                    <td className="px-2 py-1.5 text-right">
                      <input
                        type="number" step="0.01" min="0" value={it.qtd || ""}
                        onChange={(e) => editarItem(i, "qtd", parseFloat(e.target.value) || 0)}
                        className="w-14 border border-gray-200 rounded px-2 py-1 text-xs text-right tabular-nums focus:ring-1 focus:ring-torg-blue"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text" value={it.unidade || ""}
                        onChange={(e) => editarItem(i, "unidade", e.target.value.toUpperCase())}
                        placeholder="UN"
                        className="w-12 border border-gray-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-torg-blue"
                      />
                    </td>
                    {!ehInterna && (
                    <td className="px-2 py-1.5">
                      <input
                        type="text" value={it.comprimento || ""}
                        onChange={(e) => editarItem(i, "comprimento", e.target.value)}
                        placeholder="—"
                        className="w-16 border border-gray-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-torg-blue"
                      />
                    </td>
                    )}
                    {!ehInterna && (
                    <td className="px-2 py-1.5">
                      <input
                        type="text" value={it.largura || ""}
                        onChange={(e) => editarItem(i, "largura", e.target.value)}
                        placeholder="—"
                        className="w-16 border border-gray-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-torg-blue"
                      />
                    </td>
                    )}
                    {!ehInterna && (
                    <td className="px-2 py-1.5">
                      <input
                        type="text" value={it.tratamento || ""}
                        onChange={(e) => editarItem(i, "tratamento", e.target.value)}
                        placeholder="—"
                        className="w-24 border border-gray-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-torg-blue"
                      />
                    </td>
                    )}
                    {!ehInterna && (
                    <td className="px-2 py-1.5 text-right">
                      <input
                        type="number" step="0.01" min="0" value={it.peso || ""}
                        onChange={(e) => editarItem(i, "peso", parseFloat(e.target.value) || 0)}
                        placeholder="—"
                        className="w-20 border border-gray-200 rounded px-2 py-1 text-xs text-right tabular-nums focus:ring-1 focus:ring-torg-blue"
                      />
                    </td>
                    )}
                    {!ehInterna && (
                    <td className="px-2 py-1.5">
                      <select
                        value={it.opDestinoId || opSelecionada || ""}
                        onChange={(e) => editarItem(i, "opDestinoId", e.target.value || null)}
                        className="w-28 border border-gray-200 rounded px-1 py-1 text-xs focus:ring-1 focus:ring-torg-blue bg-white"
                        title="OP destinatária desta linha (multi-OP)"
                      >
                        <option value="">— sem OP —</option>
                        {(ops || []).map((op) => (
                          <option key={op.id} value={op.id}>{fmtOP(op.numero)}</option>
                        ))}
                      </select>
                    </td>
                    )}
                    {!ehInterna && (
                    <td className="px-2 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={!!it.destinoEstoque}
                        onChange={(e) => editarItem(i, "destinoEstoque", e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-torg-blue focus:ring-torg-blue"
                        title="Marcar quando o item vai pro estoque (matéria prima padrão — categoria 3.1)"
                      />
                    </td>
                    )}
                    {ehInterna && (
                    <td className="px-2 py-1.5">
                      <input
                        type="text" value={it.observacao || ""}
                        onChange={(e) => editarItem(i, "observacao", e.target.value)}
                        placeholder="Observação (opcional)"
                        className="w-full min-w-[180px] border border-gray-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-torg-blue"
                      />
                    </td>
                    )}
                    <td className="px-2 py-1.5">
                      <button
                        type="button"
                        onClick={() => removerImportado(i)}
                        className="text-red-400 hover:text-red-600"
                        title="Remover item"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {itensImportados.length > 200 && (
              <p className="text-center text-xs text-torg-gray py-2">
                Exibindo 200 de {itensImportados.length} itens — todos serão salvos ao criar a RM
              </p>
            )}
            <p className="text-[11px] text-torg-gray italic px-3 py-2 border-t border-gray-100 bg-gray-50/50">
              💡 Todos os campos são editáveis — ajuste comprimento, largura e tratamento principalmente pra chapas e perfis.
            </p>
          </div>
        )}
      </div>
      )}

      {/* Step 4: anexos (desenhos, especificacoes) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <div>
            <h3 className="text-lg font-semibold text-torg-dark flex items-center gap-2">
              <FileSpreadsheet size={20} className="text-torg-blue" /> Anexos (opcional)
            </h3>
            <p className="text-sm text-torg-gray mt-1">
              Desenhos, especificações, fotos de referência. Serão enviados junto com a cotação aos fornecedores.
            </p>
          </div>
          <button
            type="button"
            onClick={() => anexoFileRef.current?.click()}
            disabled={anexosUploading.length > 0}
            className="px-4 py-2 bg-white border border-torg-blue-200 text-torg-blue text-sm rounded-lg hover:bg-torg-blue-50 font-medium flex items-center gap-2 disabled:opacity-50"
          >
            {anexosUploading.length > 0 ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {anexosUploading.length > 0 ? `Enviando ${anexosUploading.length}...` : "Anexar arquivo(s)"}
          </button>
          <input
            ref={anexoFileRef}
            type="file"
            multiple
            accept="application/pdf,image/*,.dwg,.dxf,.zip,.docx,.xlsx,.txt"
            className="hidden"
            onChange={(e) => { uploadAnexos(Array.from(e.target.files || [])); e.target.value = ""; }}
          />
        </div>
        {erroAnexo && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 mb-3 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5" /> <span>{erroAnexo}</span>
          </div>
        )}
        {anexos.length === 0 ? (
          <p className="text-sm text-torg-gray italic">Nenhum anexo adicionado.</p>
        ) : (
          <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
            {anexos.map((a) => (
              <li key={a.url} className="px-3 py-2 flex items-center gap-3 hover:bg-gray-50">
                <FileSpreadsheet size={16} className="text-torg-blue flex-shrink-0" />
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 min-w-0 truncate text-sm text-torg-dark hover:text-torg-blue hover:underline"
                  title={a.nomeArquivo}
                >
                  {a.nomeArquivo}
                </a>
                <span className="text-xs text-torg-gray tabular-nums whitespace-nowrap">{fmtBytes(a.tamanho)}</span>
                <button
                  type="button"
                  onClick={() => removerAnexoLocal(a.url)}
                  className="text-red-500 hover:text-red-700"
                  title="Remover anexo"
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex justify-end gap-3">
        <Link
          href="/rm"
          className="px-5 py-2.5 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancelar
        </Link>
        <button
          onClick={submit}
          disabled={salvando || anexosUploading.length > 0}
          className="px-6 py-2.5 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-2 disabled:opacity-50"
          title={anexosUploading.length > 0 ? "Aguarde os anexos terminarem de subir" : ""}
        >
          {salvando && <Loader2 size={16} className="animate-spin" />}
          {salvando ? "Salvando..." : "Criar RM"}
        </button>
      </div>
    </div>
  );
}

// Busca de produto no catálogo do Omie (descrição ou código) → adiciona como item.
function BuscaProdutoOmie({ onAdd }) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState([]);
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const timer = useRef(null);
  const boxRef = useRef(null);

  // Fecha ao clicar fora
  useEffect(() => {
    const fora = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setAberto(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  const buscar = (texto) => {
    setQ(texto);
    clearTimeout(timer.current);
    if (texto.trim().length < 2) { setResultados([]); setAberto(false); return; }
    timer.current = setTimeout(async () => {
      setCarregando(true);
      try {
        const res = await fetch(`/api/omie/buscar-produto?q=${encodeURIComponent(texto.trim())}&limit=20`);
        const d = await res.json();
        setResultados(d.itens || []);
        setAberto(true);
      } catch { setResultados([]); } finally { setCarregando(false); }
    }, 300);
  };

  const escolher = (p) => {
    onAdd(p);
    setQ(""); setResultados([]); setAberto(false);
  };

  return (
    <div ref={boxRef} className="relative max-w-2xl">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={q}
          onChange={(e) => buscar(e.target.value)}
          onFocus={() => { if (resultados.length) setAberto(true); }}
          placeholder="Buscar produto no Omie (descrição ou código)…"
          className="w-full pl-9 pr-9 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue"
        />
        {carregando && <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />}
      </div>

      {aberto && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
          {resultados.length === 0 ? (
            <div className="px-3 py-3 text-sm text-torg-gray flex items-center gap-2">
              <Package size={14} className="text-gray-300" />
              {q.trim().length < 2 ? "Digite ao menos 2 caracteres." : "Nenhum produto encontrado no Omie."}
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {resultados.map((p) => (
                <li key={`${p.codigo}-${p.descricao}`}>
                  <button
                    type="button"
                    onClick={() => escolher(p)}
                    className="w-full text-left px-3 py-2 hover:bg-torg-blue-50 flex items-center gap-2.5"
                  >
                    {/* Saldo em estoque (Omie) — na frente do nome */}
                    <span
                      title="Saldo atual em estoque (Omie)"
                      className={`shrink-0 text-[11px] font-bold px-2 py-1 rounded-md text-center min-w-[60px] border ${
                        p.saldo == null
                          ? "bg-gray-100 text-gray-400 border-gray-200"
                          : p.saldo > 0
                          ? "bg-green-50 text-green-700 border-green-200"
                          : "bg-red-50 text-red-600 border-red-200"
                      }`}
                    >
                      {p.saldo == null
                        ? "—"
                        : `${Number(p.saldo).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${p.unidade || "UN"}`}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-torg-dark truncate">{p.descricao}</span>
                      <span className="block text-[11px] text-torg-gray font-mono">cód. {p.codigo} · {p.unidade || "UN"}</span>
                    </span>
                    <Plus size={14} className="text-torg-gray shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// Chip de categoria — mostra label + badge "no escopo" quando aplicavel.
// Selecao destaca em azul; nao-selecionadas mostram label normal.
function CategoriaChip({ codigo, label, selecionada, noEscopo, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm border-2 transition-colors inline-flex items-center gap-1.5 ${
        selecionada
          ? "border-torg-blue bg-torg-blue text-white"
          : noEscopo
          ? "border-emerald-200 text-torg-dark bg-emerald-50/40 hover:border-emerald-400"
          : "border-gray-200 text-torg-dark hover:border-torg-blue-200"
      }`}
    >
      {label}
      {noEscopo && !selecionada && (
        <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold whitespace-nowrap" title="Categoria já prevista no escopo da OP">
          ✓ no escopo
        </span>
      )}
      {noEscopo && selecionada && (
        <span className="text-[9px] px-1 py-0.5 rounded bg-white/20 text-white font-bold whitespace-nowrap">
          ✓ escopo
        </span>
      )}
    </button>
  );
}
