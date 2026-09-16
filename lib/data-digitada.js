// ─── A DATA QUE O USUÁRIO DIGITA ─────────────────────────────────────────────
//
// ⚠⚠ `<input type="date">` MOSTRA NO FORMATO DO NAVEGADOR, NÃO NO DA PÁGINA. O portal é inteiro em
// português e o campo aparecia `mm/dd/yyyy` para quem tem o navegador em inglês — inclusive para
// FORNECEDOR, na tela de cotação, onde uma data lida ao contrário vira prazo de entrega errado.
// Medido (15/09/2026): nem `lang="pt-BR"` no input, nem no elemento pai, nem o locale da página
// mudam isso — o formato vem do idioma da INTERFACE do navegador, e não há atributo que sobreponha.
//
// Daí o campo próprio: texto com máscara `dd/mm/aaaa`, que é igual em qualquer máquina. O valor
// que circula continua sendo o ISO `YYYY-MM-DD` de sempre, então nada muda no banco nem nas rotas.

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** ISO (`2026-09-15`) → `15/09/2026`. Qualquer outra coisa volta vazia. */
export function isoParaBR(iso) {
  const m = ISO.exec(String(iso || "").slice(0, 10));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/**
 * O que se digita, já com as barras no lugar.
 *
 * ⚠ Só acrescenta a barra DEPOIS do dia e do mês completos, e nunca reescreve o que já está lá:
 * quem apaga a barra para corrigir o mês tem de conseguir apagar.
 */
export function mascararDataBR(texto) {
  const bruto = String(texto ?? "").trim();
  // ⚠⚠ ISO COLADO É DATA, NÃO LIXO. O portal inteiro guarda `2026-09-20`, e é isso que sai de um
  // relatório, de uma planilha ou do próprio banco quando alguém copia e cola no campo. Sem esta
  // linha os dígitos entravam na máscara na ordem errada e viravam "20/26/0920" — uma data que não
  // existe, recusada em silêncio. Foi um teste de fluxo que denunciou (16/09/2026).
  const iso = isoParaBR(bruto);
  if (iso) return iso;

  const d = bruto.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/**
 * `15/09/2026` → `2026-09-15`, ou `""` enquanto a data não estiver completa e for real.
 *
 * ⚠⚠ CONFERE O CALENDÁRIO, NÃO SÓ O FORMATO. `31/02/2026` casa com a máscara e não existe; sem
 * esta volta pelo `Date`, ele viraria 2026-03-03 silenciosamente — três dias de prazo que ninguém
 * digitou.
 */
export function brParaIso(texto) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(texto || "").trim());
  if (!m) return "";
  const [, dia, mes, ano] = m;
  const d = new Date(Number(ano), Number(mes) - 1, Number(dia));
  const real = d.getFullYear() === Number(ano) && d.getMonth() === Number(mes) - 1 && d.getDate() === Number(dia);
  return real ? `${ano}-${mes}-${dia}` : "";
}
