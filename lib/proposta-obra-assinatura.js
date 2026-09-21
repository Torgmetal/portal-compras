import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
const chave = () => process.env.PROPOSTA_CONSULTA_SECRET || process.env.AZURE_CLIENT_SECRET;
function mensagem(opId, arquivo, consulta) {
 return JSON.stringify({finalidade:'torg.proposta.consulta.v1',opId,arquivoId:arquivo.id,driveId:arquivo.driveId,versao:consulta.versao,sha256:consulta.sha256,conferidoEm:consulta.conferidoEm,conferidoPor:consulta.conferidoPor,secoes:consulta.secoes});
}
export function assinarConsultaProposta(opId,arquivo,consulta,segredo=chave()) {
 if(!segredo)throw new Error('Chave de conferência indisponível.');
 return createHmac('sha256',segredo).update(mensagem(opId,arquivo,consulta)).digest('hex');
}
export function assinaturaConsultaValida(opId,arquivo,segredo=chave()) {
 const c=arquivo?.consultaObra;
 if(!segredo||!c||typeof c.assinatura!=='string'||!/^[a-f0-9]{64}$/.test(c.assinatura))return false;
 const esperado=assinarConsultaProposta(opId,arquivo,c,segredo);
 return timingSafeEqual(Buffer.from(c.assinatura,'hex'),Buffer.from(esperado,'hex'));
}
