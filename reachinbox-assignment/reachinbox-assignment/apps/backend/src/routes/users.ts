import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../lib/auth';

export const usersRouter = Router();
usersRouter.get('/me', requireAuth, async (_req, res) => {
  const user = await prisma.user.findUnique({ where: { id: res.locals.userId }, include: { emailAccounts: true } });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl, emailAccounts: user.emailAccounts.map(a => ({ id: a.id, email: a.email, displayName: a.displayName })) });
});
