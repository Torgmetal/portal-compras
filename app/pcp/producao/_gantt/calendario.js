// ─── O CALENDÁRIO DO QUADRO ────────────────────────────────────────────────────────────────────
//
// ⚠ TUDO EM UTC. As datas do portal chegam como "YYYY-MM-DD" e são comparadas como string em vários
// pontos (`l.dia < HOJE`); usar o fuso local faria o dia virar no meio da tarde do Brasil.
//
// ⚠ `DIAS` INCLUI SÁBADO E DOMINGO. Não é um array de dias ÚTEIS — quem precisa contar trabalho tem
// de filtrar com `fdsISO`. Foi essa confusão que quase fez o atraso de uma sexta virar "3 dias" na
// segunda-feira.

export const d0 = (s)=>new Date(s+"T00:00:00Z");
export const isoD = (d)=>d.toISOString().slice(0,10);
export const DSEM = ["dom","seg","ter","qua","qui","sex","sáb"];
export const MES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];

export const nkg = (n)=>Math.round(n).toLocaleString("pt-BR");
export const n1 = (n)=>(Math.round(n*10)/10).toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:1});
export const dbr = (s)=>{const d=d0(s);return String(d.getUTCDate()).padStart(2,"0")+"/"+String(d.getUTCMonth()+1).padStart(2,"0");};

/** A régua de dias do quadro: 40 dias antes do primeiro lote até 90 depois do último. */
export function montarCalendario(LOTES, HOJE){
  // ⚠ SÁBADO E DOMINGO APARECEM. Matheus (05/09/2026): "coloque no gantt sábados e
  // domingo, caso for precisar trabalhar ser possível". Antes o calendário pulava o
  // fim de semana, e o que não tem coluna não pode receber uma barra — não havia como
  // programar um sábado nem para dizer que ele existe.
  //
  // Aparecer não é virar dia normal: a coluna vem sombreada, e a quebra em N dias
  // PULA o fim de semana (ver diasDaQuebra). Fim de semana é possível, nunca
  // automático — quem quiser trabalhar no sábado arrasta a barra para lá.
  const ehFimDeSemana = (d)=>{const w=d.getUTCDay();return w===0||w===6;};
  const fdsISO = (s)=>ehFimDeSemana(d0(s));
  const diasComDado = [...new Set(LOTES.map(l=>l.dia))].sort();
  const dIni = d0(diasComDado[0]||HOJE); dIni.setUTCDate(dIni.getUTCDate()-40);
  const dFim = d0(diasComDado[diasComDado.length-1]||HOJE); dFim.setUTCDate(dFim.getUTCDate()+90);
  const DIAS=[]; for(const d=new Date(dIni); d<=dFim; d.setUTCDate(d.getUTCDate()+1)) DIAS.push(isoD(d));
  const IDX = new Map(DIAS.map((s,i)=>[s,i]));

  // A coluna de dia útil a partir de i (o próprio i, se já for útil), usada pelo
  // empurrão automático de atrasos. O arraste manual respeita o dia escolhido pelo PCP.
  function encostaNoUtil(i){
    let k = Math.max(0, Math.min(DIAS.length-1, i));
    while(k < DIAS.length-1 && fdsISO(DIAS[k])) k++;
    return k;
  }

  // Os N dias que uma quebra ocupa a partir de uma coluna. Pula sábado e domingo,
  // porque "dividir em 3 dias" numa sexta significa sex/seg/ter para quem programa.
  // A exceção é começar NUM fim de semana: aí a escolha já foi deliberada e os dias
  // seguem corridos.
  function diasDaQuebra(ini, n){
    const corrido = fdsISO(DIAS[Math.min(DIAS.length-1, ini)]);
    const fora = [];
    for(let i=ini; i<DIAS.length && fora.length<n; i++){
      if(corrido || !fdsISO(DIAS[i])) fora.push(i);
    }
    while(fora.length && fora.length<n) fora.push(fora[fora.length-1]);
    return fora.length ? fora : [Math.min(DIAS.length-1, ini)];
  }


  return { DIAS, IDX, fdsISO, ehFimDeSemana, encostaNoUtil, diasDaQuebra };
}
