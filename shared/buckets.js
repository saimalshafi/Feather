/**
 * F*eather — shared bucket constants
 *
 * Single source of truth for the bucket system. Imported by:
 *   - Feather.jsx        (color palette, fallback message lookup)
 *   - worker/src/index.js (AI prompt construction, validation)
 *
 * If you change a band here, you change it everywhere.
 */

// ── Temperature bands (apply when no precipitation/fog condition) ───────────
export const TEMP_BANDS = [
  { key: "freezing",  min: -Infinity, max: 0,        label: "0°C and below" },
  { key: "cold",      min: 1,         max: 10,       label: "1–10°C" },
  { key: "mild",      min: 11,        max: 15,       label: "11–15°C" },
  { key: "pleasant",  min: 16,        max: 22,       label: "16–22°C" },
  { key: "hot",       min: 23,        max: 30,       label: "23–30°C" },
  { key: "scorching", min: 31,        max: Infinity, label: "31°C and above" },
];

// ── Condition buckets (override temperature when matched) ───────────────────
export const CONDITION_BUCKETS = [
  { key: "thunderstorm", codes: [95, 96, 99] },
  { key: "snow",         codes: [71, 72, 73, 74, 75, 76, 77, 85, 86] },
  { key: "rain",         codes: [61, 62, 63, 64, 65, 66, 67, 80, 81, 82] },
  { key: "drizzle",      codes: [51, 52, 53, 54, 55, 56, 57] },
  { key: "fog",          codes: [45, 48] },
];

// ── All bucket keys (for fallback-messages.json shape validation) ───────────
export const BUCKETS = [
  ...CONDITION_BUCKETS.map(b => b.key),
  ...TEMP_BANDS.map(b => b.key),
];

// ── Tone descriptions per bucket (used to build the AI system prompt) ──────
export const BUCKET_TONES = {
  freezing:     "frozen misery, existential dread",
  cold:         "passive-aggressive disappointment",
  mild:         "meh, jacket weather, nothing special",
  pleasant:     "actually decent — suspicious optimism, mild appreciation. NEVER call this damp, gloomy, cold, or mediocre",
  hot:          "sweaty, spicy discomfort",
  scorching:    "unhinged rage at the sun",
  thunderstorm: "theatrical fear",
  snow:         "childlike excitement if temp > 0°C; existential dread if temp ≤ 0°C",
  rain:         "dramatic suffering, soaked misery",
  drizzle:      "low-grade irritation, damp annoyance — less dramatic than rain, more petty",
  fog:          "eerie, low-visibility jokes",
};

// ── Bucket selector (condition wins over temperature) ───────────────────────
export function pickBucket(code, temp) {
  for (const cb of CONDITION_BUCKETS) {
    if (cb.codes.includes(code)) return cb.key;
  }
  const t = temp ?? 20;
  for (const tb of TEMP_BANDS) {
    if (t >= tb.min && t <= tb.max) return tb.key;
  }
  return "pleasant";
}

// ── Time-of-day context (dawn/morning/day/evening/dusk/night/late_night) ────
// Used by AI tone shaping. Fallback messages collapse this to day/night.
//
// Slots:
//   dawn       isDay  05–07   sunrise energy
//   morning    isDay  08–10   get-ready energy
//   day        isDay  11–16   activity-oriented
//   evening    isDay  17–19   social/dinner — still lively, sun still up
//   dusk      !isDay  17–21   sun just set, moody transition, indoor pivot
//   night     !isDay  22–23   cozy indoor, wrapping up — NO sleep talk
//   late_night !isDay  00–04   explicitly late — sleep/rest allowed here ONLY
export function timeContext(isDay, localHour) {
  if (isDay) {
    if (localHour >= 5  && localHour <= 7)  return "dawn";
    if (localHour >= 8  && localHour <= 10) return "morning";
    if (localHour >= 17 && localHour <= 19) return "evening";
    return "day";
  }
  // sun is down
  if (localHour >= 17 && localHour <= 21) return "dusk";
  if (localHour >= 22)                    return "night";
  return "late_night"; // 00–04
}

// Maps the 7 fine time contexts down to the 2 keys present in the JSON file.
export function timeContextToFallbackKey(tc) {
  return (tc === "late_night" || tc === "night" || tc === "evening" || tc === "dusk") ? "night" : "day";
}

// ── Parse local hour from Open-Meteo's city-local ISO string ────────────────
export function localHourFromISO(iso) {
  if (!iso) return 12;
  const match = iso.match(/T(\d{2}):/);
  return match ? parseInt(match[1], 10) : 12;
}

// ── Parse month (1-12) from Open-Meteo's city-local ISO string ──────────────
export function monthFromISO(iso) {
  if (!iso) return new Date().getUTCMonth() + 1;
  const match = iso.match(/^\d{4}-(\d{2})/);
  return match ? parseInt(match[1], 10) : new Date().getUTCMonth() + 1;
}

// ── Derive temp trend from current vs daily high/low ────────────────────────
// Returns "warming" | "cooling" | "stable"
export function tempTrend(currentTemp, dailyHigh, dailyLow) {
  if (currentTemp == null || dailyHigh == null || dailyLow == null) return "stable";
  const distFromHigh = dailyHigh - currentTemp;
  const distFromLow  = currentTemp - dailyLow;
  if (distFromHigh > 4 && distFromHigh > distFromLow) return "warming";
  if (distFromLow  > 4 && distFromLow  > distFromHigh) return "cooling";
  return "stable";
}
