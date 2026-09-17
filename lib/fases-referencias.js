import {z} from 'zod';
const texto = z.string().trim();
export const fasesReferenciasSchema=z.object({
 empresas:z.array(texto.min(1,'Informe o nome da empresa.').max(60)).min(1).max(8),
 fases:z.array(z.object({fase:texto.min(1,'Informe a fase Torg.').max(30).transform(v=>v.toUpperCase()),descricao:texto.max(500),referencias:z.array(texto.max(150)).max(8)})).max(200),
}).superRefine((v,ctx)=>{
 if(new Set(v.empresas.map(x=>x.toUpperCase())).size!==v.empresas.length)ctx.addIssue({code:'custom',message:'Os nomes das empresas devem ser diferentes.'});
 if(new Set(v.fases.map(x=>x.fase)).size!==v.fases.length)ctx.addIssue({code:'custom',message:'Cada fase Torg deve aparecer uma única vez.'});
 if(v.fases.some(x=>x.referencias.length!==v.empresas.length))ctx.addIssue({code:'custom',message:'Confira as referências de cada empresa.'});
});
export function moverFase(fases,indice,direcao){
 const destino=indice+direcao;if(destino<0||destino>=fases.length)return fases;
 const nova=[...fases];[nova[indice],nova[destino]]=[nova[destino],nova[indice]];return nova;
}
export const EDITORES_FASES=['ADMIN','ENGENHARIA','PLANEJAMENTO','PCP'];
export const LEITORES_FASES=[...EDITORES_FASES,'COMERCIAL','PRODUCAO','QUALIDADE','COMPRAS','EXPEDICAO','FINANCEIRO','ALMOXARIFADO'];
