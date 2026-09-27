import { Router } from 'express';
import { requireAuth } from '../lib/auth';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';

export const slackRouter = Router();

slackRouter.get('/status', requireAuth, async (_req, res) => {
  const connection = await prisma.slackConnection.findFirst({ where: { userId: res.locals.userId } });
  res.json({ connected: Boolean(connection), teamName: connection?.teamName || null });
});

slackRouter.get('/oauth/start', requireAuth, (req, res) => {
  if (!env.SLACK_CLIENT_ID || !env.SLACK_REDIRECT_URI) return res.status(503).json({ error: 'Slack OAuth is not configured' });
  const params = new URLSearchParams({ client_id: env.SLACK_CLIENT_ID, scope: env.SLACK_SCOPES, redirect_uri: env.SLACK_REDIRECT_URI, state: res.locals.userId });
  res.redirect(`https://slack.com/oauth/v2/authorize?${params}`);
});

slackRouter.get('/oauth/callback', async (req, res) => {
  if (!env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET || !env.SLACK_REDIRECT_URI) return res.redirect(`${env.FRONTEND_URL}/app?slack=not_configured`);
  const code = String(req.query.code || ''); const userId = String(req.query.state || '');
  if (!code || !userId) return res.redirect(`${env.FRONTEND_URL}/app?slack=failed`);
  try {
    const body = new URLSearchParams({ client_id: env.SLACK_CLIENT_ID, client_secret: env.SLACK_CLIENT_SECRET, code, redirect_uri: env.SLACK_REDIRECT_URI });
    const response = await fetch('https://slack.com/api/oauth.v2.access', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const data = await response.json() as any;
    if (!data.ok || !data.access_token) throw new Error(data.error || 'Slack OAuth failed');
    await prisma.slackConnection.upsert({ where: { userId_teamId: { userId, teamId: data.team?.id || data.team?.name || 'default' } }, create: { userId, teamId: data.team?.id || data.team?.name || 'default', teamName: data.team?.name, accessToken: data.access_token, slackUserId: data.authed_user?.id || null }, update: { teamName: data.team?.name, accessToken: data.access_token, slackUserId: data.authed_user?.id || null } });
    res.redirect(`${env.FRONTEND_URL}/app?slack=connected`);
  } catch { res.redirect(`${env.FRONTEND_URL}/app?slack=failed`); }
});

slackRouter.post('/disconnect', requireAuth, async (_req, res) => {
  await prisma.slackConnection.deleteMany({ where: { userId: res.locals.userId } });
  res.json({ ok: true });
});
