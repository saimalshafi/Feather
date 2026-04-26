/**
 * F*eather — Cloudflare Worker proxy
 *
 * Routes:
 *   OPTIONS /generate  → CORS preflight
 *   POST    /generate  → validate, rate-limit, call Anthropic, return {text}
 *   *                  → 404
 */

const SYSTEM_PROMPT = `You are the voice of F*eather, a brutally honest weather app.

HARD LIMIT: 12 words MAXIMUM across the entire output. If you exceed 12 words, you have failed.
FORMAT: exactly 2 sentences.
  - Sentence 1 (reaction): 4–7 words. A punchy, funny, sarcastic reaction to the weather.
  - Sentence 2 (advice): 2–5 words. A blunt practical tip. No fluff.
OUTPUT: only the message text. No quotes, labels, or commentary.

Tone: sarcastic, witty, occasionally crude. A funny friend who swears but censors it (f*ck, sh*t, b*tch, a*s — asterisk replaces the middle vowel).
CRITICAL OPENER RULE: NEVER start with "It is", "It's", "Today", or any conjugation of "to be". Your opener must be a noun, adjective, or expletive — be aggressively creative.

Tailor to temp + condition:
- Below 0°C: existential dread, frozen misery
- 1–10°C: passive aggressive disappointment
- 11–18°C: mediocre, meh energy
- 19–25°C: surprisingly pleasant, suspicious optimism
- 26–33°C: spicy, sweat warnings
- Above 34°C: unhinged rage at the sun
- Rain: dramatic suffering
- Snow: childlike excitement OR existential dread based on temp
- Thunderstorm: theatrical fear
- Clear + perfect temp: rare genuine appreciation, still sarcastic

Time-of-day awareness (time_context provided in user message):
- morning: wake-up energy, get-ready vibe, coffee references welcome
- day: activity-oriented, outdoors suggestions are fine
- evening: winding-down energy, no urgent "go outside" suggestions
- night: late and dark. NEVER suggest going outside. Rest, sleep, indoor focus only.

Examples (follow these EXACTLY for length and rhythm):
- "Rain hammering everything outside. Stay in."  (6 words)
- "Hotter than satan's balls. Stay hydrated."  (6 words)
- "Snow's coming down like a b*tch! Stay warm."  (8 words)
- "F*cking gorgeous day. Get outside."  (5 words)
- "Cold as sh*t. Layer up."  (5 words)`;

const VALID_TIME_CONTEXTS = new Set(["morning", "day", "evening", "night"]);
const RATE_LIMIT = 20;

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(body, status, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const allowedOrigin = env.ALLOWED_ORIGIN || "";

    // ── CORS preflight ───────────────────────────────────────────────────────
    if (req.method === "OPTIONS" && url.pathname === "/generate") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(allowedOrigin),
      });
    }

    const cors = corsHeaders(allowedOrigin);

    // ── Route guard ──────────────────────────────────────────────────────────
    if (url.pathname !== "/generate" || req.method !== "POST") {
      return json({ error: "not_found" }, 404, cors);
    }

    // ── Origin check ─────────────────────────────────────────────────────────
    const origin = req.headers.get("Origin") || "";
    if (allowedOrigin && origin !== allowedOrigin) {
      return json({ error: "forbidden" }, 403, cors);
    }

    // ── Parse + validate body ────────────────────────────────────────────────
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid_json" }, 400, cors);
    }

    const { temp, code, wind, humidity, time_context } = body;
    if (
      typeof temp !== "number" ||
      typeof code !== "number" ||
      typeof wind !== "number" ||
      typeof humidity !== "number" ||
      !VALID_TIME_CONTEXTS.has(time_context)
    ) {
      return json(
        { error: "bad_request", detail: "temp, code, wind, humidity must be numbers; time_context must be morning|day|evening|night" },
        400,
        cors,
      );
    }

    // ── Rate limiting ────────────────────────────────────────────────────────
    const ip =
      req.headers.get("CF-Connecting-IP") ||
      (req.headers.get("X-Forwarded-For") || "").split(",")[0].trim() ||
      "unknown";
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
    const rateKey = `rl:${ip}:${today}`;

    const countStr = await env.RATE_LIMIT_KV.get(rateKey);
    const count = parseInt(countStr || "0", 10);

    if (count >= RATE_LIMIT) {
      return json(
        { error: "rate_limited", limit: RATE_LIMIT, reset: "midnight UTC" },
        429,
        cors,
      );
    }

    // Increment — fire-and-forget so it doesn't block the response
    ctx.waitUntil(
      env.RATE_LIMIT_KV.put(rateKey, String(count + 1), { expirationTtl: 86400 }),
    );

    // ── Call Anthropic ───────────────────────────────────────────────────────
    let anthropicRes;
    try {
      anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 100,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: `Temperature: ${temp}°C. Condition code: ${code}. Wind: ${wind} km/h. Humidity: ${humidity}%. Time context: ${time_context}.`,
            },
          ],
        }),
      });
    } catch (err) {
      return json({ error: "upstream_unreachable", detail: err.message }, 502, cors);
    }

    if (!anthropicRes.ok) {
      return json({ error: "upstream", status: anthropicRes.status }, 502, cors);
    }

    let data;
    try {
      data = await anthropicRes.json();
    } catch {
      return json({ error: "upstream_parse" }, 502, cors);
    }

    const text = data?.content?.[0]?.text?.trim();
    if (!text) {
      return json({ error: "empty" }, 502, cors);
    }

    return json({ text }, 200, cors);
  },
};
