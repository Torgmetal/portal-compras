import React from "react";
import Link from "next/link";
import { ArrowRight, User } from "lucide-react";
import { visualDo } from "../../[codigo]/estado-visual";

// ─── O CARD DE UMA BANCADA ────────────────────────────────────────────────────
//
// ⚠⚠ ESCRITA GRANDE PORQUE A DISTÂNCIA É GRANDE. Matheus (11/09/2026): "deixe com visual mais bonito
// as bancadas e escritas grandes". Não é estética: o monitor fica na parede ou na bancada, e quem
// procura o próprio nome está de luva, a dois metros, com a máquina ligada.
//
// ⚠ Em arquivo `.jsx` separado da página (que é `.js`) porque o teste precisa importá-lo: o Next
// transforma JSX em `.js`, o Vitest não.

/**
 * ⚠ O CARD INTEIRO É O BOTÃO, com alvo de toque alto (~150 px). Dedo de luva não acerta link de
 * texto, e errar aqui significa abrir o posto do vizinho e apontar produção no nome dele.
 */
export default function Bancada({ recurso, cor, sessao, estado, operador }) {
  const { rotulo, fundo } = visualDo(estado);
  const emUso = Boolean(sessao);

  // ⚠ O ambiente viaja no link: sem ele, a bancada de DEMO abriria o posto de PROD de mesmo
  // código (achado do Codex, 22/09/2026).
  return (
    <Link href={`/mes-lab/totem/${encodeURIComponent(recurso.codigo)}?ambiente=${recurso.ambiente || "PROD"}`}
          className={`group relative overflow-hidden rounded-3xl border transition active:scale-[0.99] flex flex-col justify-between min-h-[170px] p-7 ${
            emUso
              ? "bg-white/[0.07] border-white/20 hover:bg-white/[0.12]"
              : "bg-white/[0.04] border-white/10 hover:bg-white/[0.10] hover:border-white/25"
          }`}>
      {/* Trilho da cor do setor, à esquerda: dá identidade sem competir com o nome. */}
      <span className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: emUso ? cor : "transparent" }} />

      <div className="flex items-start justify-between gap-4">
        <span className="text-4xl md:text-5xl font-extrabold leading-none tracking-tight break-words">
          {recurso.nome}
        </span>
        {/* ⚠ Só a bancada EM USO carrega selo: em todas, vira ruído que se aprende a ignorar. */}
        {emUso && (
          <span className={`${fundo} text-sm font-bold uppercase tracking-wide rounded-full px-3.5 py-1.5 shrink-0`}>
            {rotulo}
          </span>
        )}
      </div>

      {emUso ? (
        <div className="mt-5">
          <span className="flex items-center gap-2 text-xl text-white/60">
            <User size={20} /> {operador || "em uso"}
          </span>
          <span className="block text-3xl font-bold text-white/95 truncate">
            {sessao.marca || "sem marca"}
            {sessao.opNumero && <span className="text-white/45 font-normal text-xl"> · obra {sessao.opNumero}</span>}
          </span>
        </div>
      ) : (
        <span className="mt-5 flex items-center gap-2 text-2xl text-emerald-300/90 font-semibold">
          Livre
          <ArrowRight size={24} className="opacity-0 group-hover:opacity-100 transition" />
        </span>
      )}
    </Link>
  );
}
