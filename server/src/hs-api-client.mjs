import { fetchJsonWithRetry } from './http-client.mjs';

export class HsApiClient {
  constructor(options = {}) {
    const domain = options.domain || 'https://hs.vtolvr.live';
    this.baseUrl = options.baseUrl || `${domain.replace(/\/$/, '')}/api/v1/public`;
    this.fetchImpl = options.fetchImpl || fetch;
    this.timeoutMs = options.timeoutMs || 10000;
    this.retries = Number.isInteger(options.retries) ? options.retries : 2;
    this.logger = options.logger;
  }

  async getRelevantUsers(requestId) {
    return this.get('relevantUsers', requestId);
  }

  async getUser(playerId, requestId) {
    return this.get(`users/${playerId}`, requestId);
  }

  async get(resource, requestId) {
    const url = `${this.baseUrl}/${resource}`;
    return fetchJsonWithRetry(url, {
      fetchImpl: this.fetchImpl,
      timeoutMs: this.timeoutMs,
      retries: this.retries,
      requestId,
      logger: this.logger
    });
  }
}
