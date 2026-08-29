import "server-only";

// ─── TRAVA DE FORÇA BRUTA NO LOGIN ────────────────────────────────────────────
// Vitor (29/08/2026), depois da varredura de segurança: "vamos colocar o limitador de login".
//
// ⚠⚠ A CONTAGEM É POR CONTA, NÃO POR IP. A Torg inteira — escritório e fábrica — sai pelo mesmo IP
// público. Um limitador por IP somaria as tentativas de todo mundo e trancaria o expediente inteiro
// no dia em que uma pessoa errasse a senha algumas vezes; foi exatamente o risco que ele levantou
// ("se você me disser que não vai ser um problema para os acessos que já existem"). Contando por
// conta, quem erra a própria senha só atrapalha a si mesmo — e o robô que varre senhas para de
// avançar depois de MAX_TENTATIVAS.
//
// ⚠ E A CONTAGEM VIVE NO BANCO, não em memória. O limitador de lib/rate-limit.js guarda um Map por
// instância; na Vercel cada função tem o seu, então o teto real é multiplicado pelo número de
// instâncias que a plataforma resolver criar. Para senha isso não serve: aqui o contador é uma
// coluna do User e vale para o portal inteiro, em qualquer instância.
import { prisma } from "./prisma";

// 8 erros seguidos. Ninguém digita errado 8 vezes; um ataque automatizado passa disso no primeiro
// segundo. Depois disso, 15 minutos de espera — que zeram sozinhos, sem ninguém destravar nada.
export const MAX_TENTATIVAS = 8;
export const MINUTOS_BLOQUEIO = 15;

/**
 * A conta está de castigo agora? Devolve os minutos que faltam, ou 0.
 *
 * ⚠ Checar ANTES do bcrypt: comparar hash custa ~100ms de CPU, e é justamente esse custo que o
 * atacante quer nos fazer pagar. Conta bloqueada nem chega a comparar.
 */
export function minutosDeBloqueio(user) {
  if (!user?.bloqueadoAte) return 0;
  const restante = new Date(user.bloqueadoAte).getTime() - Date.now();
  return restante > 0 ? Math.ceil(restante / 60_000) : 0;
}

/**
 * Registra uma senha errada. Ao bater o teto, tranca a conta por MINUTOS_BLOQUEIO.
 *
 * ⚠ Nunca derruba o login por erro de banco: se a gravação falhar, a tentativa segue tratada como
 * senha errada (que é o que ela é). Uma trava que quebra o portal quando o Neon oscila seria pior
 * que a ausência dela.
 */
export async function registrarFalha(userId) {
  try {
    const u = await prisma.user.update({
      where: { id: userId },
      data: { tentativasFalhas: { increment: 1 } },
      select: { tentativasFalhas: true },
    });
    if (u.tentativasFalhas >= MAX_TENTATIVAS) {
      await prisma.user.update({
        where: { id: userId },
        data: { bloqueadoAte: new Date(Date.now() + MINUTOS_BLOQUEIO * 60_000), tentativasFalhas: 0 },
      });
      await prisma.auditLog.create({
        data: { userId, action: "login_bloqueado", entity: "User", entityId: userId,
          diff: { motivo: `${MAX_TENTATIVAS} senhas erradas seguidas`, minutos: MINUTOS_BLOQUEIO } },
      }).catch(() => {});
    }
  } catch { /* ver o comentário acima */ }
}

/** Acertou a senha: zera o contador. Só escreve se houver o que limpar. */
export async function limparFalhas(user) {
  if (!user?.tentativasFalhas && !user?.bloqueadoAte) return;
  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { tentativasFalhas: 0, bloqueadoAte: null },
    });
  } catch { /* idem */ }
}

// ─── SENHA INICIAL ────────────────────────────────────────────────────────────
// Vitor (29/08/2026): "as contas que estiverem com as senhas iniciais vamos alterar".
//
// ⚠⚠ A SENHA DE CADASTRO É PREVISÍVEL POR DESENHO: scripts/seed-team.mjs monta "Primeiro@2026!" a
// partir do e-mail, e prisma/seed.mjs usa "TorgAdmin2026!". Quem recebeu um primeiro acesso uma vez
// conhece o formato e consegue entrar na conta de um colega sem quebrar nada — é o risco mais
// concreto do portal hoje, maior que o de um ataque de fora.
//
// ⚠ A CONFERÊNCIA É NO LOGIN, com a senha que a pessoa ACABOU de digitar. Não se testa senha contra
// hash guardado (isso é quebrar credencial, mesmo com boa intenção): aqui o texto já está em mãos,
// legitimamente, e a comparação é exata — ninguém é obrigado a trocar por engano.
const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const capitalizar = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

/** As senhas que os scripts de cadastro geram para esta conta. */
export function senhasDeCadastro(user) {
  const local = semAcento(String(user?.email || "").split("@")[0]);
  // seed-team monta a partir do TRECHO ANTES DO PONTO do e-mail ("vitor.costa" → "Vitor@2026!")
  const base = capitalizar(local.split(".")[0]);
  return [base && `${base}@2026!`, "TorgAdmin2026!"].filter(Boolean);
}

/** A senha digitada é a de cadastro? Então a conta precisa trocar antes de seguir. */
export function ehSenhaDeCadastro(user, senhaDigitada) {
  return senhasDeCadastro(user).includes(String(senhaDigitada || ""));
}
