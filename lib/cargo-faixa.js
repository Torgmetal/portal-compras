/* Faixa salarial do cargo (Plano de Cargos e Salários — VMI/TORG).
   Vitor (08/09/2026): "na aba de cargos deixar salário base, médio e máximo".

   ⚠ `salarioBase` é o PISO da faixa, não o salário do cargo. O nome vem de antes de a faixa
   existir e ficou por causa do import, do modelo em Excel e das telas que já o usam — renomear a
   coluna quebraria os três sem melhorar nada para quem preenche.

   ⚠ A faixa é uma escada. Médio fora dela transforma o enquadramento num número solto: quem fosse
   promovido cairia num valor que a própria faixa nega. Só compara o que veio preenchido — cargo
   sem faixa definida continua válido, porque a maior parte do cadastro ainda só tem o piso. */
export function faixaForaDeOrdem({ salarioBase: b, salarioMedio: m, salarioMaximo: x } = {}) {
  if (b != null && m != null && m < b) return "O salário médio não pode ser menor que o base.";
  if (m != null && x != null && x < m) return "O salário máximo não pode ser menor que o médio.";
  if (b != null && x != null && x < b) return "O salário máximo não pode ser menor que o base.";
  return null;
}
