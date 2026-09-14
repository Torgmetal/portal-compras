// O modal carrega o 3D com next/dynamic, e o wrapper do dynamic NÃO repassa `ref`: a API de captura
// (capturar/enquadrar) tem de chegar por um prop comum (`apiRef`). Com `ref={viz}`, `viz.current`
// fica null e o botão "PDF do modelo" não faz nada, em silêncio — foi assim que o PDF "não saía"
// para o Vitor duas vezes (14/09/2026), com o resto do caminho inteiro certo.
import { readFileSync } from "fs";
import { expect, it } from "vitest";

const modal = readFileSync(new URL("../../components/carga/SimularCargaModal.jsx", import.meta.url), "utf8");
const viewer = readFileSync(new URL("../../components/carga/VisualizadorCarga.jsx", import.meta.url), "utf8");

it("o modal entrega a API do 3D por apiRef, nunca por ref (next/dynamic engole o ref)", () => {
  expect(modal).toMatch(/<VisualizadorCarga apiRef=\{viz\}/);
  expect(modal).not.toMatch(/<VisualizadorCarga ref=\{viz\}/);
  expect(viewer).toMatch(/useImperativeHandle\(apiRef \|\| ref/);
});

it("sem a API do 3D o botão explica em vez de ficar mudo", () => {
  expect(modal).toMatch(/if \(!v\?\.capturar\) \{ setErro\(/);
});
