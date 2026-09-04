import Link from "next/link";
import { ArrowLeft, GitCommit, Package, Rocket } from "lucide-react";
import { VERSAO_ATUAL, CHANGELOG, BUILD_HASH, BUILD_DATE, BUILD_TITULO } from "@/lib/versao";
import dadosBuild from "@/versao-build.json";

export const metadata = { title: "Versão do Portal — Torg" };

/**
 * Tela de controle de atualizações.
 *
 * O histórico vem de `versao-build.json`, gravado no commit pelo hook de pre-commit — e não
 * de um `git log` em tempo de build, porque o clone que a Vercel faz do repositório é raso
 * (traria só os últimos commits). Ver scripts/gerar-versao.js.
 *
 * O CHANGELOG de `lib/versao.js` continua sendo a lista curada de MARCOS (mantida na mão);
 * os commits abaixo são o registro fino de cada deploy.
 *
 * ⚠ O arquivo é gravado ANTES do commit existir, então o commit que está no ar NÃO está na
 * lista dele — vem do build (BUILD_TITULO) e aparece no cartão do topo. Por isso a lista
 * começa em `build - 1`.
 */
export default function VersaoPage() {
  const commits = dadosBuild.commits ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-torg-gray hover:text-torg-dark transition-colors mb-6"
        >
          <ArrowLeft size={16} /> Voltar ao portal
        </Link>

        {/* Cartão do que está no ar agora */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-8">
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-torg-blue/10 p-3">
              <Rocket className="text-torg-blue" size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs uppercase tracking-wide text-torg-gray">No ar agora</p>
              <h1 className="text-2xl font-semibold text-torg-dark tabular-nums">
                v{VERSAO_ATUAL} · build {dadosBuild.build}
              </h1>
              {BUILD_TITULO && (
                <p className="mt-1 text-sm text-torg-dark">{BUILD_TITULO}</p>
              )}
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div>
                  <dt className="text-torg-gray text-xs">Commit</dt>
                  <dd className="text-torg-dark font-mono">{BUILD_HASH}</dd>
                </div>
                <div>
                  <dt className="text-torg-gray text-xs">Publicado em</dt>
                  <dd className="text-torg-dark">{BUILD_DATE}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>

        {/* Atualizações recentes — uma linha por commit publicado */}
        <section className="mb-10">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-torg-dark uppercase tracking-wide mb-3">
            <GitCommit size={16} className="text-torg-orange" /> Atualizações anteriores
          </h2>
          {commits.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
              <GitCommit className="mx-auto text-gray-300 mb-2" size={28} />
              <p className="text-sm text-torg-gray">
                Nenhum histórico gravado ainda — rode <code>npm run versao</code>.
              </p>
            </div>
          ) : (
            <ol className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50">
              {commits.map((c, i) => (
                <li key={c.hash} className="flex items-baseline gap-4 px-5 py-3">
                  <span className="text-xs text-torg-gray tabular-nums w-24 shrink-0">
                    {c.data}
                  </span>
                  <span className="flex-1 text-sm text-torg-dark">{c.titulo}</span>
                  <span className="text-[11px] text-torg-gray/70 tabular-nums shrink-0">
                    build {dadosBuild.build - 1 - i}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Marcos maiores, curados à mão em lib/versao.js */}
        <section>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-torg-dark uppercase tracking-wide mb-3">
            <Package size={16} className="text-torg-orange" /> Marcos do portal
          </h2>
          <div className="space-y-4">
            {CHANGELOG.map((v) => (
              <article
                key={v.versao}
                className="bg-white rounded-xl border border-gray-100 shadow-sm p-5"
              >
                <div className="flex items-baseline gap-3 mb-2">
                  <span className="text-sm font-semibold text-torg-blue tabular-nums">
                    v{v.versao}
                  </span>
                  <span className="text-torg-dark font-medium">{v.titulo}</span>
                  <span className="ml-auto text-xs text-torg-gray">{v.data}</span>
                </div>
                <ul className="list-disc pl-5 space-y-1 text-sm text-torg-gray">
                  {v.itens.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
