import { Router } from 'express';
import passport from 'passport';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { setSession, signSession } from '../lib/auth';

export const authRouter = Router();

if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_CALLBACK_URL) {
  passport.use(new GoogleStrategy({
    clientID: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    callbackURL: env.GOOGLE_CALLBACK_URL
  }, async (_accessToken, _refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value?.toLowerCase();
      if (!email) return done(new Error('Google account has no email'));
      const user = await prisma.user.upsert({
        where: { email },
        create: { email, name: profile.displayName || email.split('@')[0], avatarUrl: profile.photos?.[0]?.value, googleId: profile.id },
        update: { name: profile.displayName || undefined, avatarUrl: profile.photos?.[0]?.value, googleId: profile.id }
      });
      await prisma.emailAccount.upsert({ where: { userId_email: { userId: user.id, email } }, create: { userId: user.id, email, displayName: user.name }, update: { displayName: user.name } });
      done(null, user);
    } catch (e) { done(e as Error); }
  }));
}

authRouter.get('/google', (req, res, next) => {
  if (!env.GOOGLE_CLIENT_ID) return res.status(503).json({ error: 'Google OAuth is not configured' });
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })(req, res, next);
});

authRouter.get('/google/callback', (req, res, next) => {
  passport.authenticate('google', { session: false }, (err: any, user: any) => {
    if (err || !user) return res.redirect(`${env.FRONTEND_URL}/login?error=oauth_failed`);
    setSession(res, signSession(user.id));
    return res.redirect(`${env.FRONTEND_URL}/app`);
  })(req, res, next);
});

authRouter.post('/logout', (_req, res) => { res.clearCookie(env.COOKIE_NAME); res.json({ ok: true }); });

const credentialsSchema = z.object({ email: z.string().email(), password: z.string().min(8).max(128), name: z.string().min(2).max(100).optional() });

authRouter.post('/register', async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Valid email and password (8+ chars) are required' });
  const { email, password, name } = parsed.data;
  const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (exists) return res.status(409).json({ error: 'Account already exists. Use Google login or sign in.' });
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({ data: { email: email.toLowerCase(), name: name || email.split('@')[0], passwordHash } });
  await prisma.emailAccount.create({ data: { userId: user.id, email: user.email, displayName: user.name } });
  setSession(res, signSession(user.id));
  res.status(201).json({ id: user.id, name: user.name, email: user.email });
});

authRouter.post('/login', async (req, res) => {
  const parsed = credentialsSchema.pick({ email: true, password: true }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Valid email and password are required' });
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user?.passwordHash || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) return res.status(401).json({ error: 'Invalid email or password' });
  setSession(res, signSession(user.id));
  res.json({ id: user.id, name: user.name, email: user.email });
});
