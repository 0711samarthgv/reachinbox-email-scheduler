import nodemailer, {
  Transporter,
} from 'nodemailer';

import { env } from '../config/env';

let transporter:
  | Transporter
  | null = null;

let account: {
  user: string;
  pass: string;
} | null = null;

export async function getTransporter() {
  if (transporter) {
    return transporter;
  }

  if (
    env.ETHEREAL_USER &&
    env.ETHEREAL_PASSWORD
  ) {
    account = {
      user:
        env.ETHEREAL_USER,

      pass:
        env.ETHEREAL_PASSWORD,
    };

    transporter =
      nodemailer.createTransport({
        host:
          env.ETHEREAL_HOST,

        port:
          env.ETHEREAL_PORT,

        secure:
          env.ETHEREAL_PORT ===
          465,

        auth:
          account,
      });
  } else {
    const testAccount =
      await nodemailer.createTestAccount();

    account = {
      user:
        testAccount.user,

      pass:
        testAccount.pass,
    };

    transporter =
      nodemailer.createTransport({
        host:
          testAccount.smtp.host,

        port:
          testAccount.smtp.port,

        secure:
          testAccount.smtp.secure,

        auth: {
          user:
            testAccount.user,

          pass:
            testAccount.pass,
        },
      });

    console.log(
      `Ethereal test account: ${testAccount.user}`
    );
  }

  return transporter;
}

export async function sendEmail(
  params: {
    from: string;
    to: string;
    subject: string;
    html: string;
    idempotencyKey: string;
  }
) {
  const transport =
    await getTransporter();

  const info =
    await transport.sendMail({
      from:
        params.from,

      to:
        params.to,

      subject:
        params.subject,

      html:
        params.html,

      headers: {
        'X-ReachInbox-Idempotency-Key':
          params.idempotencyKey,
      },
    });

  const preview =
    nodemailer.getTestMessageUrl(
      info
    ) || undefined;

  return {
    messageId:
      info.messageId,

    preview,
  };
}