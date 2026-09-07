import {describe,it,expect} from 'vitest';
import {saldosTerceiro,validarRetorno,statusRetorno,conferirImportacao} from '@/lib/terceiros-retorno';
import {previsoesTerceiro,lotesRecebidosTerceiro} from '@/lib/terceiros-previsao';
const rom={id:'r1',numero:1,opRefNumero:'097',status:'PARCIAL',dataPrevRetorno:'2026-09-10',itens:[{marca:'M1',qte:10,pesoTotal:100,destino:'SOLDA'}],retornos:[{id:'rt1',itens:[{marca:'M1',qte:3,pesoTotal:30,destino:'MONTAGEM',producaoInicio:20}],pesoKg:30}]};
describe('retorno conciliado por quantidade',()=>{
 it('mantém saldo parcial e deriva o peso da remessa',()=>{expect(saldosTerceiro(rom)[0].saldo).toBe(7);expect(validarRetorno(rom,[{marca:' m1 ',qte:2,destino:'PINTURA'}])[0]).toMatchObject({qte:2,pesoTotal:20,destino:'PINTURA'});expect(statusRetorno(rom)).toBe('PARCIAL')});
 it('não recebe marca desconhecida, repetida ou quantidade acima do saldo',()=>{for(const itens of [[{marca:'M2',qte:1}],[{marca:'M1',qte:8}],[{marca:'M1',qte:2},{marca:'M1',qte:2}],[{marca:'M1',qte:-1}],[{marca:'M1',qte:1.2}]])expect(()=>validarRetorno(rom,itens)).toThrow()});
 it('exige conferir retornos legados sem quantidade',()=>{const old={...rom,retornos:[{itens:[{marca:'M1',pesoTotal:30}]}]};expect(saldosTerceiro(old)[0].saldo).toBeNull();expect(()=>validarRetorno(old,[{marca:'M1',qte:1}])).toThrow()});
 it('conclui por unidades mesmo com peso zero',()=>{expect(statusRetorno({...rom,itens:[{marca:'M1',qte:3,pesoTotal:0}]})).toBe('RETORNADO')});
 it('não cruza a mesma marca de outra OP e sinaliza documento repetindo marcas',()=>{const result=conferirImportacao([{op:'OP-097',marca:'M1',qte:2},{op:'98',marca:'M1',qte:1},{op:'097',marca:'M1',qte:1}],rom);expect(result[0].erro).toBe('');expect(result[1].erro).toContain('OP');expect(result[2].erro).toContain('repetida')});
 it('Gantt prevê só saldo, sem bancada e sem custo de produção',()=>{const [l]=previsoesTerceiro([rom]);expect(l).toMatchObject({setor:'SOLDA',recurso:null,pecas:7,kg:70,custo:0,terceiroPrevisto:true,dia:'2026-09-10'});expect(previsoesTerceiro([{...rom,status:'CANCELADO'}])).toHaveLength(0)});
 it('inclui a previsão de Expedição sem criar produção industrial',()=>{const r={...rom,itens:[{...rom.itens[0],destino:'EXPEDICAO'}]};expect(previsoesTerceiro([r])[0].setor).toBe('EXPEDICAO');expect(lotesRecebidosTerceiro([{...r,retornos:[{itens:[{marca:'M1',qte:3,destino:'EXPEDICAO',producaoInicio:0}]}]}],'2026-09-07')).toHaveLength(0)});
 it('recebido vai ao seu destino e só aponta produção posterior ao recebimento',()=>{const [l]=lotesRecebidosTerceiro([rom],'2026-09-07',()=>21);expect(l).toMatchObject({setor:'MONTAGEM',pecas:3,feitas:1});expect(lotesRecebidosTerceiro([rom],'2026-09-07',()=>23)).toHaveLength(0)});
 it('não oferece no Gantt retornos históricos sem referência de produção',()=>{expect(lotesRecebidosTerceiro([{...rom,retornos:[{itens:[{marca:'M1',qte:3,destino:'SOLDA'}]}]}],'2026-09-07')).toHaveLength(0)});
});
