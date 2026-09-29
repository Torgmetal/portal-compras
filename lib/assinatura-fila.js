// ─── A FILA DE ASSINATURA DO RELATÓRIO DE INSPEÇÃO ─────────────────────────────────────────────
//
// Geraldo (29/09/2026): "precisa colocar uma lógica para aprovação de relatório: primeiro inspetor,
// depois torg e por último o cliente — exemplo: o Davi recebeu o relatório ao mesmo tempo que eu
// (…) ele abriu e falou: está sem a assinatura de vocês". O envio convidava todos de uma vez, e o
// cliente lia um documento que a Torg ainda não tinha aprovado.
//
// ⚠⚠ A ORDEM SAI DO PAPEL, NÃO DA LINHA EM QUE A PESSOA FOI DIGITADA. É a mesma regra das colunas do
// PDF (`COLUNA_DO_CONVITE`): quem inspecionou · a Torg que aprova · o cliente. Papel fora do convite
// vai com a Torg — o cliente é sempre o último.
//
// ⚠ A fila usa a infraestrutura dos planos (PLP/PIT): `AssinaturaDocumento.ordem` diz a posição,
// /api/assinar/[token] recusa quem assina fora da vez e convida o próximo no ato. Envio antigo, com
// `ordem` nula, continua em paralelo — nada aqui o reinterpreta.
import { colunaDoConvite } from "@/lib/assinatura-quadros";

// Posições por papel, de 100 em 100: `seq` desempata sem nunca passar para o papel seguinte, e cada
// assinante tem ordem ÚNICA — dois na mesma ordem assinariam juntos e a vez pularia um deles.
const PASSO = 100;

/** Posição na fila: inspetor → Torg Metal (e papel livre) → cliente. */
export function ordemNaFila(setor, seq = 0) {
  return ((colunaDoConvite(setor) ?? 1) + 1) * PASSO + seq;
}

/** Quem está com a vez: o primeiro que ainda não assinou. Envio sem ordem não tem fila. */
export function daVez(assinaturas) {
  const pendentes = (assinaturas || []).filter((a) => a?.ordem != null && !a.assinadoEm);
  return [...pendentes].sort((x, y) => x.ordem - y.ordem)[0] || null;
}

/** true se ainda falta alguém ANTES desta pessoa — ela não recebeu o convite e não pode assinar. */
export function aguardaAVez(a, assinaturas) {
  if (!a || a.ordem == null || a.assinadoEm) return false;
  return (assinaturas || []).some((s) => s?.ordem != null && s.ordem < a.ordem && !s.assinadoEm);
}
