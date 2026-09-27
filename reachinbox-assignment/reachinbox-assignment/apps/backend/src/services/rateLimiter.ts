import { redis } from '../lib/redis';

const RATE_LUA = `
local senderKey = KEYS[1]
local campaignKey = KEYS[2]
local senderLimit = tonumber(ARGV[1])
local campaignLimit = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])
local senderCount = tonumber(redis.call('GET', senderKey) or '0')
local campaignCount = tonumber(redis.call('GET', campaignKey) or '0')
if senderCount >= senderLimit or campaignCount >= campaignLimit then return 0 end
local s = redis.call('INCR', senderKey)
local c = redis.call('INCR', campaignKey)
if s == 1 then redis.call('EXPIRE', senderKey, ttl) end
if c == 1 then redis.call('EXPIRE', campaignKey, ttl) end
return 1
`;

const SLOT_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local spacing = tonumber(ARGV[2])
local previous = tonumber(redis.call('GET', key) or '0')
local slot = math.max(now, previous) + spacing
redis.call('SET', key, tostring(slot), 'PX', math.max(spacing * 4, 60000))
return slot
`;

export async function reserveHourlySlot(senderId: string, senderLimit: number, campaignId: string, campaignLimit: number) {
  const window = Math.floor(Date.now() / 3600000);
  const senderKey = `rate:sender:${senderId}:${window}`;
  const campaignKey = `rate:campaign:${campaignId}:${window}`;
  const allowed = Number(await redis.eval(RATE_LUA, 2, senderKey, campaignKey, String(senderLimit), String(campaignLimit), '3700')) === 1;
  return { allowed, nextAt: (window + 1) * 3600000 };
}

export async function reserveSendSlot(senderId: string, spacingMs: number) {
  const key = `send-slot:${senderId}`;
  return Number(await redis.eval(SLOT_LUA, 1, key, Date.now().toString(), spacingMs.toString()));
}
