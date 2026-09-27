import { Client } from '@elastic/elasticsearch';
import { env } from '../config/env';

export const es = new Client({
  node: env.ELASTICSEARCH_URL,
  ...(env.ELASTICSEARCH_API_KEY ? { auth: { apiKey: env.ELASTICSEARCH_API_KEY } } : {})
});

export async function ensureEmailIndex() {
  try {
    const exists = await es.indices.exists({ index: env.ELASTICSEARCH_INDEX });
    if (!exists) {
      await es.indices.create({
        index: env.ELASTICSEARCH_INDEX,
        mappings: {
          properties: {
            id: { type: 'keyword' }, userId: { type: 'keyword' }, senderId: { type: 'keyword' },
            recipient: { type: 'text' }, subject: { type: 'text' }, body: { type: 'text' },
            status: { type: 'keyword' }, scheduledAt: { type: 'date' }, sentAt: { type: 'date' }
          }
        }
      });
    }
  } catch (err) { console.error('Elasticsearch index setup failed:', err); }
}

export async function indexEmail(email: any) {
  try {
    await es.index({ index: env.ELASTICSEARCH_INDEX, id: email.id, document: {
      id: email.id, userId: email.userId, senderId: email.senderId, recipient: email.recipient,
      subject: email.subject, body: email.body, status: email.status,
      scheduledAt: email.scheduledAt, sentAt: email.sentAt
    }, refresh: true });
  } catch (err) { console.error('Elasticsearch index failed:', err); }
}

export async function searchEmails(userId: string, q: string) {
  const result = await es.search({ index: env.ELASTICSEARCH_INDEX, query: {
    bool: { must: q ? [{ multi_match: { query: q, fields: ['recipient', 'subject', 'body'] } }] : [{ match_all: {} }],
      filter: [{ term: { userId } }] }
  }, sort: [{ scheduledAt: 'desc' }] });
  return result.hits.hits.map((h: any) => h._source);
}
