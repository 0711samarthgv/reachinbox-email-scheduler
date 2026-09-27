import { createApp } from './app';
import { env } from './config/env';
import { connectRedis } from './lib/redis';
import { prisma } from './lib/prisma';
import { ensureEmailIndex } from './services/elasticsearch';

async function main() {
  await connectRedis();
  await prisma.$connect();
  await ensureEmailIndex();
  const app = createApp();
  const server = app.listen(env.PORT, () => console.log(`API listening on http://localhost:${env.PORT}`));
  const shutdown = async () => { server.close(); await prisma.$disconnect(); process.exit(0); };
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
}
main().catch(err => { console.error(err); process.exit(1); });
