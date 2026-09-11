"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";


/**
 * A TELA DO CRACHÁ, COM VOLTA AUTOMÁTICA PARA AS BANCADAS.
 *
 * Matheus (11/09/2026): "se o operador não colocar o crachá em 10s fecha a tela e volta para as
 * bancadas". O totem fica aberto o turno inteiro: sem isso, quem passou e abriu um posto por
 * engano deixa a tela presa ali, e o próximo acha o posto errado esperando por ele.
 *
 * ⚠⚠ O RELÓGIO ZERA A CADA TECLA. Sem isso, quem digita a matrícula à mão (leitor com defeito,
 * crachá desmagnetizado) é jogado para fora NO MEIO da digitação — e a tela que deveria proteger o
 * posto vira a que impede de trabalhar. `valor` na dependência do efeito é o que faz isso.
 *
 * ⚠⚠ SÓ CORRE NA TELA DO CRACHÁ. O componente só existe quando não há operador reconhecido, então
 * a contagem nunca alcança quem está produzindo: sessão aberta com peça na máquina jamais é
 * abandonada por tempo.
 *
 * ⚠ A CONTAGEM APARECE nos últimos segundos. Tela que salta sozinha, sem aviso, se parece com
 * defeito — e o operador tenta de novo achando que travou.
 */
const SEGUNDOS_ATE_VOLTAR = 10;

export default function PedirCracha({ aoEnviar, ocupado, voltarPara }) {
  const [valor, setValor] = useState("");
  const [resta, setResta] = useState(SEGUNDOS_ATE_VOLTAR);
  const campo = useRef(null);
  const router = useRouter();

  useEffect(() => { campo.current?.focus(); }, []);

  // ⚠⚠ `router` NÃO ENTRA NAS DEPENDÊNCIAS DESTE EFEITO, e isso não é detalhe: `useRouter` pode
  // devolver um objeto novo a cada render, e com ele na lista o efeito se remonta sozinho, zera a
  // contagem e a tela NUNCA volta. O teste da contagem foi escrito antes e pegou exatamente isso.
  //
  // ⚠ Sem destino não há volta: totem preso a um posto de um setor que sumiu do cadastro ficaria
  // navegando para lugar nenhum a cada 10 segundos.
  useEffect(() => {
    if (!voltarPara || ocupado) return undefined;
    setResta(SEGUNDOS_ATE_VOLTAR);
    const relogio = setInterval(() => setResta((n) => n - 1), 1000);
    return () => clearInterval(relogio);
  }, [valor, voltarPara, ocupado]);

  // ⚠ A navegação vive num efeito separado porque é EFEITO COLATERAL: disparada de dentro do
  // atualizador do `setResta`, correria durante o render — o React avisa, e em modo estrito chega a
  // rodar duas vezes.
  useEffect(() => {
    if (resta <= 0 && voltarPara && !ocupado) router.push(voltarPara);
  }, [resta, voltarPara, ocupado, router]);

  return (
    <form className="max-w-lg mx-auto text-center pt-10"
          onSubmit={(e) => { e.preventDefault(); aoEnviar(valor.trim()); setValor(""); }}>
      <h2 className="text-2xl mb-6 text-white/80">Bipe o seu crachá</h2>
      <input ref={campo} value={valor} onChange={(e) => setValor(e.target.value)} disabled={ocupado}
             className="w-full text-center text-4xl tracking-[0.3em] bg-white/10 rounded-2xl px-6 py-6 outline-none focus:ring-4 ring-torg-blue/60"
             placeholder="• • • •" autoComplete="off" />
      <p className="text-white/40 text-sm mt-4">Ou digite a matrícula e aperte Enter.</p>
      {voltarPara && resta <= 5 && (
        <p className="text-amber-300/90 text-lg mt-5">Voltando para as bancadas em {resta}…</p>
      )}
    </form>
  );
}
