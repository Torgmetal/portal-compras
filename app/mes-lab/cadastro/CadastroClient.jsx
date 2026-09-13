"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { ABAS, COLUNAS, vazioDe } from "./campos";
import FormularioCadastro from "./FormularioCadastro";

// ─── O CADASTRO DA FÁBRICA ────────────────────────────────────────────────────
//
// Matheus: *"precisamos ter essas telas depois para criar e excluir setores, máquinas dos
// setores/bancadas"*. Até aqui, o cadastro só nascia do script de semeio — que é bootstrap de uma
// vez, não fonte permanente (`docs/mes-proprio.md` §11.4).
//
// ⚠ Tela CLARA, ao contrário do totem: aqui quem trabalha é o PCP, sentado, no computador do
// escritório. O escuro do totem existe para quem está de luva, de longe, na fábrica.

const API = "/api/mes-lab/cadastro";

export default function CadastroClient() {
  const [aba, setAba] = useState("recursos");
  const [dados, setDados] = useState(null);
  const [setores, setSetores] = useState([]);
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState(null);

  const carregar = useCallback(async () => {
    setDados(null);
    try {
      const r = await fetch(`${API}?tipo=${aba}`, { cache: "no-store" });
      const j = await r.json();
      if (!j.success) return setErro(j.error);
      setDados(j);
      setErro("");
    } catch { setErro("Não consegui falar com o servidor."); }
  }, [aba]);

  useEffect(() => { carregar(); }, [carregar]);

  // A lista de setores alimenta o seletor do formulário de postos — vem sempre, não só na aba deles.
  useEffect(() => {
    fetch(`${API}?tipo=setores`, { cache: "no-store" })
      .then((r) => r.json()).then((j) => j.success && setSetores(j.lista))
      .catch(() => {});
  }, [dados]);

  async function gravar(corpo) {
    const r = await fetch(API, {
      method: corpo.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const j = await r.json().catch(() => ({}));
    if (!j.success) return { erro: j.error || "Não consegui gravar." };
    await carregar();
    return {};
  }

  async function alternarAtivo(reg) {
    await gravar({ tipo: aba, id: reg.id, ativo: !reg.ativo });
  }

  async function excluir(reg) {
    const nome = reg.nome || reg.descricao || reg.codigo;
    if (!window.confirm(`Excluir "${nome}" de vez? Isto não tem desfazer.`)) return;
    const r = await fetch(`${API}?tipo=${aba}&id=${encodeURIComponent(reg.id)}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!j.success) return setErro(j.error || "Não consegui excluir.");
    setErro("");
    carregar();
  }

  const singular = ABAS.find((a) => a.tipo === aba)?.singular || "registro";

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-torg-dark mb-1">Cadastro do MES</h1>
      <p className="text-torg-gray text-sm mb-6">
        Setores, postos, motivos de parada e operadores. É daqui que o totem lê o chão de fábrica.
      </p>

      <nav className="flex gap-1 border-b border-gray-200 mb-5 flex-wrap">
        {ABAS.map((a) => (
          <button key={a.tipo} onClick={() => setAba(a.tipo)}
                  className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition ${
                    aba === a.tipo ? "border-torg-blue text-torg-blue" : "border-transparent text-torg-gray hover:text-torg-dark"
                  }`}>
            {a.titulo}
          </button>
        ))}
      </nav>

      {erro && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">{erro}</p>
      )}

      <AvisoDeSetorOrfao setores={dados?.setoresOrfaos} />

      <div className="flex justify-end mb-3">
        <button onClick={() => setEditando(vazioDe(aba))}
                className="flex items-center gap-2 bg-torg-blue text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-torg-dark">
          <Plus size={16} /> Novo {singular}
        </button>
      </div>

      {!dados ? (
        <p className="text-torg-gray flex items-center gap-2 py-10 justify-center">
          <Loader2 size={18} className="animate-spin" /> Carregando…
        </p>
      ) : (
        <Tabela tipo={aba} lista={dados.lista}
                aoEditar={setEditando} aoAlternar={alternarAtivo} aoExcluir={excluir} />
      )}

      {editando && (
        <FormularioCadastro tipo={aba} registro={editando} setores={setores}
                            aoFechar={() => setEditando(null)} aoGravar={gravar} />
      )}
    </div>
  );
}

