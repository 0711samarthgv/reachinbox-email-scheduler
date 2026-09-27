import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
export function basicAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const [u, p] = Buffer.from(encoded, 'base64').toString().split(':');
    if (u === env.BULL_BOARD_USERNAME && p === env.BULL_BOARD_PASSWORD) return next();
  }
  res.setHeader('WWW-Authenticate', 'Basic realm="Bull Board"');
  res.status(401).send('Authentication required');
}
