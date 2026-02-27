const fs = require("fs");
const path = require("path");
const { getEnv, assertApiCredentials } = require("../../src/config/env");
const { AsisApiClient, extractProcessFromUpload } = require("../../src/client/asis-api-client");

function percentile(values, p) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function randomOf(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function ensureReportsDir() {
  const reportsDir = path.resolve(process.cwd(), "reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  return reportsDir;
}

async function seedProcessIds(client, fixturePath, seedCount) {
  const ids = [];
  for (let i = 0; i < seedCount; i += 1) {
    const upload = await client.uploadFile(fixturePath);
    const processo = extractProcessFromUpload(upload.data);
    if (processo && processo.id) {
      ids.push(processo.id);
    }
  }
  if (ids.length === 0) {
    throw new Error("Nao foi possivel semear IDs para o teste de carga.");
  }
  return ids;
}

async function performRequest(client, processId, endpoint) {
  const startedAt = Date.now();
  try {
    const response = endpoint === "process"
      ? await client.getProcess(processId)
      : await client.getProcessResults(processId);

    return {
      ok: response.status >= 200 && response.status < 400,
      status: response.status,
      latencyMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      ok: false,
      status: Number(error.status || 0),
      latencyMs: Date.now() - startedAt
    };
  }
}

async function runHighLoad({
  client,
  processIds,
  vus,
  durationSeconds
}) {
  const stopAt = Date.now() + (durationSeconds * 1000);
  const startedAt = Date.now();
  const samples = [];

  async function worker() {
    while (Date.now() < stopAt) {
      const endpoint = Math.random() < 0.7 ? "process" : "result";
      const processId = randomOf(processIds);
      const outcome = await performRequest(client, processId, endpoint);
      samples.push({
        ts: Date.now(),
        endpoint,
        ...outcome
      });
    }
  }

  const workers = [];
  for (let i = 0; i < vus; i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);

  const totalRequests = samples.length;
  const errors = samples.filter((s) => !s.ok).length;
  const latencies = samples.map((s) => s.latencyMs);

  const byMinute = {};
  for (const sample of samples) {
    const minute = Math.floor((sample.ts - startedAt) / 60000);
    if (!byMinute[minute]) {
      byMinute[minute] = {
        total: 0,
        errors: 0,
        latencies: []
      };
    }
    byMinute[minute].total += 1;
    byMinute[minute].errors += sample.ok ? 0 : 1;
    byMinute[minute].latencies.push(sample.latencyMs);
  }

  const minuteWindows = Object.entries(byMinute).map(([minute, data]) => ({
    minute: Number(minute),
    total: data.total,
    errorRatePct: Number(((data.errors / data.total) * 100).toFixed(2)),
    p95Ms: percentile(data.latencies, 95)
  }));

  const firstWindow = minuteWindows.length > 0 ? minuteWindows[0] : null;
  const abruptDegradation = firstWindow
    ? minuteWindows.some((w) => w.p95Ms > firstWindow.p95Ms * 2)
    : false;

  return {
    config: {
      vus,
      durationSeconds
    },
    totals: {
      requests: totalRequests,
      errors,
      errorRatePct: totalRequests > 0 ? Number(((errors / totalRequests) * 100).toFixed(2)) : 0,
      throughputRps: durationSeconds > 0 ? Number((totalRequests / durationSeconds).toFixed(2)) : 0,
      p95Ms: percentile(latencies, 95),
      avgMs: latencies.length > 0 ? Number((latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2)) : 0
    },
    minuteWindows,
    abruptDegradation
  };
}

async function main() {
  const env = getEnv();
  assertApiCredentials(env);

  const fixturePath = path.resolve(process.cwd(), "tests", "fixtures", "sped-fiscal.txt");
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Fixture nao encontrado: ${fixturePath}`);
  }

  const client = new AsisApiClient({
    appKey: env.asisAppKey,
    accountKey: env.asisAccountKey,
    uploadUrl: env.asisUploadUrl,
    coreUrl: env.asisCoreUrl,
    resultUrl: env.asisResultUrl
  });

  console.log(`[BD3-T01] Semeando ${env.loadSeedUploads} IDs de processo...`);
  const processIds = await seedProcessIds(client, fixturePath, env.loadSeedUploads);
  console.log(`[BD3-T01] IDs semeados: ${processIds.length}`);

  console.log(`[BD3-T01] Iniciando carga: ${env.loadVus} VUs por ${env.loadDurationSeconds}s`);
  const summary = await runHighLoad({
    client,
    processIds,
    vus: env.loadVus,
    durationSeconds: env.loadDurationSeconds
  });

  const reportsDir = ensureReportsDir();
  const jsonPath = path.resolve(reportsDir, "load-metrics.json");
  const mdPath = path.resolve(reportsDir, "load-summary.md");
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2), "utf8");

  const md = [
    "# Driver 3 - Resultado de carga",
    "",
    `- Data: ${new Date().toISOString()}`,
    `- VUs: ${summary.config.vus}`,
    `- Duracao (s): ${summary.config.durationSeconds}`,
    `- Requests totais: ${summary.totals.requests}`,
    `- Erros: ${summary.totals.errors}`,
    `- Taxa de erro (%): ${summary.totals.errorRatePct}`,
    `- Throughput (req/s): ${summary.totals.throughputRps}`,
    `- Latencia p95 (ms): ${summary.totals.p95Ms}`,
    `- Estabilidade sem degradacao abrupta: ${summary.abruptDegradation ? "nao" : "sim"}`
  ].join("\n");
  fs.writeFileSync(mdPath, `${md}\n`, "utf8");

  const errorRateOk = summary.totals.errorRatePct < 5;
  const p95Ok = summary.totals.p95Ms < 2000;
  const stabilityOk = !summary.abruptDegradation;

  console.log("[BD3-T02] Criterios:");
  console.log(`- erro < 5%: ${errorRateOk ? "OK" : "FALHOU"} (${summary.totals.errorRatePct}%)`);
  console.log(`- p95 < 2000ms: ${p95Ok ? "OK" : "FALHOU"} (${summary.totals.p95Ms}ms)`);
  console.log(`- sem degradacao abrupta: ${stabilityOk ? "OK" : "FALHOU"}`);
  console.log(`Relatorios: ${jsonPath} e ${mdPath}`);

  if (!(errorRateOk && p95Ok && stabilityOk)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
