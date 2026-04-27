/**
 * F*eather — Cloudflare Worker proxy
 *
 * Routes:
 *   OPTIONS /generate  → CORS preflight
 *   POST    /generate  → validate, rate-limit, call Anthropic, return {text}
 *   *                  → 404
 */

import {
  TEMP_BANDS,
  CONDITION_BUCKETS,
  BUCKET_TONES,
} from "../../shared/buckets.js";

// ── Build the temp-band and condition-override sections of the prompt
//    dynamically from shared/buckets.js, so this can never drift again. ──
const tempBandLines = TEMP_BANDS
  .map(b => `- ${b.label.padEnd(18)} ${BUCKET_TONES[b.key]}`)
  .join("\n");

const conditionLines = CONDITION_BUCKETS
  .map(b => `- ${b.key} (codes ${b.codes.join(", ")}): ${BUCKET_TONES[b.key]}`)
  .join("\n");

const SYSTEM_PROMPT = `You are the voice of F*eather, a brutally honest weather app.

HARD LIMIT: 12 words MAXIMUM across the entire output. If you exceed 12 words, you have failed.
FORMAT: exactly 2 sentences.
  - Sentence 1 (reaction): 4–7 words. A punchy, funny, sarcastic reaction to the weather.
  - Sentence 2 (advice): 2–5 words. A blunt practical tip. No fluff.
OUTPUT: only the message text. No quotes, labels, or commentary. No em dashes (—).

SWEAR RULE (mandatory): You MUST include exactly one censored swear word in almost every message. Use: f*ck, f*cking, sh*t, b*tch, a*s, d*mn, or h*ll (asterisk replaces the middle vowel). Skipping swears entirely is only allowed 1 in 5 messages for contrast. A message with no swear word is a failure unless it is that rare exception.
Tone: crude, sarcastic, witty. A friend who swears casually and finds weather mostly annoying or occasionally great.
OPENER RULE: NEVER start with "It is", "It's", "Today", or any form of "to be". Open with a noun, adjective, or expletive.
TEMPERATURE RULE: NEVER reference a temperature number not explicitly given in the user message. Do not spell out numbers ("sixteen"), do not reference band ranges. Only the provided temp/feels_like digits, and only if useful.

Tailor to temp + condition. These bands are EXACT — never blur between them.

Temperature tone (applies when no precipitation/fog/snow condition is present):
${tempBandLines}

Condition overrides (these take full priority over the temperature tone above):
${conditionLines}
- Overcast/cloudy (codes 2–3): NOT a precipitation event — let the temperature tone lead. Do not default to damp or gloomy.
- Clear sky (code 0):          full sunshine. Lean into sun/blue-sky imagery. Combine with temp tone.
- Mainly clear (code 1):       mostly sunny with some clouds. Treat like clear sky but slightly subdued.

Secondary signal rules (these MODIFY the base tone, do not replace it):
- feels_like vs temp: if |feels_like − temp| ≥ 4°C, acknowledge the gap ("feels worse than the number says" / "warmer than it looks").
- humidity ≥ 70 AND temp ≥ 23: add sticky/swampy/sweaty flavour.
- humidity ≤ 25 AND temp ≥ 28: arid/dry-heat flavour, dehydration jokes.
- wind 30–49 km/h: blustery, hat-thief tone.
- wind ≥ 50 km/h: chaotic, gale-force, "stay grounded" tone.
- uv_index ≥ 8: sunburn warnings, melanoma jokes welcome.
- uv_index ≥ 11: extreme — skin-melting intensity.
- temp_trend "warming": acknowledge it's improving ("warming up though").
- temp_trend "cooling": acknowledge the drop ("getting colder fast").
- temp_trend "stable": no trend mention.

Time-of-day awareness (time_context is one of: dawn, morning, day, evening, dusk, night, late_night):
- dawn (5–7am):        sunrise energy, just woken up, coffee welcome. Quiet and early.
- morning (8–10):      get-ready energy, productive, coffee jokes welcome.
- day (11–16):         activity-oriented. Outdoors suggestions are fine.
- evening (17–19):     social/dinner hour, still lively — the day isn't over. NOT winding down. No fatalism.
- dusk (sun just set): moody golden-hour-to-dark transition. Indoor pivot starting. No outdoor suggestions.
- night (22–23):       cozy indoor time, wrapping up the day. Person is still awake and active. NO sleep/rest/bed references.
- late_night (00–04):  explicitly late and dark. Low energy. Sleep and rest references are allowed HERE ONLY.

SLEEP RULE: NEVER mention sleep, rest, bed, tired, or "call it a night" unless time_context is late_night. At evening/dusk/night the person is still up — treat them as awake and active.

Seasonal anomaly hint (month is 1–12):
- Snow in months 5–9 (northern summer-ish): treat as freak weather, surprised tone.
- 27°C+ in months 12–2 (northern winter): treat as anomaly, "this isn't normal" energy.
- Otherwise: ignore month, let other rules dominate.

Anti-repeat rule:
If a "recent" array is provided in the user message, DO NOT reuse the same opener word, the same simile, or the same advice phrase. Vary the structure.

Examples (mix of tones — follow these EXACTLY for length and rhythm):
- "Rain hammering everything out there. Coat or regret it."  (9 words)
- "Hotter than satan's a*s out there. Stay hydrated."        (8 words)
- "Snow's coming down like a b*tch. Layer up."               (8 words)
- "F*cking gorgeous day. Get outside now."                   (6 words)
- "Cold as sh*t. Bundle up."                                 (5 words)
- "Sky's actually behaving for once. Enjoy it."              (7 words)
- "Crisp blue sky, mild breeze. Walk somewhere."             (7 words)
- "Decent enough out there. Don't waste it."                 (7 words)`;

