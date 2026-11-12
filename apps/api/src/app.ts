import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import { config } from './config';
import { authenticate, requirePerm } from './lib/auth';
import { ah, errorHandler } from './lib/errors';
import { authRouter } from './routes/auth';
import { vesselsRouter } from './routes/vessels';
import { workOrdersRouter } from './routes/workorders';
import { maintenanceRouter } from './routes/maintenance';
import { inspectionsRouter } from './routes/inspections';
import { faultsRouter } from './routes/faults';
import { reportsRouter } from './routes/reports';
import { collectionsRouter } from './routes/collections';
import { maintCategoriesRouter } from './routes/maintCategories';
import { projectsRouter } from './routes/projects';
import { customersRouter } from './routes/customers';
import { quotesRouter, paymentsRouter } from './routes/finance';
import { inventoryRouter } from './routes/inventory';
import { documentsRouter } from './routes/documents';
import { notificationsRouter } from './routes/notifications';
import { usersRouter, techniciansRouter } from './routes/users';
import { settingsRouter } from './routes/settings';
import { dashboardRouter, calendarRouter, analyticsRouter } from './routes/dashboard';
import { filesRouter } from './routes/files';
import { runScheduledJobs } from './services/scheduler';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes('*') || config.corsOrigins.includes(origin)),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  if (process.env.NODE_ENV !== 'test') app.use(morgan('tiny'));

  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'nexus-marine-api', time: new Date() }));
  app.use('/api/auth', authRouter);

  const api = express.Router();
  api.use(authenticate);
  api.use('/dashboard', dashboardRouter);
  api.use('/calendar', calendarRouter);
  api.use('/analytics', analyticsRouter);
  api.use('/vessels', vesselsRouter);
  api.use('/work-orders', workOrdersRouter);
  api.use('/maintenance', maintenanceRouter);
  api.use('/inspections', inspectionsRouter);
  api.use('/faults', faultsRouter);
  api.use('/reports', reportsRouter);
  api.use('/collections', collectionsRouter);
  api.use('/maintenance-categories', maintCategoriesRouter);
  api.use('/projects', projectsRouter);
  api.use('/customers', customersRouter);
  api.use('/quotes', quotesRouter);
  api.use('/payments', paymentsRouter);
  api.use('/inventory', inventoryRouter);
  api.use('/documents', documentsRouter);
  api.use('/notifications', notificationsRouter);
  api.use('/users', usersRouter);
  api.use('/technicians', techniciansRouter);
  api.use('/settings', settingsRouter);
  api.use('/files', filesRouter);
  api.post('/admin/run-jobs', requirePerm('settings.manage'), ah(async (_req, res) => res.json(await runScheduledJobs())));
  app.use('/api', api);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Bulunamadı' }));

  // Tek sunucu dağıtımı: derlenmiş web uygulamasını (dashboard + müşteri portalı) aynı origin'den sun
  if (config.webDistDir && fs.existsSync(config.webDistDir)) {
    app.use(express.static(config.webDistDir, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(config.webDistDir!, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
