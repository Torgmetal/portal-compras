"use client";
import { useState, useEffect, useRef } from "react";
import { ehMaterialDeTinta } from "@/lib/material-tinta";

// OS CAMPOS DE UM LANÇAMENTO CMR — um componente só, usado pelo LANÇAR e pelo EDITAR.
//
// ⚠⚠ EM ARQUIVO PRÓPRIO PORQUE SÃO DOIS FORMULÁRIOS SOBRE O MESMO REGISTRO. Matheus (11/09/2026)
// pediu para editar a linha já lançada; a saída fácil seria copiar a grade de campos para dentro do
// modal de edição. Aí passam a existir duas listas de campos do mesmo dado, e a próxima mudança
// (como a validade de tinta, que entrou em 07/09) só é feita numa delas — o campo aparece ao lançar
// e some ao corrigir, que é o pior dos dois mundos.

export const inp = "w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-torg-blue outline-none";
export const lbl = "block text-[11px] font-medium text-torg-gray uppercase tracking-wide mb-1";

export const VAZIO = {
  rc: "R", descricao: "", especificacao: "", certificado: "", loteCorrida: "", pedidoCompra: "",
  dataRecebimento: "", nf: "", fornecedor: "", obra: "", qtd: "", pesoLitro: "", validade: "", observacao: "",
};

// Data (Date | ISO | "aaaa-mm-dd") → o "aaaa-mm-dd" que o <input type="date"> aceita.
//
// ⚠ `String(new Date())` DÁ "Fri Jan 15 2027", não ISO — e o recorte de 10 caracteres devolvia
// "Fri Jan 15". Pela rota o campo chega como texto ISO e o atalho funcionava por sorte; basta
// alguém passar a linha do Prisma direto para a validade sumir do formulário. Quem achou foi o
// teste da volta, não a tela.
const soData = (v) => {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(+d) ? String(v).slice(0, 10) : d.toISOString().slice(0, 10);
};

/**
 * A LINHA GRAVADA DE VOLTA PARA O FORMULÁRIO — o caminho inverso de `mapearLancamento`.
 *
 * ⚠⚠ SE ALGUM CAMPO FALTAR AQUI, EDITAR APAGA ESSE CAMPO. O PATCH grava o formulário inteiro, então
 * um campo que não for carregado volta vazio para o banco. É o motivo de `dataValidade` ter entrado
 * no `select` da listagem junto com esta função: sem ela, corrigir a NF de um lote de tinta zerava
 * a validade — e o FEFO daquele lote — sem ninguém pedir.
 *
 * ⚠ `obra` volta como "OP 067", não "067". O banco guarda a forma canônica (`obraCanonica`), a tela
 * sempre mostrou com o prefixo, e o mapeador aceita as duas — mostrar "067" cru faria parecer que a
 * edição mudou o campo quando ninguém tocou nele.
 */
export function linhaParaFormulario(l) {
  return {
    rc: l.rc || "R",
    descricao: l.nome || "",
    especificacao: l.norma || "",
    certificado: l.numeroDocumento || "",
    loteCorrida: l.numeroCorrida || "",
    pedidoCompra: l.pedidoCompra || "",
    dataRecebimento: soData(l.dataRecebimento),
    validade: soData(l.dataValidade),
    nf: l.nfNumero || "",
    fornecedor: l.fornecedor || "",
    obra: l.opNumero ? `OP ${l.opNumero}` : "",
    qtd: l.quantidade ?? "",
    pesoLitro: l.pesoKg ?? "",
    observacao: l.obs || "",
  };
}

/**
 * @param {{form:object, setF:(k:string,v:any)=>void, pedidoSlot?:React.ReactNode,
 *           aoBuscarPedido?:(()=>void)|null}} props
 *   `pedidoSlot` é o botão de puxar o pedido de compra e `aoBuscarPedido` é o Enter no campo —
 *   os dois só existem no lançamento, onde a pessoa está com a nota na mão. Na edição a linha já
 *   tem o pedido e o que se quer é corrigir um campo.
 */