/**
 * ⚠⚠ O AVISO QUE SOBROU, DEPOIS DE UM ALARME FALSO. A primeira versão comparava os postos CÓDIGO A
 * CÓDIGO com a lista do Gantt e acusava 15 — mas Acabamento, Pintura e as máquinas `20x` têm
 * granularidade diferente POR DECISÃO (§11.3), e `programadoPara` agora cai para o setor nesses
 * casos. Sobrou a pergunta que continua sendo defeito: setor programado pelo PCP SEM posto ativo
 * nenhum — trabalho que existe no Gantt e não aparece em terminal algum.
 */
function AvisoDeSetorOrfao({ setores }) {
  if (!setores?.length) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 text-sm">
      <p className="font-bold text-amber-900 flex items-center gap-2 mb-1">
        <AlertTriangle size={16} /> Setor programado sem nenhum posto ativo
      </p>
      <p className="text-amber-900">
        O PCP programa <b>{setores.join(", ")}</b> e não há posto ativo ali — esse trabalho não
        aparece em terminal nenhum. Cadastre ao menos um posto, ou reative o que foi desligado.
      </p>
    </div>
  );
}

const celula = (reg, col) => {
  if (col === "setor") return reg.setor?.nome || "—";
  if (col === "planejada") return reg.planejada ? "planejada" : "não planejada";
  return reg[col] ?? "—";
};

function Tabela({ tipo, lista, aoEditar, aoAlternar, aoExcluir }) {
  if (!lista.length) {
    return <p className="text-torg-gray text-center py-10 bg-white rounded-xl border border-gray-100">
      Nenhum registro ainda.
    </p>;
  }
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
      <table className="w-full text-sm min-w-[640px]">
        <thead className="bg-gray-50/60 text-left text-torg-gray">
          <tr>
            {COLUNAS[tipo].map((c) => <th key={c} className="px-4 py-3 font-semibold capitalize">{c}</th>)}
            <th className="px-4 py-3 font-semibold">Uso</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {lista.map((reg) => (
            <tr key={reg.id} className={reg.ativo ? "" : "bg-gray-50/60 text-torg-gray"}>
              {COLUNAS[tipo].map((c) => (
                <td key={c} className="px-4 py-3">
                  {c === COLUNAS[tipo][0] ? <span className="font-mono">{celula(reg, c)}</span> : celula(reg, c)}
                  {c === COLUNAS[tipo][0] && !reg.ativo && (
                    <span className="ml-2 text-[11px] uppercase tracking-wide bg-gray-200 text-gray-600 rounded px-1.5 py-0.5">
                      inativo
                    </span>
                  )}
                </td>
              ))}
              <td className="px-4 py-3 tabular-nums">{reg.usos || "—"}</td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <Acao titulo="Editar" onClick={() => aoEditar(reg)}><Pencil size={16} /></Acao>
                  <Acao titulo={reg.ativo ? "Desativar" : "Reativar"} onClick={() => aoAlternar(reg)}>
                    <Power size={16} className={reg.ativo ? "" : "text-emerald-600"} />
                  </Acao>
                  {/* ⚠ O botão de excluir só existe para quem NUNCA foi usado. Mostrá-lo e deixar o
                      servidor recusar seria prometer o que não se cumpre. */}
                  {!reg.usos && (
                    <Acao titulo="Excluir" onClick={() => aoExcluir(reg)}>
                      <Trash2 size={16} className="text-red-500" />
                    </Acao>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const Acao = ({ titulo, onClick, children }) => (
  <button title={titulo} onClick={onClick}
          className="p-2 rounded-lg text-torg-gray hover:bg-gray-100 hover:text-torg-dark">
    {children}
  </button>
);
