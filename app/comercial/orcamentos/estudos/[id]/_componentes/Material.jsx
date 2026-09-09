"use client";
import { FATURAMENTO, FATURAMENTO_ROTULO } from "@/lib/lqc";
import { ListaMaterialAco } from "./ListaMaterialAco";
import { Quadro, Sel } from "./campos";
export function Material({ c, res, setComp, estudoId }) {
  const fat = c.faturamento || {};
  const setFat = (k, v) => setComp({ faturamento: { ...fat, [k]: v } });
  const g = res.grupos || {};
  return (
    <div className="space-y-4">
      <p className="text-[12px] text-torg-gray">
        Quem fatura o material define o imposto: <strong className="text-torg-dark">Torg fatura</strong> carrega
        ICMS e PIS/COFINS na linha; <strong className="text-torg-dark">cliente compra direto</strong> não passa pelo
        nosso faturamento — e também não recebe BDI.
      </p>

      <div className="bg-white border border-gray-100 rounded-xl p-4">
        <div className="flex flex-wrap items-end gap-4">
          {/* ⚠ TINTA SAIU DAQUI (31/08/2026). Vitor: "tire essa opção da tinta, pois vamos tratar
              disso em outra aba". Quem fatura a tinta é decisão de pintura, e ela agora mora junto
              das camadas — na aba Pintura. O valor continua o mesmo campo (`faturamento.tintas`),
              só mudou de tela: nada foi perdido nem recalculado. */}
          {[["materiaPrima", "Aço (matéria-prima)"], ["fixadores", "Fixadores"]].map(([k, r]) => (
            <label key={k} className="text-[11px] font-semibold text-torg-dark">{r}
              <Sel value={fat[k] || ""} onChange={(ev) => setFat(k, ev.target.value)} opcoes={FATURAMENTO} rotulos={FATURAMENTO_ROTULO} className="block mt-1 w-44" /></label>
          ))}

        </div>
      </div>

      <ListaMaterialAco c={c} setComp={setComp} estudoId={estudoId} res={res} />
      <Quadro titulo="Aço por categoria de perfil" grupo={g.materiaPrima} vazio="Lance o perfil predominante nas linhas do quantitativo." />
      {/* ⚠ O PREÇO DO PARAFUSO ESTAVA LONGE DA LINHA DELE. Vitor (31/08/2026): "o preço do parafuso
          deve ser preenchido no campo do preço unitário onde ele está descrito, deixar um detalhe
          amarelo claro para chamar a atenção". Era um campo solto na régua de cima enquanto a linha
          "Parafusos A325 e A307" mostrava R$ 0,00 e mandava "informe acima" — quem lia a tabela via
          zero e não sabia onde mexer. Agora o campo É a célula de R$/kg, destacada em amarelo. */}
      <Quadro titulo="Fixadores" grupo={g.fixadores}
        vazio="Informe o R$/kg dos fixadores na linha abaixo."
        precoEditavel={{ valor: c.fixadoresRsKg, onChange: (v) => setComp({ fixadoresRsKg: v }) }} />

    </div>
  );
}
