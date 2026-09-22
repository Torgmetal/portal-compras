"use client";
import { numeroBR } from "@/lib/numero-br";
import { fmtMoeda } from "../_lib/formatos";
import CampoDecimal from "@/components/CampoDecimal";
import { UNIDADES_CANONICAS, unidadeCanonica, fatorFixo, converterParaRM } from "@/lib/unidades";

// ─── A UNIDADE EM QUE O FORNECEDOR COTOU ─────────────────────────────────────
//
// Matheus (22/09/2026): *"orçamos em unidades, tipo 2500 parafusos, e os fornecedores mandam a
// cotação em CT — nesse caso seriam 25 CT"*. E a decisão de quem declara: **o comprador**; o
// fornecedor continua respondendo como sempre.
//
// ⚠⚠ O COMPRADOR DIGITA O QUE ESTÁ NO PAPEL. Era isso ou pedir que ele fizesse a conta de cabeça
// antes de digitar — e conta de cabeça em cima de proposta é onde nasce o erro de 100×. A conversão
// é mostrada embaixo, e quem grava o número convertido é o servidor.
//
// ⚠ O TOTAL É O MESMO NOS DOIS LADOS. É a invariante da conversão (`lib/unidades.js`): a quantidade
// multiplica e o preço divide pelo mesmo fator.

/**
 * O estado da conversão desta linha.
 *
 * ⚠ `precisaDigitar` é o fator do ITEM — a telha em metro linear, o aço em quilo. Não cabe em
 * tabela: quem tem o documento na mão informa. `fatorFixo` devolve null exatamente nesses casos.
 */
function estadoDa(linha) {
  const daRM = unidadeCanonica(linha.unidade);
  const cotada = linha.unidadeCotada || daRM || "";
  const fixo = fatorFixo(cotada, daRM);
  const outra = Boolean(cotada) && Boolean(daRM) && cotada !== daRM;
  const fator = fixo != null ? fixo : numeroBR(linha.fatorParaRM);
  const conta = outra && fator && fator !== 1
    ? converterParaRM({ qtd: numeroBR(linha.qtdCotada), preco: numeroBR(linha.precoUnit), fator })
    : null;
  return { daRM, cotada, fator, conta, precisaDigitar: outra && fixo == null };
}

export default function ConversaoUnidade({ linha, setLinha }) {
  const { daRM, cotada, fator, conta, precisaDigitar } = estadoDa(linha);

  const escolher = (u) => {
    setLinha(linha.rmItemId, "unidadeCotada", u);
    // ⚠ O fator acompanha a escolha: trocar a unidade sem limpar o fator antigo deixaria uma
    // conversão de CT aplicada a uma proposta em metro.
    setLinha(linha.rmItemId, "fatorParaRM", fatorFixo(u, daRM) ?? "");
  };

  if (!daRM) {
    // ⚠ Unidade da RM que não é canônica ("LATA 2,80L", "BALDE 18L") não tem conversão — é
    // embalagem, com o volume dentro do nome. A coluna some em vez de oferecer uma conta impossível.
    return <span className="text-[10px] text-gray-400">{linha.unidade || "—"}</span>;
  }

  return (
    <div className="space-y-0.5">
      <select
        value={cotada}
        onChange={(e) => escolher(e.target.value)}
        className="w-20 border border-gray-200 rounded px-1 py-0.5 text-[11px] bg-white"
        title="Unidade em que o fornecedor cotou"
      >
        {UNIDADES_CANONICAS.map((u) => (
          <option key={u.codigo} value={u.codigo}>{u.codigo}</option>
        ))}
      </select>

      {precisaDigitar && (
        <CampoDecimal
          value={linha.fatorParaRM}
          onChange={(txt) => setLinha(linha.rmItemId, "fatorParaRM", txt)}
          placeholder={`${daRM} por ${cotada}`}
          casas={4}
          className="w-20 border border-amber-300 bg-amber-50 rounded px-1 py-0.5 text-[11px] text-right tabular-nums"
        />
      )}

      {/* ⚠ A conta aparece para ser CONFERIDA contra o documento — no caso da telha, o PDF traz as
          duas quantidades, e é assim que o comprador vê se o comprimento que informou bate. */}
      {conta && (
        <p className="text-[10px] text-torg-blue leading-tight whitespace-nowrap">
          = {conta.qtd.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {daRM} · {fmtMoeda(conta.preco)}/{daRM}
        </p>
      )}
      {precisaDigitar && !fator && (
        <p className="text-[10px] text-amber-700 leading-tight">informe {daRM} por {cotada}</p>
      )}
    </div>
  );
}
