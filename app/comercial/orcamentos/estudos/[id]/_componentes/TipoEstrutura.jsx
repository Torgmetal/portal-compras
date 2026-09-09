"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Search, Plus, ChevronDown, Check, X } from "lucide-react";
import { ESTRUTURAS, ESTRUTURA_ROTULO } from "@/lib/lqc";
import s from "./TipoEstrutura.module.css";

const norm = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const base = ESTRUTURAS.map((id) => ({ id, nome: ESTRUTURA_ROTULO[id], base: id }));

export function TipoEstrutura({ linha, tipos: personalizados = [], onEscolher }) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [novo, setNovo] = useState(false);
  const [nome, setNome] = useState("");
  const [tecnica, setTecnica] = useState("");
  const [erro, setErro] = useState("");
  const tipos = [...base, ...personalizados];
  function incluir(ev) {
    ev.preventDefault();
    if (!nome.trim() || !tecnica) { setErro("Informe o nome e a classificação técnica."); return; }
    if (tipos.some((t) => norm(t.nome) === norm(nome))) { setErro("Este nome já existe. Use a busca para selecioná-lo."); return; }
    onEscolher({ id: crypto.randomUUID(), nome: nome.trim(), base: tecnica }, true);
    setNovo(false); setBusca("");
  }
  return <div className={`${s.raiz} ${s.seletor}`}>
    <span className="block text-[11px] font-semibold text-torg-dark">Tipo de estrutura</span>
    <button type="button" className={s.escolha} aria-label="Selecionar tipo de estrutura" aria-expanded={aberto}
      onClick={() => { setAberto(!aberto); setBusca(""); }}>
      <span>{linha.estruturaNome || ESTRUTURA_ROTULO[linha.estrutura] || linha.estrutura || "Selecione o tipo"}</span><ChevronDown size={16}/>
    </button>
    {aberto && <div className={s.menu}>
      <div className={s.busca}><Search size={16}/><input autoFocus aria-label="Buscar tipo de estrutura" value={busca} placeholder="Buscar estrutura…"
        onChange={(ev) => setBusca(ev.target.value)} onKeyDown={(ev) => { if (ev.key === "Escape") setAberto(false); }}/></div>
      <div className={s.opcoes}>
        {tipos.filter((t) => norm(t.nome).includes(norm(busca))).map((t) => <button type="button" key={t.id}
          onClick={() => { onEscolher(t, false); setAberto(false); setBusca(""); }}>
          <span>{t.nome}<small>{t.id === t.base ? "Tipo padrão" : `Nome do cliente · ${ESTRUTURA_ROTULO[t.base]}`}</small></span>
          {(linha.estruturaTipoId || linha.estrutura) === t.id && <Check size={16}/>}
        </button>)}
        {!tipos.some((t) => norm(t.nome).includes(norm(busca))) && <p>Nenhum tipo encontrado.</p>}
      </div>
      <button type="button" className={s.novo} onClick={() => { setNovo(true); setNome(busca); setTecnica(""); setErro(""); setAberto(false); }}>
        <Plus size={16}/> Incluir tipo de estrutura
      </button>
    </div>}
    {novo && createPortal(<div className={`${s.raiz} ${s.fundo}`} onKeyDown={(ev) => { if (ev.key === "Escape") setNovo(false); }}>
      <form className={s.modal} onSubmit={incluir} role="dialog" aria-modal="true" aria-label="Novo tipo de estrutura">
        <header><div><span className={s.sobre}>TIPO DE ESTRUTURA</span><h3>Adicionar nome do cliente</h3></div><button type="button" aria-label="Fechar cadastro" onClick={() => setNovo(false)}><X size={20}/></button></header>
        <p>O nome poderá ser selecionado neste estudo. A classificação técnica mantém a referência para os cálculos.</p>
        <label>Nome do tipo<input autoFocus aria-label="Nome do novo tipo" placeholder="Ex.: Pipe rack, passarela de acesso…" value={nome} onChange={(ev) => setNome(ev.target.value)} required/></label>
        <label>Classificação técnica<select aria-label="Classificação técnica" value={tecnica} onChange={(ev) => setTecnica(ev.target.value)} required>
          <option value="">Selecione a equivalência técnica</option>{base.map((t) => <option value={t.id} key={t.id}>{t.nome}</option>)}
        </select></label>
        {erro && <p role="alert" className={s.erro}>{erro}</p>}
        <footer><button type="button" onClick={() => setNovo(false)}>Cancelar</button><button type="submit">Incluir e usar nesta área</button></footer>
      </form>
    </div>, document.body)}
  </div>;
}
