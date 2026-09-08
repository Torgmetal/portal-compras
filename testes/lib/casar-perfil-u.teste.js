import {describe,it,expect} from 'vitest';
import {casarPerfilComOmie} from '@/lib/casar-omie';
// entradas reais do CMR das OPs 112 e 113
const CMR = [
 "PERFIL DOBRADO UDCE 150x75x20x4,75", "PERFIL DOBRADO UDCE 200x75x25x3,00",
 "PERFIL DOBRADO UDCE 200x75x25x2,25", "PERFIL DOBRADO UDCE 200x75x28x3,75",
 "PERFIL DOBRADO UDC 200x50x3,75", "PERFIL DOBRADO UDC 75x38x2,25",
 'PERFIL U LAMINADO 4" - 1 ALMA X 7,95KG/M',
].map(descricao => ({ codigo: null, descricao }));
const casa = (pf) => casarPerfilComOmie(pf, CMR)?.descricao ?? null;

describe('perfil U dobrado × CMR', () => {
 it('reconhece o UE da Engenharia como o UDCE do fornecedor', () => {
  expect(casa('UE150X75X20X4.75')).toBe('PERFIL DOBRADO UDCE 150x75x20x4,75');
  expect(casa('UE200X75X25X3.00')).toBe('PERFIL DOBRADO UDCE 200x75x25x3,00');
 });
 it('aceita a vírgula do CMR contra o ponto da lista', () => {
  expect(casa('UDCE200X75X25X2.25')).toBe('PERFIL DOBRADO UDCE 200x75x25x2,25');
 });
 it('exige a ESPESSURA no enrijecido — 3,00 não pode pegar o fardo de 4,75', () => {
  expect(casa('UE150X75X20X3.00')).toBeNull();
 });
 it('exige o ENRIJECEDOR igual, fora dos pares nomeados', () => {
  // 150x75 não tem equivalência: ali o lábio 20 é o que a casa compra de verdade
  const so25 = [{ codigo: null, descricao: 'PERFIL DOBRADO UDCE 150x75x25x4,75' }];
  expect(casarPerfilComOmie('UE150X75X20X4.75', so25)).toBeNull();
 });
 it('não confunde enrijecido com simples: UDCE nunca casa em UDC', () => {
  expect(casa('U200X50X3.75')).toBe('PERFIL DOBRADO UDC 200x50x3,75');
  expect(casa('UE200X50X20X3.75')).toBeNull();
 });
 it('mantém o U laminado em polegada, que casa por bitola + peso linear', () => {
  expect(casa('U4"X7.95')).toBe('PERFIL U LAMINADO 4" - 1 ALMA X 7,95KG/M');
 });
});

describe('lábio equivalente na seção 200x75 (par nomeado)', () => {
 it('libera o 20 da lista contra o 25 que a casa sempre comprou', () => {
  expect(casa('UE200X75X20X3.00')).toBe('PERFIL DOBRADO UDCE 200x75x25x3,00');
  expect(casa('UE200X75X20X2.25')).toBe('PERFIL DOBRADO UDCE 200x75x25x2,25');
 });
 it('não estende a equivalência para outras seções', () => {
  const outra = [{codigo:null, descricao:'PERFIL DOBRADO UDCE 200x100x30x3,00'}];
  expect(casarPerfilComOmie('UE200X100X20X3.00', outra)).toBeNull();
 });
 it('a espessura continua dura mesmo com o lábio equivalente', () => {
  expect(casa('UE200X75X20X4.75')).toBeNull();  // não existe 4,75 nessa seção no CMR das obras
  expect(casa('UE150X75X20X3.00')).toBeNull();
 });
 it('o 28 fica de fora — é uma entrada só, não é padrão da casa', () => {
  const so28 = [{codigo:null, descricao:'PERFIL DOBRADO UDCE 200x75x28x3,75'}];
  expect(casarPerfilComOmie('UE200X75X20X3.75', so28)).toBeNull();
 });
});
