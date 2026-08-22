"use client";
import { useEffect, useState } from "react";
import { Ruler, AlertCircle, Loader2, Check, Search } from "lucide-react";
import { instrumentosDoTipo, FONTE_POR_TIPO } from "@/lib/instrumentos-por-relatorio";

// ─── OS INSTRUMENTOS DO ENSAIO, NO COMPUTADOR ─────────────────────────────────
// Vitor (22/08/2026): "não são todos os relatórios que você está deixando o campo para
// selecionarmos os equipamentos calibrados para mencionar no relatório".
//
// No celular o seletor já existia; aqui a tela só MOSTRAVA o que tinha sido escolhido
// lá. Relatório montado na mesa — que é como o de LP e o de pintura costumam nascer —
// saía com o bloco de instrumentos vazio. Ensaio que não diz com o que foi medido não
// vale como registro: é a primeira coisa que um auditor cobra.
//
// A lista vem do módulo de Calibração, a mesma dos certificados. Nada de segundo
// cadastro: instrumento em duas listas é instrumento que some de uma delas quando o
// certificado é renovado.
//
// ⚠ VENCIDO NÃO ENTRA NA LISTA. Eu tinha defendido o contrário — mostrar marcado em
// vermelho, para o inspetor não medir com ele e deixar de registrar. Vitor (22/08/2026)
// decidiu tirar: "os vencidos não listar, já vamos resolver essa questão". A razão dele
// é mais forte — a lista existe para escolher o que USAR.
//
// O alerta de vencido no que JÁ foi escolhido continua: relatório antigo pode ter um
// instrumento que venceu depois, e isso o documento tem de dizer.
export default function Equipamentos({ escolhidos = [], onMudar, travado, tipo = null }) {
  const [lista, setLista] = useState(null);
  const [abrir, setAbrir] = useState(false);
  const [q, setQ] = useState("");
  // ⚠ FILTRO, NÃO TRAVA. Vitor (22/08/2026): "deixar apenas os instrumentos necessários
  // listados nos procedimentos de cada relatório, assim evita o erro de colocar
  // equipamentos que não deveria". A lista de calibração é da fábrica inteira — tem
  // máquina de solda e alicate voltímetro, que não medem nada num relatório de inspeção.
  // Mas uma obra pode exigir algo que o procedimento não previu, e bloquear faria o
  // inspetor não registrar nada: por isso "ver todos" fica a um clique.
  const [todos, setTodos] = useState(false);

  useEffect(() => {
    if (!abrir || lista) return;
    fetch("/api/campo/equipamentos").then((r) => r.json())
      .then((j) => setLista(j.equipamentos || []))
      .catch(() => setLista([]));
  }, [abrir, lista]);

  const marcados = new Set(escolhidos.map((e) => e.id));
  const temVencido = escolhidos.some((e) => e.vencido);
  const alternar = (eq) =>
    onMudar(marcados.has(eq.id) ? escolhidos.filter((x) => x.id !== eq.id) : [...escolhidos, eq]);

  const doProcedimento = tipo && !todos ? instrumentosDoTipo(lista || [], tipo) : (lista || []);
  const filtrada = doProcedimento.filter((e) => !q || e.nome.toLowerCase().includes(q.toLowerCase()));
  const escondidos = (lista || []).length - doProcedimento.length;

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <p className="text-[12px] font-bold text-torg-dark inline-flex items-center gap-1.5">
          <Ruler size={13} className="text-torg-blue" /> Instrumentos utilizados
          {escolhidos.length > 0 && <span className="text-torg-gray font-normal">· {escolhidos.length}</span>}
        </p>
        {!travado && (
          <button onClick={() => setAbrir((v) => !v)}
            className="text-[11px] font-semibold text-torg-blue border border-torg-blue-300 rounded-lg px-2.5 py-1 hover:bg-torg-blue-50">
            {abrir ? "fechar" : escolhidos.length ? "trocar" : "escolher"}
          </button>
        )}
      </div>

      {escolhidos.length ? (
        <div className="space-y-0.5">
          {escolhidos.map((e) => (
            <p key={e.id || e.nome} className="text-[11px] text-torg-gray">
              <span className="text-torg-dark font-medium">{e.nome}</span>
              {/* ⚠ SÓ O CERTIFICADO. Vitor (22/08/2026): "a validade não há necessidade, apenas o
                  certificado". O aviso de VENCIDO fica: ele não é uma data, é um impedimento —
                  medir com instrumento fora de calibração invalida o ensaio. */}
              {" · "}cert {e.certificado || "—"}
              {e.vencido && <span className="text-red-600 font-semibold"> · VENCIDO</span>}
            </p>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-torg-gray">
          Nenhum instrumento selecionado — o relatório sai sem dizer com o que foi medido.
        </p>
      )}

      {temVencido && (
        <p className="mt-2 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5 inline-flex items-start gap-1.5">
          <AlertCircle size={13} className="mt-px shrink-0" />
          Instrumento com calibração VENCIDA selecionado — o relatório vai registrar isso.
        </p>
      )}

      {abrir && (
        <div className="mt-2 border-t border-gray-100 pt-2">
          <div className="relative mb-1.5">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-torg-gray" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="buscar instrumento…"
              className="w-full text-[12px] border border-gray-200 rounded-lg pl-6 pr-2 py-1.5 focus:border-torg-blue outline-none" />
          </div>
          {tipo && FONTE_POR_TIPO[tipo] && (
            <p className="text-[10px] text-torg-gray mb-1.5">
              {todos
                ? "Todos os instrumentos calibrados em dia."
                : <>Instrumentos previstos no procedimento — {FONTE_POR_TIPO[tipo]}. Marque um ou mais.</>}
              {(escondidos > 0 || todos) && (
                <button onClick={() => setTodos((v) => !v)} className="ml-1.5 font-semibold text-torg-blue hover:underline">
                  {todos ? "só os do procedimento" : `ver todos (+${escondidos})`}
                </button>
              )}
            </p>
          )}
          {lista === null ? (
            <p className="text-[11px] text-torg-gray inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> carregando…</p>
          ) : (
            <div className="max-h-56 overflow-y-auto divide-y divide-gray-50">
              {filtrada.map((e) => {
                const on = marcados.has(e.id);
                return (
                  <button key={e.id} onClick={() => alternar(e)}
                    className={`w-full text-left flex items-center gap-2 px-1.5 py-1.5 hover:bg-gray-50 ${on ? "bg-torg-blue-50" : ""}`}>
                    <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${on ? "bg-torg-blue border-torg-blue" : "border-gray-300"}`}>
                      {on && <Check size={10} className="text-white" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] text-torg-dark truncate">{e.nome}</span>
                      <span className="block text-[10px] text-torg-gray">cert {e.certificado || "—"}</span>
                    </span>
                  </button>
                );
              })}
              {!filtrada.length && <p className="text-[11px] text-torg-gray py-2">Nenhum instrumento encontrado.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
