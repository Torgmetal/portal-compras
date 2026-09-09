// Compartilhado entre seleção visual e servidor. Dados técnicos não conferidos nunca indicam produto.
const txt = (v, max = 160) => String(v ?? '').trim().slice(0, max);
const chave = (v) => txt(v).normalize('NFKC').toLocaleUpperCase('pt-BR');
const tipo = (v) => ({ INTERMEDIARIO:'INTERMEDIARIA', 'INTERMEDIÁRIO':'INTERMEDIARIA', 'INTERMEDIÁRIA':'INTERMEDIARIA', 'DEMÃO ÚNICA':'UNICA', 'ÚNICA':'UNICA' }[chave(v)] || chave(v));
export function urlBoletimSegura(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; } catch { return null; }
}
export function candidatosBoletim(fornecedor, dem, boletins = []) {
  if (!fornecedor?.fabricanteTinta || !(Number(dem.solidos) > 0) || !(Number(dem.peliculaSeca) > 0)) return [];
  const etapa = tipo(dem.tipo || dem.camada);
  return boletins.filter(b => b.ativo && b.conferidoEm && b.boletimRevisao && urlBoletimSegura(b.boletimUrl)
    && b.categoria === 'TINTA' && chave(b.fabricante) === chave(fornecedor.fabricanteTinta)
    && tipo(b.tipo) === etapa && Number(b.solidosVol) === Number(dem.solidos)
    && Number(b.secaMin) > 0 && Number(b.secaMax) >= Number(b.secaMin)
    && Number(dem.peliculaSeca) >= Number(b.secaMin) && Number(dem.peliculaSeca) <= Number(b.secaMax));
}
function numero(v, campo, min, max) {
  const n = v === '' || v == null ? NaN : Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${campo} inválido.`);
  return n;
}
function requisitos(c, s, i, estrito) {
  const val = (v, nome, min, max) => estrito ? numero(v,nome,min,max) : (Number.isFinite(Number(v)) ? Number(v) : null);
  return {
    id: txt(c.id || `demao-${i+1}`,80), camada: txt(c.camada || `Demão ${i+1}`,80), tipo: tipo(c.tipo || c.camada),
    areaM2: val(c.areaM2 ?? s.areaM2,'Área da demão',0.0001,1e10),
    peliculaSeca: val(c.peliculaSeca,'Película seca',0.0001,10000), solidos: val(c.solidos,'Sólidos por volume',0.0001,100),
    perda: val(c.perda ?? s.perda ?? 45,'Perda da demão',0,99.99), cor: txt(c.cor,120), destino: txt(c.destino,300),
  };
}
export function criarSnapshotTinta(fornecedor, entrada, boletins = [], escolhas = {}) {
  if (!Array.isArray(entrada.camadas) || !entrada.camadas.length || entrada.camadas.length > 40) throw new Error('Selecione entre 1 e 40 demãos.');
  const camadas = entrada.camadas.map((c,i)=>{
    const d = requisitos(c,entrada,i,true);
    const candidatos = candidatosBoletim(fornecedor,d,boletins);
    const escolha = escolhas[`${fornecedor.id}:${d.id}`];
    const b = escolha === 'fornecedor' ? null : escolha ? candidatos.find(x=>x.id===escolha) : candidatos[0];
    if (escolha && escolha !== 'fornecedor' && !b) throw new Error(`O boletim escolhido para ${d.camada} não corresponde ao fabricante e aos requisitos atuais.`);
    return { ...d, produto: b?.produto || 'Fornecedor deverá especificar', solicitarEspecificacao: !b,
      boletim: b ? { id:b.id, fabricante:b.fabricante, produto:b.produto, revisao:b.boletimRevisao, data:b.boletimData || null,
        url:urlBoletimSegura(b.boletimUrl), nome:b.boletimNome, solidosVol:b.solidosVol, secaMin:b.secaMin, secaMax:b.secaMax,
        conferidoEm:b.conferidoEm, tipo:b.tipo } : null };
  });
  if (new Set(camadas.map(c=>c.id)).size !== camadas.length) throw new Error('Há demãos repetidas na seleção.');
  const prazoResposta=txt(entrada.prazoResposta,10);
  if (prazoResposta && !/^\d{4}-\d{2}-\d{2}$/.test(prazoResposta)) throw new Error('Prazo de resposta inválido.');
  return { versao:2, areaM2:Math.max(...camadas.map(c=>c.areaM2)), fabricante:txt(fornecedor.fabricanteTinta,80) || null,
    prazoResposta, assunto:txt(entrada.assunto,200).replace(/[\r\n]/g,' '), mensagem:txt(entrada.mensagem,4000), camadas };
}
// Links anteriores não têm snapshot por destinatário. Expor somente requisitos nesses registros.
export function snapshotPublicoTinta(fornecedor) {
  if (fornecedor.snapshot?.versao === 2) return fornecedor.snapshot;
  const s = fornecedor.cotacao?.snapshot || {};
  return { areaM2:Number(s.areaM2) || 0, camadas:(Array.isArray(s.camadas)?s.camadas:[]).map((c,i)=>({
    ...requisitos(c,s,i,false), produto:'Fornecedor deverá especificar', solicitarEspecificacao:true, boletim:null,
  })) };
}
