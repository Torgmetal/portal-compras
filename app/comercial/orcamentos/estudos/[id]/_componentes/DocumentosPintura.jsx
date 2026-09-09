"use client";
import { useRef, useState } from "react";
import { FileSpreadsheet, Loader2, Trash2, Upload } from "lucide-react";
import { LeituraDoSistema } from "./LeituraDoSistema";

export function DocumentosPintura({ c, setComp }) {
  const t = Array.isArray(c.tintas) ? c.tintas : [];
  // ─── LEVANTAMENTO DE PINTURA ANEXADO ────────────────────────────────────────────────────────
  // Vitor (31/08/2026): "na parte da pintura nessa página preciso da opção para que seja possível
  // subir um PDF ou planilha com as informações de pintura".
  //
  // ⚠ ANEXO É PROVA, NÃO CÁLCULO. O que o cliente manda (esquema do fabricante da tinta, memorial
  // de pintura, planilha de áreas) fica guardado ao lado das camadas para consulta e para a
  // proposta — quem calcula continuam sendo os campos abaixo. Ler o PDF e mexer no preço sozinho
  // seria adivinhar em cima do que o cliente escreveu.
  //
  // ⚠⚠ SOBE DIRETO PARA O BLOB (client token). Memorial de pintura passa fácil de 4,5 MB, que é o
  // teto do corpo de uma função serverless — pelo caminho normal ele falharia sem dizer por quê.
  const anexos = Array.isArray(c.pinturaAnexos) ? c.pinturaAnexos : [];
  const [subindo, setSubindo] = useState(false);
  const [leitura, setLeitura] = useState(null);   // o que foi lido da planilha, à espera do OK
  const refArquivo = useRef(null);

  // ⚠⚠ ANEXAR E LER SÃO A MESMA AÇÃO. Vitor (31/08/2026): "tentei importar um plano de pintura na
  // proposta 290 e não reconheceu". Ele estava certo: eu tinha entregado só o anexo, guardando o
  // arquivo sem abrir, quando o pedido era "importar o sistema de pintura para que seja avaliado
  // qual o tipo de tinta e qual a quantidade". Agora a planilha é lida na hora.
  //
  // ⚠ O ARQUIVO CONTINUA GUARDADO mesmo quando a leitura falha — é o documento do cliente, e vale
  // como prova do que foi especificado, independentemente de eu conseguir interpretá-lo.
  //
  // ⚠ E NÃO SOBRESCREVE SEM PERGUNTAR: as camadas já preenchidas são trabalho de alguém. A tela
  // mostra o que leu e só aplica com confirmação.
  async function anexar(ev) {
    const files = Array.from(ev.target.files || []);
    ev.target.value = "";
    if (!files.length) return;
    setSubindo(true);
    const novos = [];
    try {
      const { upload } = await import("@vercel/blob/client");
      for (const file of files) {
        const seguro = file.name.replace(/[^\w.\- ]+/g, "_");
        const blob = await upload(`estudos-pintura/${Date.now()}-${seguro}`, file, {
          access: "public", handleUploadUrl: "/api/comercial/estudos/upload-token",
        });
        novos.push({ nome: file.name, url: blob.url, tamanho: file.size, em: new Date().toISOString() });
      }
      setComp({ pinturaAnexos: [...anexos, ...novos] });

      // tenta LER a especificação da primeira planilha do lote
      const planilha = files.find((f) => /\.(xlsx|xls|csv)$/i.test(f.name));
      if (planilha) await lerEspec(planilha);
    } catch (e) { alert("Falha ao anexar: " + e.message); } finally { setSubindo(false); }
  }

  async function lerEspec(file) {
    try {
      const [XLSX, { lerEspecificacaoPintura }] = await Promise.all([
        import("xlsx"), import("@/lib/pintura-especificacao"),
      ]);
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const grade = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", blankrows: false });
      const lido = lerEspecificacaoPintura(grade);
      if (!lido.camadas.length) {
        alert(
          "Anexei o arquivo, mas não reconheci o sistema de pintura nele.\n\n" +
          lido.avisos.join("\n") +
          "\n\nEle continua guardado — preencha as camadas à mão, ou me mande o formato para eu ensinar a ler."
        );
        return;
      }
      setLeitura(lido);
    } catch (e) {
      alert("Anexei o arquivo, mas não consegui abrir a planilha: " + e.message);
    }
  }

  function aplicarLeitura() {
    const lido = leitura;
    if (!lido) return;
    const corAcab = lido.cores?.[0]?.cor || "";
    const novas = lido.camadas.map((cm, i) => ({
      ...(t[i] || {}),
      camada: cm.camada,
      produto: cm.produto || t[i]?.produto || "",
      peliculaSeca: cm.peliculaSeca ?? t[i]?.peliculaSeca ?? null,
      solidos: cm.solidos ?? t[i]?.solidos ?? null,
      // ⚠ CINZA EMBAIXO, COR DO CLIENTE EM CIMA. Vitor (31/08/2026): "primer e intermediário é
      // melhor considerar sempre cinza". Só o acabamento puxa a cor da §2 da planilha.
      cor: cm.camada === "ACABAMENTO" ? (cm.cor || corAcab) : (cm.cor || "Cinza"),
      id: t[i]?.id || crypto.randomUUID(),
      ...(!t[i] ? { estruturaEscopo: "todas" } : {}),
      perda: t[i]?.perda ?? 45,
      nome: (t[i]?.perda ?? 45) === 85 ? "ESTRUTURA — FATOR DE PERDA: 85%" : "ESTRUTURA — FATOR DE PERDA: 45%",
    }));
    // camadas que já existiam além das lidas continuam onde estão
    setComp({ tintas: [...novas, ...t.slice(novas.length)], pinturaFabricante: lido.fabricante || null });
    setLeitura(null);
  }

  const remover = (i) => {
    if (!confirm("Remover este anexo do estudo?")) return;
    setComp({ pinturaAnexos: anexos.filter((_, j) => j !== i) });
  };
  return <div>        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-[12px] font-semibold text-torg-dark">Levantamento de pintura</p>
            <p className="text-[11px] text-torg-gray">
              Esquema do fabricante, memorial ou planilha de áreas — fica guardado aqui para consulta.
              Não altera o cálculo abaixo.
            </p>
          </div>
          <input ref={refArquivo} type="file" multiple accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg"
            className="hidden" onChange={anexar} />
          <button type="button" onClick={() => refArquivo.current?.click()} disabled={subindo}
            className="text-[12px] font-semibold text-torg-blue border border-torg-blue-200 rounded-lg px-3 py-1.5 hover:bg-torg-blue-50 disabled:opacity-50 inline-flex items-center gap-1.5">
            {subindo ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {subindo ? "Enviando…" : "Anexar PDF ou planilha"}
          </button>
        </div>
        {/* ⚠ O QUE FOI LIDO APARECE ANTES DE VALER. Aplicar direto sobrescreveria camadas que
            alguém preencheu à mão — e numa planilha do cliente, um campo mal lido vira preço
            errado sem ninguém ver. Aqui ele confere as três demãos e decide. */}
        {leitura && (
          <LeituraDoSistema
            aplicarLeitura={aplicarLeitura}
            leitura={leitura}
            setLeitura={setLeitura}
          />
        )}

        {anexos.length > 0 && (
          <div className="mb-3 divide-y divide-gray-50 border border-gray-100 rounded-lg">
            {anexos.map((a, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2">
                <FileSpreadsheet size={13} className="text-torg-gray shrink-0" />
                <a href={a.url} target="_blank" rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate text-[12px] text-torg-blue hover:underline">{a.nome}</a>
                <span className="text-[11px] text-torg-gray whitespace-nowrap">
                  {(Number(a.tamanho || 0) / 1048576).toFixed(1)} MB
                </span>
                <button onClick={() => remover(i)} title="remover" className="text-gray-300 hover:text-red-600">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
</div>;
}
