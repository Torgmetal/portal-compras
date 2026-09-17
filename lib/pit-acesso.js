import 'server-only';
import {requireUser} from './session';
import {temAcessoDiretoria} from './diretoria';
export async function podeGerenciarPit(user){return (user?.modulos||[]).includes('QUALIDADE') || await temAcessoDiretoria(user?.email);}
export async function requireGestaoPit(){const user=await requireUser();if(!await podeGerenciarPit(user))throw Error('Forbidden');return user;}

export async function requireConsultaPit(){const user=await requireUser();const setores=['QUALIDADE','COMERCIAL','ENGENHARIA','PLANEJAMENTO','PCP','PRODUCAO','COMPRAS','EXPEDICAO','FINANCEIRO','ALMOXARIFADO'];if(user.tipo==='ADMIN'||(user.modulos||[]).some(m=>setores.includes(m))||await temAcessoDiretoria(user.email))return user;throw Error('Forbidden');}
