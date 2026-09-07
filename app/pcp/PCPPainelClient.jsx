'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, RefreshCw, CalendarRange, ChevronLeft } from 'lucide-react';
import PCPDashboardClient from './PCPDashboardClient';
import { resumoPainel } from '@/lib/pcp-painel-resumo';
import { MAQUINA_LABEL } from '@/lib/maquina-corte';
import s from './painel.module.css';

const n = v => v == null ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const t = v => v == null ? '—' : `${n(v / 1000)} t`;
const date = v => v ? new Date(v.length === 10 ? `${v}T12:00:00` : v).toLocaleDateString('pt-BR') : 'Sem data';
const alertas = { SEM_LISTA: 'Lista de peças pendente', PRODUZINDO_SEM_LISTA: 'Produção sem lista completa', SEM_DETALHE_CORTE: 'Detalhamento de corte pendente', SEM_CRONOGRAMA: 'Cronograma pendente', NADA_LANCADO: 'Aguardando lançamento' };
function Section({ number, title, children, id, aside }) {
  return <section className={s.panel} id={id}><div className={s.section}><h2><span>{number}</span>{title}</h2>{aside}</div>{children}</section>;
}
export default function PCPPainelClient({ isAdmin }) {
  const [fontes, setFontes] = useState({});
  const [erros, setErros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detalhe, setDetalhe] = useState(false);
  const carregar = useCallback(async (signal) => {
    setLoading(true);
    const entries = [['producao', '/api/pcp/producao', 'Programação'], ['corte', '/api/pcp/painel-corte', 'Corte']];
    const resultados = await Promise.allSettled(entries.map(async ([, url]) => {
      const res = await fetch(url, { cache: 'no-store', signal });
      if (!res.ok) throw new Error('Falha ao consultar');
      return res.json();
    }));
    if (signal?.aborted) return;
    const dados = {}, falhas = [];
    resultados.forEach((r, i) => { if (r.status === 'fulfilled') dados[entries[i][0]] = r.value; else falhas.push(entries[i][2]); });
    setFontes(dados); setErros(falhas); setLoading(false);
  }, []);
  useEffect(() => { const controller = new AbortController(); carregar(controller.signal); return () => controller.abort(); }, [carregar]);
  const r = resumoPainel(fontes.producao, fontes.corte);
  const maxKg = Math.max(1, ...r.etapas.map(e => e.kg || 0));
  const corte = fontes.corte;
  if (detalhe) return <><button className={s.back} onClick={() => { setDetalhe(false); carregar(); }}><ChevronLeft size={16}/> Voltar à visão geral</button><PCPDashboardClient isAdmin={isAdmin}/></>;
  return <div className={s.root} aria-busy={loading}>
    <header className={s.top}><div><p className={s.eyebrow}>PCP / VISÃO OPERACIONAL</p><h1>Painel da produção</h1><p>Do corte à pintura. Prioridades, pendências e próximas liberações.</p></div>
      <div className={s.actions}><button disabled={loading} onClick={() => carregar()}><RefreshCw size={15}/>{loading ? 'Atualizando…' : 'Atualizar'}</button><Link className={s.primary} href="/pcp/producao"><CalendarRange size={16}/> Programação</Link></div></header>
    <nav className={s.tabs} aria-label="Seções do painel"><a href="#visao-pcp">Visão geral</a><a href="#fluxo-pcp">Fluxo da fábrica</a><a href="#prioridades-pcp">Prioridades</a><button onClick={() => setDetalhe(true)}>Detalhamento do corte</button></nav>
    {erros.length > 0 && <p role="alert" className={s.warning}>Não foi possível carregar: {erros.join(', ')}. Os indicadores dessa fonte estão indisponíveis. Tente atualizar.</p>}
    <div className={s.metrics} id="visao-pcp">
      <article><small>Obras com prazo vencido</small><strong className={r.atrasadas > 0 ? s.red : ''}>{n(r.atrasadas)}</strong><p>Entre as obras liberadas ao PCP</p></article>
      <article><small>Maior carga no corte</small><strong>{r.maiorCarga ? n(r.maiorCarga.diasCarga) : '—'} <em>{r.maiorCarga ? 'dias' : ''}</em></strong><p>{r.maiorCarga ? MAQUINA_LABEL[r.maiorCarga.maquina] || r.maiorCarga.maquina : 'Sem capacidade disponível para estimar'}</p></article>
      <article><small>Material indisponível no corte</small><strong>{t(r.indisponivelKg)}</strong><p>Peso das peças pendentes de material</p></article>
    </div>
    <Section number="01" title="Fluxo da fábrica" id="fluxo-pcp" aside={<small>Saldo das obras liberadas</small>}>
      <div className={s.flows}>{r.etapas.map((e, i) => <Link href={e.href} key={e.key} className={e.kg > 0 && e.kg === maxKg ? s.hot : ''}><div className={s.flowTop}><b>{e.label}</b><span>0{i+1}</span></div><small>A concluir na etapa</small><strong>{t(e.kg)}</strong><div className={s.track}><i style={{width: `${(e.kg || 0) / maxKg * 100}%`}}/></div><p>Consultar fila <ArrowUpRight size={13}/></p></Link>)}</div>
      <p className={s.legend}>O saldo inclui peças que ainda dependem de etapas anteriores. Consulte cada fila para ver o que já pode avançar. Os pesos das etapas não devem ser somados.</p>
    </Section>
    <div className={s.columns}>
      <Section number="02" title="Atenção do dia" id="prioridades-pcp" aside={<Link href="/pcp/producao">Ver obras ↗</Link>}>
        {!r.prioridades ? <p className={s.empty}>{loading ? 'Carregando prioridades…' : 'Prioridades indisponíveis.'}</p> : !r.prioridades.length ? <p className={s.empty}>Nenhum atraso ou alerta nas obras liberadas.</p> : <div className={s.scroll}><table><thead><tr><th>OBRA</th><th>PONTO DE ATENÇÃO</th><th>ENTREGA</th></tr></thead><tbody>{r.prioridades.slice(0,6).map(o => <tr key={o.opId}><td><b>OP {o.opNumero}</b><small>{o.obra || o.cliente}</small></td><td>{o.atrasoDias > 0 && <span className={s.badge}>{o.atrasoDias} dias de atraso</span>}<small>{(o.alertas || []).map(a => alertas[a] || a).join(' · ')}</small></td><td>{date(o.entrega)}</td></tr>)}</tbody></table>{r.prioridades.length > 6 && <p className={s.legend}>Mostrando 6 de {r.prioridades.length} obras com alertas.</p>}</div>}
      </Section>
      <Section number="03" title="Ritmo do corte" aside={<button onClick={() => setDetalhe(true)}>Ver detalhe ↗</button>}>
        <div className={s.target}><span>Realizado no mês</span><strong>{t(corte?.mes?.cortadoKg)}</strong></div>
        <div className={s.progress}><i style={{width: `${Math.min(100, Math.max(0, corte?.mes?.pctMeta || 0))}%`}}/></div>
        <div className={s.targetFoot}><span>{n(corte?.mes?.pctMeta)}% da meta</span><span>Meta {t(corte?.meta?.kgMes)}</span></div>
        <div className={s.fact}><span>Projeção do mês</span><b>{t(corte?.mes?.projecaoKg)}</b></div><div className={s.fact}><span>Peças com corte atrasado</span><b>{n(corte?.carteira?.fila?.atrasadas?.pecas)}</b></div><div className={s.fact}><span>Sem programação de corte</span><b>{n(corte?.carteira?.fila?.semProgramacao?.pecas)}</b></div>
        <p className={s.legend}>Meta e projeção mantêm os critérios do painel de corte.</p>
      </Section>
    </div>
    <Section number="04" title="Programação liberada" aside={<Link href="/pcp/producao">Abrir programação e Gantt ↗</Link>}>
      {!r.programacoes ? <p className={s.empty}>{loading ? 'Carregando programação…' : 'Programação indisponível.'}</p> : !r.programacoes.length ? <p className={s.empty}>Nenhuma liberação do Planejamento para o PCP.</p> : <div className={s.scroll}><table><thead><tr><th>DIA PROGRAMADO</th><th>OBRA / FRENTE</th><th>PRIORIDADE</th><th>PESO LIBERADO</th></tr></thead><tbody>{r.programacoes.slice(0,8).map((l,i) => <tr key={l.id || i}><td><span className={s.day}>{date(l.dataProgramada)}</span></td><td><b>OP {l.opNumero}</b><small>{l.frente || l.obra || 'Frente não informada'}</small></td><td>{l.prioridade || '—'}</td><td>{t(l.totalKg)}</td></tr>)}</tbody></table>{r.programacoes.length > 8 && <p className={s.legend}>Mostrando 8 de {r.programacoes.length} liberações. A lista completa está na programação.</p>}</div>}
      <p className={s.legend}>As datas representam a programação do Planejamento. A execução é confirmada pelos apontamentos da fábrica.</p>
    </Section>
    <footer className={s.footer}><span>PCP · Planejamento e controle da produção</span><span>Última conciliação do corte: {corte?.ultimaBaixa?.em ? new Date(corte.ultimaBaixa.em).toLocaleString('pt-BR') : 'não disponível'}</span></footer>
  </div>;
}
