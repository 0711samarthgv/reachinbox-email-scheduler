import { prisma } from '../lib/prisma';

export async function notifyRateLimit(userId: string, senderEmail: string, limit: number) {
  const connection = await prisma.slackConnection.findFirst({ where: { userId }, orderBy: { updatedAt: 'desc' } });
  if (!connection) return false;
  const text = `ReachInbox rate limit reached: ${senderEmail} has reached the hourly limit of ${limit} emails. Remaining jobs were deferred to the next available window.`;
  if (!connection.slackUserId) return false;
  const open = await fetch('https://slack.com/api/conversations.open', { method:'POST', headers:{ Authorization:`Bearer ${connection.accessToken}`, 'Content-Type':'application/json' }, body:JSON.stringify({ users: connection.slackUserId }) });
  const openData = await open.json() as any;
  const channel = openData.channel?.id;
  if (!openData.ok || !channel) return false;
  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST', headers: { Authorization: `Bearer ${connection.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, text })
  });
  const data = await response.json() as { ok?: boolean };
  return Boolean(data.ok);
}
