import "server-only";
import PizZip from "pizzip";
import { extractText, getDocumentProxy } from "unpdf";
import { lerRelatorioTubesT, lerArquivoTubesT } from "./tubest";
import { lerRelatorioLibellula, lerLxd, confereComRelatorio } from "./libellula";
import { planoConciliado } from "./conciliar";
import { obraDoArquivo } from "./marca";
import { hashDo } from "./importar";

// ─── OS BYTES QUE CHEGAM DA TELA VIRAM UM PLANO ──────────────────────────────
//
// ⚠ A "engine" são duas dependências que o portal JÁ TEM: `pizzip` (os `.zx`/`.zh`/`.yxy` são ZIP)
// e `unpdf` (os relatórios). Nada proprietário — os três formatos são ZIP+XML ou XML puro.
//
// ⚠⚠ O PDF É A LISTA DO OPERADOR (Matheus, 13/09/2026: "a lista são os PDFs que estão dentro das
// pastas de cada máquina"). Ele é o relatório do plano E o papel que vai para a mão de quem corta —
// por isso é o leitor primário, e o arquivo da máquina entra por cima, dando a ordem de corte.

const EXT = (nome) => String(nome).toLowerCase().split(".").pop();
const DA_MAQUINA = new Set(["zx", "zh", "yxy", "lxd"]);

export const ehRelatorio = (nome) => EXT(nome) === "pdf";
export const ehDaMaquina = (nome) => DA_MAQUINA.has(EXT(nome));

async function textoDoPdf(bytes) {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

/**
 * @param {{nome:string, bytes:Buffer}[]} arquivos tudo o que a pessoa arrastou para a tela
 */
export async function lerPlano(arquivos) {
  const relatorios = arquivos.filter((a) => ehRelatorio(a.nome));
  if (relatorios.length !== 1) {
    return { erro: relatorios.length ? "Mande UM relatório em PDF por vez." : "Falta o relatório em PDF do plano." };
  }
  const relatorio = relatorios[0];
  const texto = await textoDoPdf(relatorio.bytes);
  const daMaquina = arquivos.filter((a) => ehDaMaquina(a.nome));

  const comum = {
    nome: relatorio.nome.replace(/\.pdf$/i, ""),
    opNumero: obraDoArquivo(relatorio.nome),
    arquivoRelatorio: relatorio.nome,
    hashRelatorio: hashDo(relatorio.bytes),
    arquivoMaquina: daMaquina.map((a) => a.nome).join(" · ") || null,
    // ⚠⚠ O HASH DOS DOIS, JUNTOS, É O QUE AMARRA A VERSÃO. Nenhum dos dois prova sozinho que são do
    // mesmo plano, e é dessa premissa que depende a dedução do nome da peça curta (§12.8.2).
    hashMaquina: daMaquina.length ? hashDo(Buffer.concat(daMaquina.map((a) => a.bytes))) : null,
  };

  return texto.includes("Informações sobre agrupamento")
    ? { ...comum, ...daLibellula(texto, daMaquina) }
    : { ...comum, ...doTubesT(texto, daMaquina) };
}

function doTubesT(texto, daMaquina) {
  const relatorio = lerRelatorioTubesT(texto);
  const lidos = daMaquina.map((a) => ({
    ...lerArquivoTubesT((entrada) => new PizZip(a.bytes).file(entrada)?.asText() ?? ""),
    // ⚠ O `.yxy` é o plano inteiro e contém as mesmas barras dos `.zx`, que são recortes dele —
    // dizer a espécie é o que impede a conciliação de achar que os dois disputam a barra.
    origem: EXT(a.nome) === "yxy" ? "plano" : "barra",
  }));
  const plano = planoConciliado(relatorio, lidos);
  return {
    origem: "TUBEST",
    tipoUnidade: "BARRA",
    programa: lidos.find((l) => l.programa)?.programa || null,
    descricao: relatorio.secao,
    plano,
    divergencias: plano.divergencias,
  };
}

function daLibellula(texto, daMaquina) {
  const relatorio = lerRelatorioLibellula(texto);
  const lxd = daMaquina.find((a) => EXT(a.nome) === "lxd");
  const geometria = lxd ? lerLxd(lxd.bytes.toString("utf8")) : null;
  const avisos = [
    ...(relatorio.falhas || []),
    ...(geometria ? confereComRelatorio(geometria, relatorio) : []),
  ];

  // ⚠ Na Libellula o plano é UMA chapa por arquivo (`..._1.lxd`), e a tabela do PDF é a lista dessa
  // chapa. A unidade nasce do cabeçalho, não de blocos como no TubesT.
  const plano = {
    barras: [{
      indice: 1, pecas: relatorio.pecas || 0, itens: relatorio.itens, cortes: [],
      comprimentoMm: relatorio.chapaMm?.[1] ?? null,
    }],
    divergencias: avisos,
  };
  return {
    origem: "LIBELLULA",
    tipoUnidade: "CHAPA",
    programa: "Libellula",
    descricao: [relatorio.material, relatorio.espessuraMm && `${relatorio.espessuraMm}mm`,
      relatorio.chapaMm && `chapa ${relatorio.chapaMm.join(" x ")}`].filter(Boolean).join(" · "),
    material: relatorio.material,
    espessuraMm: relatorio.espessuraMm,
    plano,
    divergencias: avisos,
  };
}
