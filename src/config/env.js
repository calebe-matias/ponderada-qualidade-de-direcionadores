const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getEnv() {
  return {
    asisAppKey: process.env.ASIS_APP_KEY || "",
    asisAccountKey: process.env.ASIS_ACCOUNT_KEY || "",
    asisUploadUrl: process.env.ASIS_UPLOAD_URL || "https://upload.stg.asistaxtech.com.br",
    asisCoreUrl: process.env.ASIS_CORE_URL || "https://core.stg.asistaxtech.com.br",
    asisResultUrl: process.env.ASIS_RESULT_URL || "https://resultado.stg.asistaxtech.com.br",
    pollTimeoutMs: parseInteger(process.env.POLL_TIMEOUT_MS, 1200000),
    pollIntervalMs: parseInteger(process.env.POLL_INTERVAL_MS, 5000),
    assertSlo: String(process.env.ASSERT_SLO || "false").toLowerCase() === "true",
    loadVus: parseInteger(process.env.LOAD_VUS, 200),
    loadDurationSeconds: parseInteger(process.env.LOAD_DURATION_SECONDS, 300),
    loadSeedUploads: parseInteger(process.env.LOAD_SEED_UPLOADS, 10),
    loadProgressIntervalSeconds: parseInteger(process.env.LOAD_PROGRESS_INTERVAL_SECONDS, 15),
    loadRequestTimeoutMs: parseInteger(process.env.LOAD_REQUEST_TIMEOUT_MS, 10000)
  };
}

function hasApiCredentials(env = getEnv()) {
  return Boolean(env.asisAppKey && env.asisAccountKey);
}

function assertApiCredentials(env = getEnv()) {
  if (!hasApiCredentials(env)) {
    throw new Error("ASIS_APP_KEY e ASIS_ACCOUNT_KEY sao obrigatorias para testes reais.");
  }
}

module.exports = {
  getEnv,
  hasApiCredentials,
  assertApiCredentials
};
