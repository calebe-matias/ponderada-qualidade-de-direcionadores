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

function createReservoir(maxSamples = 100000) {
  const values = [];
  let seen = 0;

  return {
    add(value) {
      seen += 1;
      if (values.length < maxSamples) {
        values.push(value);
        return;
      }
      const index = Math.floor(Math.random() * seen);
      if (index < maxSamples) {
        values[index] = value;
      }
    },
    values() {
      return values;
    }
  };
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
  durationSeconds,
  progressIntervalSeconds = 15
}) {
  const startedAt = Date.now();
  const stopAt = startedAt + (durationSeconds * 1000);
  let totalRequests = 0;
  let totalErrors = 0;
  let inFlight = 0;
  const globalLatencies = createReservoir(100000);
  const minuteBuckets = {};

  const progressTimer = setInterval(() => {
    const elapsedSec = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
    const errorRatePct = totalRequests > 0 ? ((totalErrors / totalRequests) * 100) : 0;
    const rps = totalRequests / elapsedSec;
    const stage = Date.now() < stopAt ? "executando" : "drenando";
    console.log(`[BD3-T01] Progresso (${stage}) t=${elapsedSec}s req=${totalRequests} err=${errorRatePct.toFixed(2)}% rps=${rps.toFixed(2)} inFlight=${inFlight}`);
  }, progressIntervalSeconds * 1000);

  async function worker() {
    while (Date.now() < stopAt) {
      const endpoint = Math.random() < 0.7 ? "process" : "result";
      const processId = randomOf(processIds);
      inFlight += 1;
      const outcome = await performRequest(client, processId, endpoint);
      inFlight -= 1;

      const ts = Date.now();
      const minute = Math.floor((ts - startedAt) / 60000);
      if (!minuteBuckets[minute]) {
        minuteBuckets[minute] = {
          total: 0,
          errors: 0,
          latencies: createReservoir(20000)
        };
      }

      totalRequests += 1;
      if (!outcome.ok) {
        totalErrors += 1;
      }
      globalLatencies.add(outcome.latencyMs);
      minuteBuckets[minute].total += 1;
      minuteBuckets[minute].errors += outcome.ok ? 0 : 1;
      minuteBuckets[minute].latencies.add(outcome.latencyMs);
    }
  }

  const workers = [];
  for (let i = 0; i < vus; i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);
  clearInterval(progressTimer);

  const totalElapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
  const minuteWindows = Object.entries(minuteBuckets).map(([minute, data]) => ({
    minute: Number(minute),
    total: data.total,
    errorRatePct: Number(((data.errors / data.total) * 100).toFixed(2)),
    p95Ms: percentile(data.latencies.values(), 95)
  })).sort((a, b) => a.minute - b.minute);

  const firstWindow = minuteWindows.length > 0 ? minuteWindows[0] : null;
  const abruptDegradation = firstWindow
    ? minuteWindows.some((w) => w.p95Ms > firstWindow.p95Ms * 2)
    : false;

  return {
    config: {
      vus,
      durationSeconds,
      elapsedSeconds: totalElapsedSeconds
    },
    totals: {
      requests: totalRequests,
      errors: totalErrors,
      errorRatePct: totalRequests > 0 ? Number(((totalErrors / totalRequests) * 100).toFixed(2)) : 0,
      throughputRps: totalElapsedSeconds > 0 ? Number((totalRequests / totalElapsedSeconds).toFixed(2)) : 0,
      p95Ms: percentile(globalLatencies.values(), 95)
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
    resultUrl: env.asisResultUrl,
    timeoutMs: env.loadRequestTimeoutMs
  });

  console.log(`[BD3-T01] Semeando ${env.loadSeedUploads} IDs de processo...`);
  const processIds = await seedProcessIds(client, fixturePath, env.loadSeedUploads);
  console.log(`[BD3-T01] IDs semeados: ${processIds.length}`);

  console.log(`[BD3-T01] Iniciando carga: ${env.loadVus} VUs por ${env.loadDurationSeconds}s`);
  const summary = await runHighLoad({
    client,
    processIds,
    vus: env.loadVus,
    durationSeconds: env.loadDurationSeconds,
    progressIntervalSeconds: env.loadProgressIntervalSeconds
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
    `- Duracao planejada (s): ${summary.config.durationSeconds}`,
    `- Duracao total observada (s): ${summary.config.elapsedSeconds}`,
    `- Requests totais: ${summary.totals.requests}`,
    `- Erros totais: ${summary.totals.errors}`,
    `- Taxa de erro (%): ${summary.totals.errorRatePct}`,
    `- Throughput (req/s): ${summary.totals.throughputRps}`,
    `- Latencia p95 aproximada (ms): ${summary.totals.p95Ms}`,
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
