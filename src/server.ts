import http from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { initSocket } from './config/socket';

const app = createApp();
const httpServer = http.createServer(app);

initSocket(httpServer);

httpServer.listen(env.port, () => {
  console.log(`${env.appName} API listening on port ${env.port} (${env.nodeEnv})`);
  console.log(`Swagger docs: ${env.appBaseUrl}/api/docs`);
});
