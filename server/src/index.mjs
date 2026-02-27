import pino from 'pino';
import { createApp } from './app.mjs';
import { HsApiClient } from './hs-api-client.mjs';

const port = Number(process.env.PORT || 3000);
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: null
});

const apiClient = new HsApiClient({
  logger
});

const app = createApp({
  apiClient,
  logger,
  appVersion: process.env.APP_VERSION || 'web-dev'
});

app.listen(port, '0.0.0.0', () => {
  logger.info({ port }, 'thrustelo api listening');
});
