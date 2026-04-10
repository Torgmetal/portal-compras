"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { uid, today } from "@/lib/utils";
import { Upload, FileSpreadsheet, ArrowRight, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
import * as XLSX from "xlsx";
import Papa from "papaparse";

const UNIDADES = ["UN", "KG", "LT", "M", "M²", "CX", "PC", "GL", "TB", "RL", "PAR", "JG", "SC", "VB", "CJ", "PCT", "TON"];

export default function ImportarRmPage() {
    const { rms, setRms, showToast } = useStore();
    const router = useRouter();
    const fileRef = useRef(null);
    const [dragActive, setDragActive] = useState(false);
    const [nomeArquivo, setNomeArquivo] = useState("");
    const [itensImportados, setItensImportados] = useState([]);
    const [form, setForm] = useState({ tipo: "Material", descricao: "", observacao: "", solicitante: "", centroCusto: "" });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const processFile = (file) => {
        if (!file) return;
        setNomeArquivo(file.name);
        const reader = new FileReader();
        reader.onload = (ev) => {
                try {
                          let dados = [];
                          if (file.name.endsWith(".csv") || file.name.endsWith(".tsv")) {
                                      const parsed = Papa.parse(ev.target.result, { header: true, skipEmptyLines: true });
                                      dados = parsed.data;
                          } else {
                                      const data = new Uint8Array(ev.target.result);
                                      const wb = XLSX.read(data, { type: "array" });
                                      const ws = wb.Sheets[wb.SheetNames[0]];
                                      dados = XLSX.utils.sheet_to_json(ws);
                          }
                          const normalize = (row) => {
                                      const keys = Object.keys(row);
                                      const find = (terms) => keys.find((k) => terms.some((t) => k.toLowerCase().includes(t)));
                                      return {
                                                    descricao: row[find(["descri", "nome", "material", "produto", "item", "peça", "peca"])] || row[keys[0]] || "",
                                                    qtd: parseFloat(String(row[find(["qtd", "quant", "quantidade", "qty"])] || "1").replace(/[^\d.,]/g, "").replace(",", ".")) || 1,
                                                    unidade: row[find(["unidade", "und", "un", "uom"])] || "UN",
                                                    codigo: row[find(["código", "codigo", "cod", "ref", "part", "mark"])] || "",
                                                    peso: parseFloat(String(row[find(["peso", "weight", "kg"])] || "0").replace(/[^\d.,]/g, "").replace(",", ".")) || 0,
                                                    comprimento: row[find(["compri", "length", "tamanho"])] || "",
                                                    perfil: row[find(["perfil", "profile", "section", "seção", "secao"])] || "",
                                                    material: row[find(["material", "grade", "aço", "aco"])] || "",
                                      };
                          };
                          const itens = dados.map(normalize).filter((d) => d.descricao.trim() !== "");
                          if (itens.length === 0) return showToast("Nenhum item encontrado na planilha do Tekla", "error");
                          setItensImportados(itens);
                          if (!form.descricao) {
                                      const desc = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
                                      set("descricao", `Importação Tekla — ${desc}`);
                          }
                          showToast(`${itens.length} itens lidos do arquivo Tekla!`);
                } catch (err) {
                          showToast("Erro ao ler arquivo Tekla: " + err.message, "error");
                }
        };
        if (file.name.endsWith(".csv") || file.name.endsWith(".tsv")) reader.readAsText(file);
        else reader.readAsArrayBuffer(file);
  };

  const handleFileUpload = (e) => { processFile(e.target.files[0]); e.target.value = ""; };
    const handleDrop = (e) => { e.preventDefault(); setDragActive(false); processFile(e.dataTransfer.files[0]); };
    const removeItem = (i) => setItensImportados((prev) => prev.filter((_, idx) => idx !== i));
    const updateItem = (i, field, val) => { setItensImportados((prev) => { const copy = [...prev]; copy[i] = { ...copy[i], [field]: val }; return copy; }); };

  const criarRm = () => {
        if (!form.descricao.trim()) return showToast("Preencha a descrição da RM", "error");
        if (itensImportados.length === 0) return showToast("Importe um arquivo primeiro", "error");
        const novaRm = {
                id: uid(), numero: String(rms.length + 1).padStart(4, "0"), tipo: form.tipo, descricao: form.descricao,
                observacao: form.observacao, solicitante: form.solicitante, centroCusto: form.centroCusto,
                itens: itensImportados.map((it) => ({
                          id: uid(), descricao: it.descricao + (it.perfil ? ` | ${it.perfil}` : "") + (it.material ? ` | ${it.material}` : ""),
                          qtd: it.qtd, unidade: it.unidade, codigo: it.codigo, peso: it.peso,
                })),
                data: today(), status: "Aberta", cotacoes: [], anexos: [], mapaGerado: false, origemTekla: true, arquivoOrigem: nomeArquivo,
        };
        setRms((prev) => [novaRm, ...prev]);
        showToast(`RM-${novaRm.numero} criada com ${itensImportados.length} itens do Tekla!`);
        router.push(`/rm/${novaRm.id}`);
  };

  return <div className="max-w-5xl mx-auto space-y-6"><div><h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><Upload className="text-orange-500" /> Importar RM do Tekla</h2></div></div>;
    }
