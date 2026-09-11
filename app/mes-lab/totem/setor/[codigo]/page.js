import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Bancada from "./Bancada";

// ─── AS BANCADAS DE UM SETOR — a home do PC daquele setor ─────────────────────
//
// Matheus (11/09/2026): "precisamos dividir o link dos setores para eu conseguir colocar em cada PC
// apenas o setor dele, exemplo um link apenas para o totem da montagem com as bancadas da montagem
// disponível para eles abrir".
//
// ⚠⚠ É ESTE LINK QUE VAI NO NAVEGADOR DA FÁBRICA, e a divisão por setor é a trava. A lista completa
// (`/mes-lab/totem`) mostra a fábrica inteira: no PC da montagem, ela deixaria alguém apontar
// produção no laser. O portão não é permissão — é não existir caminho até o posto do vizinho.
//
// ⚠⚠ ESCRITA GRANDE PORQUE A DISTÂNCIA É GRANDE. Matheus (11/09/2026): "deixe com visual mais
// bonito as bancadas e escritas grandes". Não é estética: o monitor fica na parede ou na bancada, e
// quem procura o próprio nome está de luva, a dois metros, com a máquina ligada. Nome da bancada em
// corpo enorme, alvo de toque alto, e o resto em volta calado.
//
// ⚠⚠ "SEM REGISTRO" SAIU DOS CARDS LIVRES. A primeira versão carimbava o estado em TODOS: quatro
// bancadas de cinco exibiam a mesma etiqueta cinza, que não diz nada a quem vai escolher onde
// trabalhar — só ensina a ignorar etiqueta. Agora o selo aparece só quando a bancada está EM USO,
// que é a informação capaz de mudar a decisão de quem está olhando.

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const setor = await prisma.mesSetor.findUnique({ where: { codigo: decodeURIComponent(params.codigo) } });
  return { title: setor ? `Totem — ${setor.nome}` : "Totem", robots: { index: false, follow: false } };
}

/**
 * O primeiro nome, apresentável.
 *
 * ⚠ O cadastro do RH vem em CAIXA ALTA e, em alguns registros, com espaços à frente ("   ALEX
 * APARECIDO ORSI"). Sem o `trim`, o primeiro nome sai vazio e a bancada aparece sem dono; sem
 * baixar a caixa, "JURANDIR" grita ao lado do nome da própria bancada, que é escrito normal.
 */
function primeiroNome(nome) {
  const primeiro = String(nome ?? "").trim().split(/\s+/)[0] || "";
  return primeiro ? primeiro[0].toUpperCase() + primeiro.slice(1).toLowerCase() : "";
}

/** O que cada bancada está fazendo agora — sessão aberta, operador e último estado. */
async function situacaoDasBancadas(recursos) {
  const ids = recursos.map((r) => r.id);
  const [abertas, eventos] = await Promise.all([
    prisma.mesSessao.findMany({
      where: { recursoId: { in: ids }, status: "ABERTA" },
      select: { recursoId: true, marca: true, opNumero: true, operadorId: true },
    }),
    prisma.mesEvento.findMany({
      where: { recursoId: { in: ids } },
      orderBy: { ocorridoEm: "desc" },
      distinct: ["recursoId"],
      select: { recursoId: true, tipo: true },
    }),
  ]);
  const operadores = await prisma.mesOperador.findMany({
    where: { id: { in: abertas.map((s) => s.operadorId).filter(Boolean) } },
    select: { id: true, nome: true },
  });
  const nomeDo = new Map(operadores.map((o) => [o.id, primeiroNome(o.nome)]));
  const sessaoDo = new Map(abertas.map((s) => [s.recursoId, s]));
  const estadoDo = new Map(eventos.map((e) => [e.recursoId, e.tipo]));
  return { nomeDo, sessaoDo, estadoDo };
}

export default async function BancadasDoSetor({ params }) {
  const codigo = decodeURIComponent(params.codigo);
  const setor = await prisma.mesSetor.findUnique({
    where: { codigo },
    include: { recursos: { where: { ativo: true }, orderBy: { nome: "asc" } } },
  });
  if (!setor) notFound();

  const { nomeDo, sessaoDo, estadoDo } = await situacaoDasBancadas(setor.recursos);
  const cor = setor.cor || "#006EAB";
  const livres = setor.recursos.filter((r) => !sessaoDo.has(r.id)).length;

  return (
    <div className="min-h-screen bg-torg-dark text-white">
      {/* A faixa da cor do setor: de longe, ela é o que diz "este é o PC da montagem". */}
      <div className="h-2 w-full" style={{ background: cor }} />

      <div className="p-6 md:p-10 max-w-[1700px] mx-auto">
        <header className="mb-8 md:mb-10 flex items-end justify-between gap-6 flex-wrap">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-white/40 mb-1">Torg MES</p>
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-none">{setor.nome}</h1>
          </div>
          <p className="text-2xl md:text-3xl text-white/50 font-light">
            <b className="text-white/90 font-bold">{livres}</b> de {setor.recursos.length} livres
          </p>
        </header>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {setor.recursos.map((r) => (
            <Bancada key={r.id} recurso={r} cor={cor}
                     sessao={sessaoDo.get(r.id)} estado={estadoDo.get(r.id)}
                     operador={nomeDo.get(sessaoDo.get(r.id)?.operadorId)} />
          ))}
          {!setor.recursos.length && (
            <p className="text-white/50 text-2xl col-span-full">Nenhuma bancada cadastrada neste setor.</p>
          )}
        </div>
      </div>
    </div>
  );
}
