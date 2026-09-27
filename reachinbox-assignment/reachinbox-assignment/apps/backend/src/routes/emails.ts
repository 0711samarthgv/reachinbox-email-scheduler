import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';

import { prisma } from '../lib/prisma';
import { requireAuth } from '../lib/auth';
import { emailQueue } from '../queue/emailQueue';
import { indexEmail, searchEmails } from '../services/elasticsearch';

export const emailsRouter = Router();

const scheduleSchema = z.object({
  senderId: z.string().uuid(),

  recipients: z
    .array(z.string().email())
    .min(1)
    .max(10000),

  subject: z
    .string()
    .min(1)
    .max(998),

  body: z
    .string()
    .min(1),

  startTime: z.coerce.date(),

  delayMs: z
    .number()
    .int()
    .min(0)
    .max(3600000),

  hourlyLimit: z
    .number()
    .int()
    .positive()
    .max(100000),
});


/* =========================================================
   SCHEDULE EMAILS
   ========================================================= */

emailsRouter.post(
  '/schedule',
  requireAuth,
  async (req, res) => {
    try {
      const parsed = scheduleSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          error: 'Invalid schedule request',
          details: parsed.error.flatten(),
        });
      }

      const data = parsed.data;

      if (
        data.startTime.getTime() <
        Date.now() - 30000
      ) {
        return res.status(400).json({
          error: 'Start time must be in the future',
        });
      }

      const sender =
        await prisma.emailAccount.findFirst({
          where: {
            id: data.senderId,
            userId: res.locals.userId,
          },
        });

      if (!sender) {
        return res.status(404).json({
          error: 'Sender not found',
        });
      }

      const campaign =
        await prisma.campaign.create({
          data: {
            userId: res.locals.userId,
            senderId: sender.id,
            subject: data.subject,
            body: data.body,
            startTime: data.startTime,
            delayMs: data.delayMs,
            hourlyLimit: data.hourlyLimit,
          },
        });

      const created = [];

      for (
        let i = 0;
        i < data.recipients.length;
        i++
      ) {
        const recipient =
          data.recipients[i]
            .trim()
            .toLowerCase();

        const scheduledAt =
          new Date(
            data.startTime.getTime() +
              i * data.delayMs
          );

        const email =
          await prisma.email.create({
            data: {
              campaignId: campaign.id,
              userId: res.locals.userId,
              senderId: sender.id,
              recipient,
              subject: data.subject,
              body: data.body,
              scheduledAt,
              idempotencyKey:
                crypto.randomUUID(),
            },
          });

        const delay = Math.max(
          0,
          scheduledAt.getTime() -
            Date.now()
        );

        const job =
          await emailQueue.add(
            'send-email',
            {
              emailId: email.id,
            },
            {
              jobId: email.id,
              delay,
            }
          );

        const updated =
          await prisma.email.update({
            where: {
              id: email.id,
            },
            data: {
              bullJobId: job.id,
            },
          });

        await indexEmail(updated);

        created.push(updated);
      }

      return res.status(201).json({
        campaignId: campaign.id,
        count: created.length,
      });
    } catch (error) {
      console.error(
        'Schedule email error:',
        error
      );

      return res.status(500).json({
        error: 'Failed to schedule emails',
      });
    }
  }
);


/* =========================================================
   SCHEDULED EMAILS
   ========================================================= */

emailsRouter.get(
  '/scheduled',
  requireAuth,
  async (req, res) => {
    try {
      const limit = Math.min(
        Number(req.query.limit) || 100,
        500
      );

      const emails =
        await prisma.email.findMany({
          where: {
            userId: res.locals.userId,
            status: 'SCHEDULED',
          },

          orderBy: {
            scheduledAt: 'asc',
          },

          take: limit,
        });

      return res.json(emails);
    } catch (error) {
      console.error(
        'Scheduled emails error:',
        error
      );

      return res.status(500).json({
        error:
          'Failed to fetch scheduled emails',
      });
    }
  }
);


/* =========================================================
   SENT EMAILS
   ========================================================= */

emailsRouter.get(
  '/sent',
  requireAuth,
  async (req, res) => {
    try {
      const limit = Math.min(
        Number(req.query.limit) || 100,
        500
      );

      const emails =
        await prisma.email.findMany({
          where: {
            userId: res.locals.userId,

            status: {
              in: [
                'SENT',
                'FAILED',
              ],
            },
          },

          orderBy: {
            sentAt: 'desc',
          },

          take: limit,
        });

      return res.json(emails);
    } catch (error) {
      console.error(
        'Sent emails error:',
        error
      );

      return res.status(500).json({
        error:
          'Failed to fetch sent emails',
      });
    }
  }
);


/* =========================================================
   ELASTICSEARCH SEARCH
   ========================================================= */

emailsRouter.get(
  '/search',
  requireAuth,
  async (req, res) => {
    try {
      const results =
        await searchEmails(
          res.locals.userId,
          String(req.query.q || '')
        );

      return res.json(results);
    } catch (error) {
      console.error(
        'Search error:',
        error
      );

      return res.status(503).json({
        error:
          'Search service unavailable',
      });
    }
  }
);


/* =========================================================
   EMAIL COUNTS
   IMPORTANT: This MUST come before /:id
   ========================================================= */

emailsRouter.get(
  '/stats/counts',
  requireAuth,
  async (_req, res) => {
    try {
      const [
        scheduled,
        sent,
      ] = await Promise.all([
        prisma.email.count({
          where: {
            userId: res.locals.userId,
            status: 'SCHEDULED',
          },
        }),

        prisma.email.count({
          where: {
            userId: res.locals.userId,
            status: 'SENT',
          },
        }),
      ]);

      return res.json({
        scheduled,
        sent,
      });
    } catch (error) {
      console.error(
        'Email counts error:',
        error
      );

      return res.status(500).json({
        error:
          'Failed to fetch email counts',
      });
    }
  }
);


/* =========================================================
   GET SINGLE EMAIL
   ========================================================= */

emailsRouter.get(
  '/:id',
  requireAuth,
  async (req, res) => {
    try {
      // Convert Express parameter to a guaranteed string
      const id = String(req.params.id);

      const email =
        await prisma.email.findFirst({
          where: {
            id,
            userId: res.locals.userId,
          },

          include: {
            sender: true,
            campaign: true,
          },
        });

      if (!email) {
        return res.status(404).json({
          error: 'Email not found',
        });
      }

      return res.json(email);
    } catch (error) {
      console.error(
        'Get email error:',
        error
      );

      return res.status(500).json({
        error:
          'Failed to fetch email',
      });
    }
  }
);