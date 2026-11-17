// Abuse limits for a public deployment that spends a paid API key.
// Per-client sliding window plus a global daily cap on /api/ask. In-memory: resets on restart, per instance.
export function createLimiter({ perMinute = 10, perDay = 500, now = () => Date.now() } = {}) {
  const clients = new Map();
  let day = Math.floor(now() / 86400000), dayCount = 0;
  return {
    check(clientId) {
      const t = now(), today = Math.floor(t / 86400000);
      if (today !== day) { day = today; dayCount = 0; clients.clear(); }
      if (dayCount >= perDay) return { ok: false, error: 'daily_limit_reached', retryAfter: Math.ceil(((today + 1) * 86400000 - t) / 1000) };
      const recent = (clients.get(clientId) ?? []).filter(x => t - x < 60000);
      if (recent.length >= perMinute) { clients.set(clientId, recent); return { ok: false, error: 'rate_limited', retryAfter: Math.ceil((60000 - (t - recent[0])) / 1000) }; }
      recent.push(t); clients.set(clientId, recent); dayCount++;
      if (clients.size > 10000) clients.delete(clients.keys().next().value);
      return { ok: true };
    },
  };
}

// Behind a hosting proxy the client address is the first X-Forwarded-For entry; only trust it when told to.
export function clientId(req, trustProxy) {
  const fwd = trustProxy && req.headers['x-forwarded-for'];
  return (fwd ? String(fwd).split(',')[0].trim() : req.socket.remoteAddress) || 'unknown';
}
