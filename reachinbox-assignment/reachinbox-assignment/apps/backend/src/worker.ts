import { connectRedis } from './lib/redis';
import { prisma } from './lib/prisma';
import { createEmailWorker } from './workers/emailWorker';

async function main() {
  await connectRedis();
  await prisma.$connect();
  const worker = createEmailWorker();
  const shutdown = async () => { await worker.close(); await prisma.$disconnect(); process.exit(0); };
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
  console.log('Email worker started');
}
main().catch(err => { console.error(err); process.exit(1); });
