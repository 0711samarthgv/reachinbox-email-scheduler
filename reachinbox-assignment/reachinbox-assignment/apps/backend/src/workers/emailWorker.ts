import {
  Worker,
  Job,
  DelayedError,
} from 'bullmq';

import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { env } from '../config/env';

import {
  EMAIL_QUEUE,
} from '../queue/emailQueue';

import {
  reserveHourlySlot,
  reserveSendSlot,
} from '../services/rateLimiter';

import {
  sendEmail,
} from '../services/email';

import {
  indexEmail,
} from '../services/elasticsearch';

import {
  notifyRateLimit,
} from '../services/slack';

export type EmailJob = {
  emailId: string;
};

export function createEmailWorker() {
  const worker =
    new Worker<EmailJob>(
      EMAIL_QUEUE,

      async (
        job: Job<EmailJob>
      ) => {
        const email =
          await prisma.email.findUnique(
            {
              where: {
                id: job.data.emailId,
              },

              include: {
                sender: true,
                campaign: true,
              },
            }
          );

        if (!email) return;

        if (
          email.status === 'SENT'
        ) {
          return;
        }

        const claimed =
          await prisma.email.updateMany(
            {
              where: {
                id: email.id,

                status: {
                  in: [
                    'SCHEDULED',
                    'FAILED',
                  ],
                },
              },

              data: {
                status: 'PROCESSING',

                attempts: {
                  increment: 1,
                },
              },
            }
          );

        if (
          claimed.count === 0
        ) {
          return;
        }

        const campaignLimit =
          email.campaign.hourlyLimit ||
          env.MAX_EMAILS_PER_HOUR;

        const rate =
          await reserveHourlySlot(
            email.senderId,
            env.MAX_EMAILS_PER_HOUR,
            email.campaignId,
            campaignLimit
          );

        if (
          !rate.allowed
        ) {
          await prisma.email.update({
            where: {
              id: email.id,
            },

            data: {
              status: 'SCHEDULED',

              errorMessage: null,
            },
          });

          const notifyKey =
            `rate-notified:${email.senderId}:${Math.floor(
              Date.now() / 3600000
            )}`;

          /*
           * Redis SET with NX + EX.
           * This prevents multiple workers from
           * sending the same Slack notification
           * during the same hour.
           */
          const shouldNotify =
            await redis.set(
              notifyKey,
              '1',
              'EX',
              3700,
              'NX'
            );

          if (
            shouldNotify
          ) {
            await notifyRateLimit(
              email.userId,
              email.sender.email,
              env.MAX_EMAILS_PER_HOUR
            ).catch(
              () => false
            );
          }

          await job.moveToDelayed(
            rate.nextAt,
            job.token
          );

          throw new DelayedError();
        }

        const slot =
          await reserveSendSlot(
            email.senderId,
            Math.max(
              email.campaign.delayMs,
              env.MIN_EMAIL_DELAY_MS
            )
          );

        const wait =
          slot - Date.now();

        if (
          wait > 0
        ) {
          await new Promise(
            (resolve) =>
              setTimeout(
                resolve,
                wait
              )
          );
        }

        try {
          const result =
            await sendEmail({
              from:
                email.sender.email,

              to:
                email.recipient,

              subject:
                email.subject,

              html:
                email.body,

              idempotencyKey:
                email.idempotencyKey,
            });

          const updated =
            await prisma.email.update({
              where: {
                id: email.id,
              },

              data: {
                status: 'SENT',

                sentAt: new Date(),

                errorMessage:
                  result.preview
                    ? `Preview: ${result.preview}`
                    : null,
              },
            });

          await indexEmail(
            updated
          );

          console.log(
            `Sent ${email.id} -> ${email.recipient}${
              result.preview
                ? ` (${result.preview})`
                : ''
            }`
          );
        } catch (
          err: any
        ) {
          await prisma.email.update({
            where: {
              id: email.id,
            },

            data: {
              status: 'FAILED',

              errorMessage:
                err?.message ||
                'SMTP error',
            },
          });

          throw err;
        }
      },

      {
        connection: redis,

        concurrency:
          env.WORKER_CONCURRENCY,

        lockDuration:
          60000,
      }
    );

  worker.on(
    'completed',
    (job) =>
      console.log(
        `Job completed ${job.id}`
      )
  );

  worker.on(
    'failed',
    (job, err) =>
      console.error(
        `Job failed ${job?.id}:`,
        err.message
      )
  );

  return worker;
}