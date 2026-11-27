export function createCallbackGuard({ cooldownMs = 1200, now = () => Date.now() } = {}) {
  const lastSeen = new Map();
  return async (ctx, next) => {
    const query = ctx.callbackQuery;
    if (!query || ctx.from?.id == null) return next();
    const key = String(ctx.from.id) + ":" + String(query.data || "");
    const timestamp = now(),
      previous = lastSeen.get(key);
    if (previous != null && timestamp - previous < cooldownMs) {
      try {
        await ctx.answerCallbackQuery({ text: "در حال پردازش؛ کمی صبر کنید." });
      } catch {}
      return;
    }
    lastSeen.set(key, timestamp);
    if (lastSeen.size > 2000) {
      for (const [entry, seen] of lastSeen)
        if (timestamp - seen > 60000) lastSeen.delete(entry);
    }
    return next();
  };
}