export default function CmrCampos({ form, setF, pedidoSlot = null, aoBuscarPedido = null }) {
  // ⚠ lê a descrição AO VIVO: o campo da validade tem de aparecer enquanto a pessoa digita, não
  // depois de salvar.
  const ehTinta = ehMaterialDeTinta(form.descricao);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div><span className={lbl}>R / RC</span>
        <div className="flex gap-1">
          {["R", "RC"].map((t) => (
            <button key={t} type="button" onClick={() => setF("rc", t)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium border ${form.rc === t ? "bg-torg-blue text-white border-torg-blue" : "border-gray-300 text-torg-dark"}`}>{t}</button>
          ))}
        </div>
      </div>
      <div className="col-span-2 sm:col-span-3"><span className={lbl}>Descrição do material *</span>
        <Autocomplete campo="descricao" value={form.descricao} onChange={(v) => setF("descricao", v)} placeholder="ex.: PERFIL W ACO CARBONO…" /></div>
      <div className="col-span-2"><span className={lbl}>Especificação técnica (norma)</span>
        <Autocomplete campo="norma" value={form.especificacao} onChange={(v) => setF("especificacao", v)} placeholder="ex.: ASTM A572" /></div>
      <div><span className={lbl}>Nº certificado</span><input value={form.certificado} onChange={(e) => setF("certificado", e.target.value)} className={inp} /></div>
      <div><span className={lbl}>Lote / corrida</span><input value={form.loteCorrida} onChange={(e) => setF("loteCorrida", e.target.value)} className={inp} /></div>
      <div><span className={lbl}>Pedido compra</span>
        <div className="flex gap-1">
          <input value={form.pedidoCompra} onChange={(e) => setF("pedidoCompra", e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && aoBuscarPedido) { e.preventDefault(); aoBuscarPedido(); } }} placeholder="nº" className={inp} />
          {pedidoSlot}
        </div>
      </div>
      <div><span className={lbl}>Data receb.</span><input type="date" value={form.dataRecebimento} onChange={(e) => setF("dataRecebimento", e.target.value)} className={inp} /></div>
      <div><span className={lbl}>Nº NF</span><input value={form.nf} onChange={(e) => setF("nf", e.target.value)} inputMode="numeric" className={inp} /></div>
      <div><span className={lbl}>Fornecedor</span><input value={form.fornecedor} onChange={(e) => setF("fornecedor", e.target.value)} className={inp} /></div>
      <div><span className={lbl}>Obra (OP)</span><input value={form.obra} onChange={(e) => setF("obra", e.target.value)} placeholder="ex.: OP 067" className={inp} /></div>
      <div><span className={lbl}>Qtd peças</span><input value={form.qtd} onChange={(e) => setF("qtd", e.target.value)} inputMode="numeric" className={inp} /></div>
      <div><span className={lbl}>Peso / litro</span><input value={form.pesoLitro} onChange={(e) => setF("pesoLitro", e.target.value)} inputMode="decimal" className={inp} /></div>
      {/* ⚠⚠ O CAMPO APARECE SOZINHO QUANDO É TINTA. Vitor (07/09/2026): "quando identificar que é
          recebimento de tinta isso deve ser solicitado para o preenchimento na tela de recebimento".
          Sem validade não existe FEFO, e um campo permanente na tela seria mais um que ninguém
          preenche — ele só aparece quando importa, e aí pede atenção. */}
      {ehTinta && (
        <div>
          <span className={lbl}>Validade do lote <span className="text-torg-orange">· tinta</span></span>
          <input type="date" value={form.validade} onChange={(e) => setF("validade", e.target.value)}
            className={`${inp} ${form.validade ? "" : "border-torg-orange bg-orange-50"}`} />
        </div>
      )}
      <div className="col-span-2 sm:col-span-4"><span className={lbl}>Observação</span><input value={form.observacao} onChange={(e) => setF("observacao", e.target.value)} className={inp} /></div>
    </div>
  );
}

// Input com autocomplete (/api/compras/cmr/sugestoes).
export function Autocomplete({ campo, value, onChange, placeholder }) {
  const [lista, setLista] = useState([]);
  const [aberto, setAberto] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!aberto || (value || "").trim().length < 2) { setLista([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/compras/cmr/sugestoes?campo=${campo}&q=${encodeURIComponent(value.trim())}`).then((r) => r.json()).then((j) => setLista(j.sugestoes || [])).catch(() => setLista([]));
    }, 250);
    return () => clearTimeout(t);
  }, [value, aberto, campo]);
  return (
    <div className="relative" ref={box}>
      <input value={value} onChange={(e) => { onChange(e.target.value); setAberto(true); }} onFocus={() => setAberto(true)} onBlur={() => setTimeout(() => setAberto(false), 150)} placeholder={placeholder} className={inp} />
      {aberto && lista.length > 0 && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {lista.map((v, i) => (
            <button key={i} type="button" onMouseDown={(e) => { e.preventDefault(); onChange(v); setAberto(false); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-torg-blue-50 border-b border-gray-50 last:border-0">{v}</button>
          ))}
        </div>
      )}
    </div>
  );
}
