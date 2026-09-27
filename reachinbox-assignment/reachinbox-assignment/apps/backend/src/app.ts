import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { emailQueue } from './queue/emailQueue';
import { env } from './config/env';
import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { emailsRouter } from './routes/emails';
import { slackRouter } from './routes/slack';
import { basicAuth } from './middleware/basicAuth';

export function createApp() {
  const app = express();
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use(passport.initialize());

  app.get('/health', (_req, res) => res.json({ ok: true, service: 'reachinbox-api', time: new Date().toISOString() }));
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/emails', emailsRouter);
  app.use('/api/slack', slackRouter);

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');
  createBullBoard({ queues: [new BullMQAdapter(emailQueue)], serverAdapter });
  app.use('/admin/queues', basicAuth, serverAdapter.getRouter());

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}
