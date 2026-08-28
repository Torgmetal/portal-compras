"use client";
import { useState } from "react";
import { Mail, Phone, UserRound, ChevronDown } from "lucide-react";
import { MATRIZ_COMUNICACAO, FOCAIS, iniciais, zap } from "@/lib/matriz-comunicacao";

// ─── FALE COM A TORG — a matriz de comunicação na abertura do portal ──────────
//
// Vitor (28/08/2026) desenhou seis modelos; este é o "Mural": todos os focais numa tela, filtro por
// setor, e o card abre para mostrar o escopo e as responsabilidades. É o formato certo para quem
// chega aqui com um problema: o cliente não quer navegar um organograma, quer um nome e um telefone.
//
// ⚠ O VISUAL É O DO PORTAL, não o do modelo. O desenho original é escuro; o portal do cliente é
// claro, navy e laranja — trocar o tema no meio da página faria a aba parecer outro site.
//
// ⚠ Contato aqui é LINK, não texto: e-mail abre o e-mail, telefone abre o WhatsApp. Metade dos
// acessos ao portal é no celular, e nele copiar um número escrito é o caminho para desistir.

const CHIP = "whitespace-nowrap rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors";

/** Avatar: a foto quando existe, as iniciais quando não — e as iniciais também se a foto falhar. */
function Avatar({ pessoa }) {
  const [erro, setErro] = useState(false);
  if (pessoa.foto && !erro) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={pessoa.foto} alt={pessoa.nome} onError={() => setErro(true)}
        className="shrink-0 w-11 h-11 rounded-full object-cover bg-gray-100" />
    );
  }
  return (
    <span className="shrink-0 w-11 h-11 rounded-full bg-[#0D1F3C] text-white grid place-items-center text-[13px] font-bold">
      {iniciais(pessoa.nome)}
    </span>
  );
}

export default function MatrizComunicacao() {
  const [filtro, setFiltro] = useState("TODOS");
  const [aberto, setAberto] = useState(null);

  const lista = filtro === "TODOS" ? FOCAIS : FOCAIS.filter((p) => p.setor === filtro);
  const setorDe = (nome) => MATRIZ_COMUNICACAO.find((s) => s.setor === nome);

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-[22px] font-bold text-[#0D1F3C]">Fale com a Torg</h2>
        <div className="h-[3px] w-12 bg-[#F4801F] rounded-full my-2" />
        <p className="text-[14px] text-gray-500">
          Quem atende o seu projeto em cada assunto — com o e-mail, o WhatsApp e quem responde na ausência.
        </p>
      </div>

      {/* filtro por setor */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        <button onClick={() => { setFiltro("TODOS"); setAberto(null); }}
          className={`${CHIP} ${filtro === "TODOS" ? "bg-[#0D1F3C] text-white" : "bg-gray-100 text-gray-600 hover:text-[#0D1F3C]"}`}>
          Todos
        </button>
        {MATRIZ_COMUNICACAO.map((s) => (
          <button key={s.setor} onClick={() => { setFiltro(s.setor); setAberto(null); }} title={s.resumo}
            className={`${CHIP} ${filtro === s.setor ? "bg-[#0D1F3C] text-white" : "bg-gray-100 text-gray-600 hover:text-[#0D1F3C]"}`}>
            {s.setor}
          </button>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {lista.map((p) => {
          const on = aberto === p.email;
          return (
            <div key={p.email + p.nome} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <button onClick={() => setAberto(on ? null : p.email)} className="w-full text-left p-4 hover:bg-gray-50/70">
                <div className="flex items-start gap-3">
                  <Avatar pessoa={p} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold text-[#0D1F3C] leading-tight">{p.nome}</p>
                    <p className="text-[12.5px] text-gray-500 mt-0.5">
                      {p.cargo} · <span className="text-[#F4801F] font-semibold">{p.setor}</span>
                    </p>
                  </div>
                  <ChevronDown size={16} className={`shrink-0 mt-1 text-gray-400 transition-transform ${on ? "rotate-180" : ""}`} />
                </div>

                {/* o escopo fica visível fechado: é o que responde "é com ele que eu falo?" */}
                {!!p.escopo?.length && (
                  <p className="text-[12.5px] text-gray-600 mt-2.5 leading-relaxed">{p.escopo.join(" · ")}</p>
                )}
              </button>

              <div className="px-4 pb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <a href={`mailto:${p.email}`} className="text-[12.5px] font-semibold text-[#006EAB] hover:underline inline-flex items-center gap-1.5">
                  <Mail size={13} /> {p.email}
                </a>
                {zap(p.tel) && (
                  <a href={zap(p.tel)} target="_blank" rel="noreferrer"
                    className="text-[12.5px] font-semibold text-[#006EAB] hover:underline inline-flex items-center gap-1.5">
                    <Phone size={13} /> {p.tel}
                  </a>
                )}
                {p.backup && (
                  <span className="text-[12px] text-gray-500 inline-flex items-center gap-1.5">
                    <UserRound size={13} className="text-gray-400" /> na ausência: <b className="font-semibold text-gray-600">{p.backup}</b>
                  </span>
                )}
              </div>

              {on && !!setorDe(p.setor)?.responsabilidades?.length && (
                <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-3">
                  <p className="text-[10.5px] font-bold uppercase tracking-wide text-gray-400 mb-2">
                    O que o {p.setor} responde
                  </p>
                  <ul className="space-y-1.5">
                    {setorDe(p.setor).responsabilidades.map((r) => (
                      <li key={r.titulo} className="text-[12.5px] leading-relaxed">
                        <b className="text-[#0D1F3C]">{r.titulo}</b>
                        <span className="text-gray-600"> — {r.texto}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[12px] text-gray-400">
        Não sabe por onde começar? Fale com o Comercial — ele encaminha internamente para o setor certo.
      </p>
    </section>
  );
}
