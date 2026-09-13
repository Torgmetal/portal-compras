import "server-only";
import { prisma } from "@/lib/prisma";
import { analisarMaterial, pecasLiberaveis } from "@/lib/material-liberacao";
import {
  portaoDoDesenho,
  temDesenhoNaPasta,
  temMaquinaNaPasta,
} from "@/lib/pasta-engenharia";
import { classificarDecisaoPcp } from "@/lib/pcp-fila-decisao";

export async function conferirDecisaoPcp({
  opId,
  opNumero,
  setor,
  pecas,
  todas,
  dadosCompletos,
}) {
  const resultados = await Promise.allSettled([
    analisarMaterial(opNumero, todas),
    portaoDoDesenho(prisma, opId),
  ]);
  const material =
    resultados[0].status === "fulfilled" ? resultados[0].value : null;
  const pasta =
    resultados[1].status === "fulfilled" ? resultados[1].value : null;
  const liberaveis = new Set(
    material ? pecasLiberaveis(pecas, material.porPeca).map((p) => p.id) : [],
  );
  const porId = Object.fromEntries(
    pecas.map((p) => {
      const mat = material?.porPeca.get(p.id);
      // A lista negativa da pasta só comprova marcas da LPC que ela efetivamente cobre.
      const cobertura = pasta?.confiavel && p.fonte === "LPC_IMPORT";
      const temR =
        !!mat?.rInformado ||
        !!mat?.rs?.length ||
        (setor === "MONTAGEM" && !!mat?.herdadoDosCroquis);
      return [
        p.id,
        classificarDecisaoPcp(p, setor, {
          dadosCompletos,
          material: mat ? liberaveis.has(p.id) && temR : null,
          rs: mat?.rs || [],
          materialHerdado: mat?.herdadoDosCroquis,
          desenho: cobertura ? temDesenhoNaPasta(pasta, p.marca) : null,
          maquina: cobertura
            ? temMaquinaNaPasta(pasta, p.marca, setor === "MONTAGEM")
            : null,
        }),
      ];
    }),
  );
  return {
    porId,
    pastaConferidaEm: pasta?.checadoEm || null,
    consultadoEm: new Date().toISOString(),
    incompleta: !dadosCompletos || !material || !pasta?.confiavel,
  };
}
