const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");

function durationMsFrom(startNs) {
  const diffNs = process.hrtime.bigint() - startNs;
  return Number(diffNs / 1000000n);
}

class AsisApiClient {
  constructor({
    appKey,
    accountKey,
    uploadUrl,
    coreUrl,
    resultUrl,
    timeoutMs = 30000
  }) {
    this.appKey = appKey;
    this.accountKey = accountKey;
    this.uploadUrl = uploadUrl.replace(/\/$/, "");
    this.coreUrl = coreUrl.replace(/\/$/, "");
    this.resultUrl = resultUrl.replace(/\/$/, "");
    this.http = axios.create({ timeout: timeoutMs });
  }

  buildAuthHeaders(authMode = "valid") {
    if (authMode === "none") {
      return {};
    }
    if (authMode === "invalid") {
      return {
        "app-key": "invalid",
        "account-key": "invalid"
      };
    }
    return {
      "app-key": this.appKey,
      "account-key": this.accountKey
    };
  }

  decorateError(error, startNs) {
    const err = error;
    err.durationMs = durationMsFrom(startNs);
    err.status = error.response ? error.response.status : undefined;
    return err;
  }

  async uploadFile(filePath, { authMode = "valid" } = {}) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Arquivo nao encontrado: ${filePath}`);
    }

    const form = new FormData();
    form.append("file", fs.createReadStream(filePath), path.basename(filePath));
    const headers = {
      ...form.getHeaders(),
      ...this.buildAuthHeaders(authMode)
    };

    const startNs = process.hrtime.bigint();
    try {
      const response = await this.http.post(`${this.uploadUrl}/api/v1/upload`, form, {
        headers
      });
      return {
        status: response.status,
        data: response.data,
        durationMs: durationMsFrom(startNs)
      };
    } catch (error) {
      throw this.decorateError(error, startNs);
    }
  }

  async getProcess(processId, { authMode = "valid" } = {}) {
    const startNs = process.hrtime.bigint();
    try {
      const response = await this.http.get(`${this.coreUrl}/api/v1/processo/${processId}`, {
        headers: this.buildAuthHeaders(authMode)
      });
      return {
        status: response.status,
        data: response.data,
        durationMs: durationMsFrom(startNs)
      };
    } catch (error) {
      throw this.decorateError(error, startNs);
    }
  }

  async getProcessResults(processId, { authMode = "valid" } = {}) {
    const startNs = process.hrtime.bigint();
    try {
      const response = await this.http.get(`${this.resultUrl}/api/v1/resultado/processo/${processId}`, {
        headers: this.buildAuthHeaders(authMode)
      });
      return {
        status: response.status,
        data: response.data,
        durationMs: durationMsFrom(startNs)
      };
    } catch (error) {
      throw this.decorateError(error, startNs);
    }
  }
}

function extractProcessFromUpload(uploadData) {
  if (!uploadData || !Array.isArray(uploadData.processos) || uploadData.processos.length === 0) {
    return null;
  }
  return uploadData.processos[0];
}

module.exports = {
  AsisApiClient,
  extractProcessFromUpload
};
