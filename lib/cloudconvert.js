// Conversão de arquivos via CloudConvert (v2). Usado pra converter a proposta
// (.docx) em PDF antes de mandar pro cliente. Requer CLOUDCONVERT_API_KEY na env
// (Vercel + .env.local) — criar em cloudconvert.com → Dashboard → API Keys, com
// os escopos task.read e task.write.
const API = "https://api.cloudconvert.com/v2";
const SYNC = "https://sync.api.cloudconvert.com/v2";

export function cloudConvertConfigurado() {
  return !!process.env.CLOUDCONVERT_API_KEY;
}

export async function converterDocxParaPdf(buffer, filename = "proposta.docx") {
  const key = process.env.CLOUDCONVERT_API_KEY;
  if (!key) throw new Error("Conversão para PDF indisponível: configure CLOUDCONVERT_API_KEY.");
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  // 1) cria o job (importa base64 → converte → exporta URL)
  const jobRes = await fetch(`${API}/jobs`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      tasks: {
        "import-1": { operation: "import/base64", file: buffer.toString("base64"), filename },
        "convert-1": { operation: "convert", input: "import-1", input_format: "docx", output_format: "pdf" },
        "export-1": { operation: "export/url", input: "convert-1" },
      },
    }),
  });
  const jobJson = await jobRes.json().catch(() => ({}));
  if (!jobRes.ok) throw new Error("CloudConvert: " + (jobJson?.message || "falha ao criar o job"));
  const jobId = jobJson?.data?.id;
  if (!jobId) throw new Error("CloudConvert: job sem id.");

  // 2) espera terminar (endpoint sync/wait)
  const waitRes = await fetch(`${SYNC}/jobs/${jobId}/wait`, { headers });
  const waitJson = await waitRes.json().catch(() => ({}));
  if (!waitRes.ok) throw new Error("CloudConvert: " + (waitJson?.message || "falha ao converter"));
  const job = waitJson?.data || {};
  if (job.status !== "finished") throw new Error("CloudConvert: conversão não concluída (" + job.status + ").");

  // 3) URL do PDF
  const exportTask = (job.tasks || []).find((t) => t.operation === "export/url" && t.status === "finished");
  const file = exportTask?.result?.files?.[0];
  if (!file?.url) throw new Error("CloudConvert: PDF não retornado.");

  // 4) baixa o PDF
  const pdfRes = await fetch(file.url);
  if (!pdfRes.ok) throw new Error("CloudConvert: falha ao baixar o PDF.");
  return Buffer.from(await pdfRes.arrayBuffer());
}
