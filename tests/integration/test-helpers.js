const fs = require("fs");
const path = require("path");
const { AsisApiClient } = require("../../src/client/asis-api-client");
const { getEnv, hasApiCredentials } = require("../../src/config/env");

const env = getEnv();
const fixturePath = path.resolve(__dirname, "..", "fixtures", "sped-fiscal.txt");

function shouldRunIntegration() {
  return hasApiCredentials(env) && fs.existsSync(fixturePath);
}

function createClient() {
  return new AsisApiClient({
    appKey: env.asisAppKey,
    accountKey: env.asisAccountKey,
    uploadUrl: env.asisUploadUrl,
    coreUrl: env.asisCoreUrl,
    resultUrl: env.asisResultUrl
  });
}

function ensureReportsDir() {
  const reportsDir = path.resolve(process.cwd(), "reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  return reportsDir;
}

module.exports = {
  env,
  fixturePath,
  shouldRunIntegration,
  createClient,
  ensureReportsDir
};
