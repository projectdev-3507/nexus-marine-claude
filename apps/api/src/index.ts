import { createApp } from './app';
import { config } from './config';
import { startScheduler } from './services/scheduler';

const app = createApp();
app.listen(config.port, () => {
  console.log(`Nexus Marine API http://localhost:${config.port}`);
  if (process.env.DISABLE_SCHEDULER !== 'true') startScheduler();
});