// ── Validation rules ───────────────────────────────────────────────────────
const VALID_TIME_CONTEXTS = new Set(["dawn", "morning", "day", "evening", "dusk", "night", "late_night"]);
const VALID_TEMP_TRENDS   = new Set(["warming", "cooling", "stable"]);
const RATE_LIMIT = 20;

// Words that the OPENER must not be (first token, lowercased, stripped of punctuation).
const BANNED_OPENERS = new Set([
  "it", "its", "todays", "today", "is", "are", "was", "were", "be", "been", "am",
]);

function validateMessage(text) {
  if (!text || typeof text !== "string") return { ok: false, reason: "empty" };
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { ok: false, reason: "empty" };
  if (words.length > 12)  return { ok: false, reason: "too_long" };
  const first = words[0].toLowerCase().replace(/[^a-z]/g, "");
  if (BANNED_OPENERS.has(first)) return { ok: false, reason: "banned_opener" };
  return { ok: true };
}

// ── HTTP helpers ───────────────────────────────────────────────────────────
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

// ── Build the per-request user message ────────────────────────────────────
function buildUserMessage(p) {
  const lines = [
    `Temperature: ${p.temp}°C (feels like ${p.feels_like}°C).`,
    `Condition code: ${p.code}.`,
    `Wind: ${p.wind} km/h. Humidity: ${p.humidity}%. UV index: ${p.uv_index}.`,
    `Daylight: ${p.is_day ? "sun is up" : "sun is down"}. Time context: ${p.time_context}.`,
    `Month: ${p.month}. Trend: ${p.temp_trend}.`,
  ];
  if (Array.isArray(p.recent) && p.recent.length > 0) {
    const recentList = p.recent.slice(0, 5).map(m => `  - "${m}"`).join("\n");
    lines.push(`Recently shown for this location (DO NOT repeat or paraphrase):\n${recentList}`);
  }
  return lines.join("\n");
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const allowedOrigin = env.ALLOWED_ORIGIN || "";

    // ── CORS preflight ───────────────────────────────────────────────────
    if (req.method === "OPTIONS" && url.pathname === "/generate") {
      return new Response(null, { status: 204, headers: corsHeaders(allowedOrigin) });
    }

    const cors = corsHeaders(allowedOrigin);

    if (url.pathname !== "/generate" || req.method !== "POST") {
      return json({ error: "not_found" }, 404, cors);
    }

    // ── Origin check ─────────────────────────────────────────────────────
    const origin = req.headers.get("Origin") || "";
    if (allowedOrigin && origin !== allowedOrigin) {
      return json({ error: "forbidden" }, 403, cors);
    }

    // ── Parse + validate body ────────────────────────────────────────────
    let body;
    try { body = await req.json(); }
    catch { return json({ error: "invalid_json" }, 400, cors); }

    const {
      temp, code, wind, humidity,
      feels_like, uv_index, is_day,
      month, temp_trend,
      time_context,
      recent,
    } = body;

    const numbers = { temp, code, wind, humidity, feels_like, uv_index, month };
    for (const [k, v] of Object.entries(numbers)) {
      if (typeof v !== "number" || !Number.isFinite(v)) {
        return json({ error: "bad_request", detail: `${k} must be a finite number` }, 400, cors);
      }
    }
    if (typeof is_day !== "boolean")              return json({ error: "bad_request", detail: "is_day must be boolean" }, 400, cors);
    if (!VALID_TIME_CONTEXTS.has(time_context))   return json({ error: "bad_request", detail: "invalid time_context" }, 400, cors);
    if (!VALID_TEMP_TRENDS.has(temp_trend))       return json({ error: "bad_request", detail: "invalid temp_trend" }, 400, cors);
    if (recent != null && (!Array.isArray(recent) || recent.some(m => typeof m !== "string"))) {
      return json({ error: "bad_request", detail: "recent must be an array of strings" }, 400, cors);
    }

    // ── Rate limiting (bypassed if correct X-Bypass-Key header is present) ─
    const bypassKey = env.BYPASS_KEY || "";
    const requestKey = req.headers.get("X-Bypass-Key") || "";
    const bypassed = bypassKey && requestKey === bypassKey;

    if (!bypassed) {
      const ip =
        req.headers.get("CF-Connecting-IP") ||
        (req.headers.get("X-Forwarded-For") || "").split(",")[0].trim() ||
        "unknown";
      const today   = new Date().toISOString().slice(0, 10);
      const rateKey = `rl:${ip}:${today}`;

      const countStr = await env.RATE_LIMIT_KV.get(rateKey);
      const count    = parseInt(countStr || "0", 10);

      if (count >= RATE_LIMIT) {
        return json({ error: "rate_limited", limit: RATE_LIMIT, reset: "midnight UTC" }, 429, cors);
      }

      ctx.waitUntil(
        env.RATE_LIMIT_KV.put(rateKey, String(count + 1), { expirationTtl: 86400 }),
      );
    }

    // ── Call Anthropic ───────────────────────────────────────────────────
    const userMessage = buildUserMessage({
      temp, code, wind, humidity,
      feels_like, uv_index, is_day,
      month, temp_trend, time_context,
      recent,
    });

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
          messages: [{ role: "user", content: userMessage }],
        }),
      });
    } catch (err) {
      return json({ error: "upstream_unreachable", detail: err.message }, 502, cors);
    }

    if (!anthropicRes.ok) {
      return json({ error: "upstream", status: anthropicRes.status }, 502, cors);
    }

    let data;
    try { data = await anthropicRes.json(); }
    catch { return json({ error: "upstream_parse" }, 502, cors); }

    const text = data?.content?.[0]?.text?.trim();
    if (!text) return json({ error: "empty" }, 502, cors);

    // ── Post-validate against the hard rules ─────────────────────────────
    const v = validateMessage(text);
    if (!v.ok) {
      return json({ error: "validation_failed", reason: v.reason, attempted: text }, 502, cors);
    }

    return json({ text }, 200, cors);
  },
};
