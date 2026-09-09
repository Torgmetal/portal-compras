import { cabecalhoEmail } from './email-layout';
import { escapeHtml } from './html';
import { urlBoletimSegura } from './cotacao-tinta-snapshot';
const esc=v=>escapeHtml(String(v??'—'));
const area=v=>Number(v||0).toLocaleString('pt-BR');
function linha(c) {
  const b=c.boletim, url=urlBoletimSegura(b?.url);
  return `<tr><td style="padding:9px;border-bottom:1px solid #e7ecf2"><strong>${esc(c.camada)}</strong><br>${esc(c.destino||'')}</td>
  <td style="padding:9px;border-bottom:1px solid #e7ecf2">${esc(c.produto||'Fornecedor deverá especificar')}${b?`<br><small>${esc(b.fabricante)} · revisão ${esc(b.revisao)}${url?` · <a href="${esc(url)}">${esc(b.nome||'Boletim técnico')}</a>`:''}</small>`:''}</td>
  <td style="padding:9px;border-bottom:1px solid #e7ecf2">${area(c.areaM2)} m²<br>${esc(c.perda)}% de perda</td>
  <td style="padding:9px;border-bottom:1px solid #e7ecf2">${esc(c.peliculaSeca)} µm<br>${esc(c.solidos)}% sólidos<br>${esc(c.cor)}</td></tr>`;
}
export function emailCotacaoTinta(fornecedor,s={},ctx={}) {
  const obra=ctx.obra||'obra em orçamento';
  const base=process.env.NEXT_PUBLIC_BASE_URL||'https://workspace.torg.com.br';
  const link=ctx.token?`${base}/consulta-tinta/${ctx.token}`:null;
  const camadas=(s.camadas||[]).map(c=>({...c,areaM2:c.areaM2??s.areaM2,perda:c.perda??s.perda??45}));
  const pedido='Informe o produto indicado, quantos galões de cada demão, diluente e componente B necessários, com o preço de cada item. Confirme cor, método de aplicação e compatibilidade entre os produtos do sistema. Quando não houver sugestão, especifique o produto que atende aos requisitos.';
  const html=`<div style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;color:#0D1F3C">
    ${cabecalhoEmail('Consulta técnica de tintas')}
    <div style="border:1px solid #e7ecf2;padding:24px;border-radius:0 0 10px 10px">
    <p>Olá <strong>${esc(fornecedor?.nome||'')}</strong>,</p><p>A Torg Metal está orçando a obra <strong>${esc(obra)}</strong> e solicita seu dimensionamento do sistema de pintura.</p>
    ${s.mensagem?`<p style="white-space:pre-wrap">${esc(s.mensagem)}</p>`:''}
    ${s.prazoResposta?`<p><strong>Responder até ${esc(s.prazoResposta.split('-').reverse().join('/'))}.</strong></p>`:''}
    <table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:#0D1F3C;color:white"><th style="padding:9px;text-align:left">Demão / destino</th><th style="padding:9px;text-align:left">Produto sugerido</th><th style="padding:9px;text-align:left">Área / perda</th><th style="padding:9px;text-align:left">Requisitos</th></tr></thead><tbody>${camadas.map(linha).join('')}</tbody></table>
    <p>${pedido}</p><p style="color:#5b6b7a;font-size:12px">A sugestão considera fabricante, tipo da demão, sólidos por volume e faixa de película do boletim conferido. A confirmação técnica final cabe ao fabricante.</p>
    ${link?`<p style="margin:25px 0"><a href="${esc(link)}" style="background:#006EAB;color:white;text-decoration:none;padding:13px 24px;border-radius:8px">Responder a consulta</a></p>`:'<p>A consulta enviada incluirá o link individual para resposta do fornecedor.</p>'}
    <p>Estamos em fase de orçamento: ainda não é um pedido de compra. Se preferir, responda este e-mail.</p>
    <p style="color:#5b6b7a;font-size:12px">Consulta ${esc(ctx.numero||'')}/${esc(ctx.ano||'')} · Engenharia Comercial — Torg Metal</p></div></div>`;
  return {subject:s.assunto||`Consulta de tintas — ${obra} · Torg Metal`,html,
    text:`Olá ${fornecedor?.nome||''}. Estamos orçando ${obra}. ${s.mensagem||''}\n${s.prazoResposta?`Responder até ${s.prazoResposta}.\n`:''}${camadas.map(c=>`${c.camada}: ${c.produto||'Fornecedor deverá especificar'}; ${area(c.areaM2)} m²; perda ${c.perda}%; película seca ${c.peliculaSeca} µm; sólidos ${c.solidos}%; cor ${c.cor||'a definir'}${c.boletim?`; boletim ${c.boletim.nome}, revisão ${c.boletim.revisao}, ${c.boletim.url}`:''}`).join('\n')}\n${pedido}\nAinda não é um pedido de compra.${link?` Responda em ${link}`:''}`};
}
