import { setTimeout as sleep } from 'node:timers/promises';
import { ApiError, UpstreamHttpError } from './errors.mjs';

function isRetryable(error) {
  if (error instanceof UpstreamHttpError) {
    return error.status >= 500;
  }

  if (error?.name === 'AbortError') {
    return true;
  }

  return true;
}

export async function fetchJsonWithRetry(url, options = {}) {
  const {
    fetchImpl = fetch,
    timeoutMs = 10000,
    retries = 2,
    backoffMs = [200, 800],
    requestId,
    logger
  } = options;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, { signal: controller.signal });
      const contentType = response.headers.get('content-type') || '';

      if (!response.ok) {
        throw new UpstreamHttpError(response.status, `Upstream returned ${response.status}`);
      }

      if (!contentType.includes('application/json')) {
        throw new ApiError(502, 'UPSTREAM_INVALID_CONTENT_TYPE', 'Upstream did not return JSON');
      }

      return await response.json();
    } catch (error) {
      const isLast = attempt === retries;
      const retryable = isRetryable(error);

      logger?.warn(
        {
          requestId,
          attempt: attempt + 1,
          retries: retries + 1,
          retryable,
          err: error?.message
        },
        'upstream request failed'
      );

      if (isLast || !retryable) {
        throw error;
      }

      await sleep(backoffMs[attempt] ?? backoffMs[backoffMs.length - 1] ?? 800);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new ApiError(502, 'UPSTREAM_ERROR', 'Unable to fetch data from upstream');
}
