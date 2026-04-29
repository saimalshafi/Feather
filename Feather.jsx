import React, { useState, useEffect, useRef, useCallback } from "react";
import fallbackMessages from "./src/fallback-messages.json";
import {
  pickBucket,
  timeContext,
  timeContextToFallbackKey,
  localHourFromISO,
  monthFromISO,
  tempTrend,
} from "./shared/buckets.js";

/* ------------------------------------------------------------------ *
 * F*eather — sarcastic weather app
 * Single-file React component. Drop into any React 18+ project.
 *
 * Typography contract:
 *   - Impact  -> every number in the app
 *   - SF Pro  -> every label / descriptor / word that isn't a number
 * ------------------------------------------------------------------ */

const IMPACT_STACK = `Impact, "Haettenschweiler", "Arial Narrow Bold", sans-serif`;
const SFPRO_STACK = `-apple-system, "SF Pro Display", "SF Pro Text", "Helvetica Neue", sans-serif`;

// SYSTEM_PROMPT lives in worker/src/index.js — not in the browser bundle.

// ----- Weather code + is_day -> emoji (WMO standard, with day/night variants) -----
function weatherEmoji(code, isDay = true) {
  if (code === 0) return isDay ? "☀️" : "🌙";
  if (code === 1) return isDay ? "🌤️" : "🌙";
  if (code === 2) return isDay ? "⛅" : "☁️";
  if (code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫️";
  if (code >= 51 && code <= 57) return "🌦️";
  if (code >= 61 && code <= 67) return "🌧️";
  if (code >= 71 && code <= 77) return "🌨️";
  if (code >= 80 && code <= 82) return "🌦️";
  if (code === 85 || code === 86) return "🌨️";
  if (code === 95) return "⛈️";
  if (code === 96 || code === 99) return "⛈️";
  return "🌡️";
}

function conditionName(code) {
  if (code === 0) return "Clear sky";
  if (code === 1) return "Mainly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Rain showers";
  if (code === 95) return "Thunderstorm";
  if (code === 96 || code === 99) return "Thunderstorm with hail";
  return "Unknown";
}

// pickBucket lives in shared/buckets.js — single source of truth across client + worker.

const PALETTE = {
  day: {
    thunderstorm: "#575785",
    snow:         "#E8F2FA",
    rain:         "#B8C8D8",
    drizzle:      "#C2D0DC",
    fog:          "#C8C8C0",
    freezing:     "#D6E8F5",
    cold:         "#E8EFF5",
    mild:         "#f2efe8",
    pleasant:     "#E0EDFD",
    hot:          "#eac99f",
    scorching:    "#f5ae6b",
  },
  night: {
    thunderstorm: "#1A1A28",
    snow:         "#2C3E55",
    rain:         "#1A2535",
    drizzle:      "#162028",
    fog:          "#222120",
    freezing:     "#182030",
    cold:         "#1A2035",
    mild:         "#1E2035",
    pleasant:     "#1A1E30",
    hot:          "#2c1607",
    scorching:    "#2d0e06",
  },
};

function bgFor(code, temp, isDay) {
  if (code == null && temp == null) return PALETTE[isDay ? "day" : "night"].pleasant;
  return PALETTE[isDay ? "day" : "night"][pickBucket(code, temp)];
}

// Darkens a hex color by a fixed amount (0–1 scale of the 0–255 range).
function darkenHex(hex, amount = 0.07) {
  const h = hex.replace("#", "");
  const r = Math.max(0, parseInt(h.slice(0, 2), 16) - Math.round(255 * amount));
  const g = Math.max(0, parseInt(h.slice(2, 4), 16) - Math.round(255 * amount));
  const b = Math.max(0, parseInt(h.slice(4, 6), 16) - Math.round(255 * amount));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// Returns a subtle top-to-bottom gradient from base color to a slightly darker shade.
function bgGradient(color) {
  return `linear-gradient(180deg, ${color} 0%, ${darkenHex(color)} 100%)`;
}

// Widget card tint: day = slightly darkened; night = slightly lifted
function widgetTint(bg, isDay = true) {
  const hex = bg.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if (!isDay) {
    return `rgba(${Math.min(r + 14, 255)}, ${Math.min(g + 14, 255)}, ${Math.min(b + 14, 255)}, 0.18)`;
  }
  return `rgba(${Math.max(r - 18, 0)}, ${Math.max(g - 18, 0)}, ${Math.max(b - 18, 0)}, 0.55)`;
}

// Full theme token set derived from day/night mode
function themeFor(isDay) {
  if (isDay) return {
    fg:          "rgba(0,0,0,0.88)",
    fgMuted:     "rgba(0,0,0,0.55)",
    fgFaint:     "rgba(0,0,0,0.25)",
    glassBg:     "rgba(255,255,255,0.35)",
    glassBorder: "rgba(255,255,255,0.55)",
    glassText:   "rgba(0,0,0,0.78)",
    dotActive:   "rgba(0,0,0,0.75)",
    dotIdle:     "rgba(0,0,0,0.22)",
    cardBorder:  "rgba(0,0,0,0.08)",
  };
  return {
    fg:          "rgba(255,255,255,0.92)",
    fgMuted:     "rgba(255,255,255,0.65)",
    fgFaint:     "rgba(255,255,255,0.22)",
    glassBg:     "rgba(255,255,255,0.10)",
    glassBorder: "rgba(255,255,255,0.18)",
    glassText:   "rgba(255,255,255,0.88)",
    dotActive:   "rgba(255,255,255,0.85)",
    dotIdle:     "rgba(255,255,255,0.28)",
    cardBorder:  "rgba(255,255,255,0.10)",
  };
}

// ----- UV / AQI descriptors -----
function uvLabel(v) {
  if (v == null) return "—";
  if (v < 3) return "Low";
  if (v < 6) return "Moderate";
  if (v < 8) return "High";
  if (v < 11) return "Very High";
  return "Extreme";
}
function aqiLabel(v) {
  if (v == null) return "—";
  if (v <= 20) return "Good";
  if (v <= 40) return "Fair";
  if (v <= 60) return "Moderate";
  if (v <= 80) return "Poor";
  if (v <= 100) return "Very Poor";
  return "Unhealthy";
}
function humidityLabel(v) {
  if (v == null) return "";
  if (v < 40) return "Comfortable";
  if (v < 60) return "Moderate";
  if (v < 75) return "Sticky";
  return "Oppressive";
}

function feelsLikeDescriptor(temp, feels, wind) {
  const d = feels - temp;
  if (d <= -3) return wind > 15 ? "Feels colder due to wind" : "Feels colder";
  if (d >= 3) return "Feels warmer due to humidity";
  return "Matches the actual temp";
}

// ----- Auto-size hero font based on text length -----
// Binary-search for the largest font size (px) where all text fits inside the
// available width AND height — simulating word-wrap to count real line count.
//
// Impact character width ≈ 0.56 × fontSize (empirical for this weight).
// Overhead subtracted from innerHeight: safe-area-top (~59) + paddingTop(110)
//   + temp block(~72) + paddingBottom(80) ≈ 321px.
function heroFontSize(text) {
  if (!text) return "72px";

  const CHAR_RATIO = 0.56;   // Impact em-width per character
  const LINE_H    = 0.98;    // CSS lineHeight value

  // Cap availW at app max-width so desktop browsers don't over-estimate available space.
  // OVERHEAD: safe-area-top (~59px) only exists on mobile; subtract it on desktop.
  const APP_MAX_W = 480;
  const isDesktop = typeof window !== "undefined" && window.innerWidth > APP_MAX_W;
  const OVERHEAD  = isDesktop ? 262 : 321;
  const availW    = Math.min(typeof window !== "undefined" ? window.innerWidth : 393, APP_MAX_W) - 40;
  const availH    = (typeof window !== "undefined" ? window.innerHeight : 852) - OVERHEAD;

  const words = text.split(/\s+/).filter(Boolean);
  const longest = words.reduce((m, w) => Math.max(m, w.length), 1);

  // Simulate CSS word-wrap for a given font size, return number of lines.
  function lineCount(size) {
    let lines = 1, lineW = 0;
    const spaceW = size * CHAR_RATIO;
    for (const w of words) {
      const ww = w.length * size * CHAR_RATIO;
      if (lineW === 0) {
        lineW = ww;
      } else if (lineW + spaceW + ww <= availW) {
        lineW += spaceW + ww;
      } else {
        lines++;
        lineW = ww;
      }
    }
    return lines;
  }

  // Binary search: largest size where text fits both axes.
  let lo = 26, hi = 160;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    const fits =
      lineCount(mid) * mid * LINE_H <= availH &&
      longest * mid * CHAR_RATIO   <= availW;
    if (fits) lo = mid; else hi = mid;
  }

  return `${Math.max(26, Math.floor(lo))}px`;
}

// ----- Fallback hero messages (loaded from JSON, bucket + day/night aware) -----
function fallbackHero(temp, code, time_context = "day") {
  const bucket = pickBucket(code, temp);
  const timeKey = timeContextToFallbackKey(time_context);
  const arr = fallbackMessages?.[bucket]?.[timeKey];
  if (!arr || arr.length === 0) return "Weather's unreadable. Check outside yourself.";
  return arr[Math.floor(Math.random() * arr.length)];
}

// ----- Convert bgForTemp hex to tinted rgba for glass cards -----
function bgToGlassRgba(hex, alpha = 0.52) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// localHourFromISO + timeContext live in shared/buckets.js (now with dawn/dusk granularity).

// ----- Local time for a given IANA timezone -----
function cityLocalTime(timezone) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric", minute: "2-digit", hour12: true, timeZone: timezone,
    }).format(new Date());
  } catch {
    return "";
  }
}

/* ------------------------------------------------------------------ *
 * Saved cities persistence (localStorage)
 * Index 0 is always the geo/home city — never persisted here.
 * Only manually-added cities (index 1+) are saved.
 * ------------------------------------------------------------------ */
const SAVED_CITIES_KEY = "feather_cities";

function readSavedCities() {
  try {
    const arr = JSON.parse(localStorage.getItem(SAVED_CITIES_KEY) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

/* ------------------------------------------------------------------ *
 * Anti-repeat memory (per-city, last 5 messages, in localStorage)
 * ------------------------------------------------------------------ */
const RECENT_KEY = (lat, lon) =>
  `feather_recent_${Number(lat).toFixed(2)}_${Number(lon).toFixed(2)}`;

function readRecent(lat, lon) {
  try {
    const raw = localStorage.getItem(RECENT_KEY(lat, lon));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(0, 5) : [];
  } catch { return []; }
}

function writeRecent(lat, lon, message) {
  try {
    const prev = readRecent(lat, lon);
    const next = [message, ...prev.filter(m => m !== message)].slice(0, 5);
    localStorage.setItem(RECENT_KEY(lat, lon), JSON.stringify(next));
  } catch { /* quota or disabled — skip */ }
}

/* ------------------------------------------------------------------ *
 * Build the AI request payload from an Open-Meteo response
 * ------------------------------------------------------------------ */
function buildHeroPayload(w, lat, lon) {
  const c = w.current;
  const localHour = localHourFromISO(c.time);
  const isDay = c.is_day === 1;
  return {
    temp:       Math.round(c.temperature_2m),
    code:       c.weathercode,
    wind:       Math.round(c.windspeed_10m),
    humidity:   Math.round(c.relative_humidity_2m),
    feels_like: Math.round(c.apparent_temperature),
    uv_index:   c.uv_index != null ? Math.round(c.uv_index) : 0,
    is_day:     isDay,
    month:      monthFromISO(c.time),
    temp_trend: tempTrend(c.temperature_2m, w.daily?.temperature_2m_max?.[0], w.daily?.temperature_2m_min?.[0]),
    time_context: timeContext(isDay, localHour),
    lat, lon,
  };
}

/* ------------------------------------------------------------------ *
 * Claude API call — proxied through Cloudflare Worker
 * ------------------------------------------------------------------ */
async function generateHero(payload) {
  const {
    temp, code, wind, humidity,
    feels_like, uv_index, is_day,
    month, temp_trend,
    time_context = "day",
    lat, lon,
  } = payload;

  const PROXY = import.meta.env.VITE_PROXY_URL;
  const fb = () => fallbackHero(temp, code, time_context);

  if (!PROXY) {
    console.log("%c[F*eather] source: FALLBACK (no proxy configured)", "color:#b58b00;font-weight:bold");
    return { text: fb(), source: "fallback", reason: "no_proxy" };
  }

  const recent = (lat != null && lon != null) ? readRecent(lat, lon) : [];

  try {
    const BYPASS = import.meta.env.VITE_BYPASS_KEY;
    const res = await fetch(`${PROXY}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(BYPASS ? { "X-Bypass-Key": BYPASS } : {}),
      },
      body: JSON.stringify({
        temp, code, wind, humidity,
        feels_like, uv_index, is_day,
        month, temp_trend,
        time_context,
        recent,
      }),
    });
    if (!res.ok) {
      const reason = res.status === 429 ? "rate_limited" : `http_${res.status}`;
      console.log(`%c[F*eather] source: FALLBACK (${reason})`, "color:#b58b00;font-weight:bold");
      return { text: fb(), source: "fallback", reason };
    }
    const data = await res.json();
    if (!data.text) {
      console.log("%c[F*eather] source: FALLBACK (empty response)", "color:#b58b00;font-weight:bold");
      return { text: fb(), source: "fallback", reason: "empty" };
    }
    console.log("%c[F*eather] source: ANTHROPIC", "color:#2e7d32;font-weight:bold");
    if (lat != null && lon != null) writeRecent(lat, lon, data.text);
    return { text: data.text, source: "anthropic", reason: "ok" };
  } catch (err) {
    console.log(`%c[F*eather] source: FALLBACK (${err.message})`, "color:#b58b00;font-weight:bold");
    return { text: fb(), source: "fallback", reason: "fetch_error" };
  }
}

function sectionHeaderStyle(theme) {
  return {
    fontFamily: SFPRO_STACK,
    fontSize: "12px",
    fontWeight: 600,
    color: theme.fgMuted,
    textTransform: "uppercase",
    letterSpacing: "0.6px",
    marginBottom: "10px",
    paddingLeft: "4px",
  };
}

// Global CSS — defined outside so both Feather and CitiesScreen can use it
const GlobalStyle = (
  <style>{`
    *, *::before, *::after { box-sizing: border-box; }
    html, body, #root { margin: 0; padding: 0; height: 100%; }
    html { color-scheme: light; background-color: #ffffff; }
    body { overscroll-behavior: none; background-color: #ffffff; }
    :root { --bottom-gap: 20px; --content-bottom: 80px; }
    .feather-noscroll::-webkit-scrollbar { display: none; }
    .feather-noscroll { scrollbar-width: none; -ms-overflow-style: none; }
    @keyframes featherPulse {
      0%, 100% { opacity: 1; }
      50%      { opacity: 0.4; }
    }
    @keyframes featherFadeIn {
      from { opacity: 0; transform: scale(0.985); }
      to   { opacity: 1; transform: scale(1); }
    }
    @keyframes featherSpin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    @keyframes featherCitiesIn {
      from { opacity: 0; transform: translateY(18px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes featherCitiesOut {
      from { opacity: 1; transform: translateY(0); }
      to   { opacity: 0; transform: translateY(18px); }
    }
    .feather-loading-dots::after {
      content: "...";
      display: inline-block;
      animation: featherPulse 1.2s ease-in-out infinite;
    }
  `}</style>
);

/* ------------------------------------------------------------------ *
 * Main component
 * ------------------------------------------------------------------ */
export default function Feather() {
  const [phase, setPhase] = useState("loading"); // loading | error | ready
  const [cities, setCities] = useState([]); // [{ name, lat, lon, weather, aqi, hero, isMyLocation, timezone }]
  const [activeIdx, setActiveIdx] = useState(0);
  const [heroVisible, setHeroVisible] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCities, setShowCities] = useState(false);
  const [citySearch, setCitySearch] = useState("");
  const [citySearching, setCitySearching] = useState(false);
  const [citySearchError, setCitySearchError] = useState("");
  const [manualCity, setManualCity] = useState("");
  const [geoError, setGeoError] = useState("");

  // UI interaction state
  const [pillActive, setPillActive] = useState(false);
  const [citiesClosing, setCitiesClosing] = useState(false);

  // Gesture state
  const [screen, setScreen] = useState(0);
  const [drag, setDrag] = useState(0);
  const [pullY, setPullY] = useState(0);
  const dragStart = useRef({ x: null, y: null });
  const gesture = useRef(null);
  const dragging = useRef(false);
  const containerRef = useRef(null);
  const viewportWidth = useRef(400);
  const PULL_THRESHOLD = 80;

  const MIN_SPLASH_MS = 2000;
  const bootedAt = useRef(Date.now());
  const waitForSplashMin = () => {
    const elapsed = Date.now() - bootedAt.current;
    return elapsed >= MIN_SPLASH_MS
      ? Promise.resolve()
      : new Promise((r) => setTimeout(r, MIN_SPLASH_MS - elapsed));
  };

  // ----- Restore saved cities silently in the background after boot -----
  const restoreSavedCities = useCallback(async () => {
    const saved = readSavedCities();
    if (saved.length === 0) return;
    const results = await Promise.allSettled(
      saved.map(async (c) => {
        const weatherUrl =
          `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}` +
          `&current=temperature_2m,apparent_temperature,weathercode,windspeed_10m,uv_index,relative_humidity_2m,is_day` +
          `&hourly=temperature_2m,weathercode,is_day` +
          `&daily=temperature_2m_max,temperature_2m_min,weathercode` +
          `&timezone=auto&forecast_days=10`;
        const aqiUrl =
          `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${c.lat}&longitude=${c.lon}` +
          `&current=european_aqi&timezone=auto`;
        const [wRes, aRes] = await Promise.all([fetch(weatherUrl), fetch(aqiUrl).catch(() => null)]);
        if (!wRes.ok) throw new Error();
        const w = await wRes.json();
        const a = aRes?.ok ? await aRes.json() : null;
        const hero = await generateHero(buildHeroPayload(w, c.lat, c.lon));
        return {
          name: c.name, lat: c.lat, lon: c.lon,
          weather: w,
          aqi: a?.current?.european_aqi ?? null,
          hero: hero.text,
          isMyLocation: false,
          timezone: w.timezone || c.timezone || "UTC",
        };
      })
    );
    const restored = results.filter(r => r.status === "fulfilled").map(r => r.value);
    if (restored.length > 0) setCities(prev => [...prev, ...restored]);
  }, []);

  // ----- Initial fetch pipeline (geolocation + error-screen search) -----
  const loadAll = useCallback(async (lat, lon, isMyLocation = false) => {
    try {
      const weatherUrl =
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,apparent_temperature,weathercode,windspeed_10m,uv_index,relative_humidity_2m,is_day` +
        `&hourly=temperature_2m,weathercode,is_day` +
        `&daily=temperature_2m_max,temperature_2m_min,weathercode` +
        `&timezone=auto&forecast_days=10`;
      const aqiUrl =
        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
        `&current=european_aqi&timezone=auto`;
      const geoUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;

      const [wRes, aRes, gRes] = await Promise.all([
        fetch(weatherUrl),
        fetch(aqiUrl).catch(() => null),
        fetch(geoUrl, { headers: { "Accept-Language": "en" } }).catch(() => null),
      ]);
      if (!wRes.ok) throw new Error("Weather fetch failed");
      const w = await wRes.json();
      const a = aRes && aRes.ok ? await aRes.json() : null;
      const g = gRes && gRes.ok ? await gRes.json() : null;

      const name =
        g?.address?.city || g?.address?.town || g?.address?.village ||
        g?.address?.municipality || g?.address?.county || "Your Area";

      const [result] = await Promise.all([
        generateHero(buildHeroPayload(w, lat, lon)),
        waitForSplashMin(),
      ]);

      setCities([{
        name, lat, lon,
        weather: w,
        aqi: a?.current?.european_aqi ?? null,
        hero: result.text,
        isMyLocation,
        timezone: w.timezone || "UTC",
      }]);
      setActiveIdx(0);
      setPhase("ready");
      if (isMyLocation) restoreSavedCities();
    } catch {
      setGeoError("Could not load weather. Try again.");
      await waitForSplashMin();
      setPhase("error");
    }
  }, []);


  // ----- Boot: geolocate -----
  const didBoot = useRef(false);
  useEffect(() => {
    if (didBoot.current) return;
    didBoot.current = true;
    if (!navigator.geolocation) {
      setGeoError("Geolocation unavailable. Enter a city.");
      waitForSplashMin().then(() => setPhase("error"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => loadAll(pos.coords.latitude, pos.coords.longitude, true),
      () => {
        setGeoError("Location denied. Enter a city.");
        waitForSplashMin().then(() => setPhase("error"));
      },
      { timeout: 10000 }
    );
  }, [loadAll]);

  // ----- Persist manually-added cities (index 1+) to localStorage -----
  useEffect(() => {
    if (phase !== "ready") return;
    try {
      const toSave = cities.slice(1).map(({ name, lat, lon, timezone }) => ({ name, lat, lon, timezone }));
      localStorage.setItem(SAVED_CITIES_KEY, JSON.stringify(toSave));
    } catch { /* storage full or disabled */ }
  }, [cities, phase]);

  // Keep viewportWidth in sync with the actual container
  useEffect(() => {
    const update = () => {
      if (containerRef.current) viewportWidth.current = containerRef.current.offsetWidth;
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // ----- Error screen: manual city entry -----
  const submitCity = async () => {
    const q = manualCity.trim();
    if (!q) return;
    setPhase("loading");
    try {
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1`);
      const d = await r.json();
      const hit = d?.results?.[0];
      if (!hit) { setPhase("error"); setGeoError(`No match for "${q}".`); return; }
      loadAll(hit.latitude, hit.longitude, false);
    } catch {
      setPhase("error");
      setGeoError("Lookup failed. Try again.");
    }
  };

  // ----- Cities screen: add a new city from a geocoding hit -----
  const addCity = async (hit) => {
    if (!hit || citySearching) return;
    setCitySearching(true);
    setCitySearchError("");
    try {
      const weatherUrl =
        `https://api.open-meteo.com/v1/forecast?latitude=${hit.latitude}&longitude=${hit.longitude}` +
        `&current=temperature_2m,apparent_temperature,weathercode,windspeed_10m,uv_index,relative_humidity_2m,is_day` +
        `&hourly=temperature_2m,weathercode,is_day` +
        `&daily=temperature_2m_max,temperature_2m_min,weathercode` +
        `&timezone=auto&forecast_days=10`;
      const aqiUrl =
        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${hit.latitude}&longitude=${hit.longitude}` +
        `&current=european_aqi&timezone=auto`;

      const [wRes, aRes] = await Promise.all([fetch(weatherUrl), fetch(aqiUrl).catch(() => null)]);
      if (!wRes.ok) throw new Error();
      const w = await wRes.json();
      const a = aRes && aRes.ok ? await aRes.json() : null;
      const result = await generateHero(buildHeroPayload(w, hit.latitude, hit.longitude));

      const newIdx = cities.length;
      setCities(prev => [...prev, {
        name: hit.name,
        lat: hit.latitude,
        lon: hit.longitude,
        weather: w,
        aqi: a?.current?.european_aqi ?? null,
        hero: result.text,
        isMyLocation: false,
        timezone: w.timezone || "UTC",
      }]);
      setActiveIdx(newIdx);
      setCitySearch("");
      setScreen(0);
      setShowCities(false);
    } catch {
      setCitySearchError("Couldn't load weather. Try again.");
    } finally {
      setCitySearching(false);
    }
  };

  // ----- Delete a saved city (index 0 is protected) -----
  const deleteCity = (idx) => {
    if (idx === 0) return;
    setCities(prev => prev.filter((_, i) => i !== idx));
    setActiveIdx(prev => {
      if (idx === prev) return 0;
      if (idx < prev) return prev - 1;
      return prev;
    });
  };

  // ----- Refresh hero text for active city -----
  const refreshHero = async () => {
    const city = cities[activeIdx];
    if (!city?.weather || refreshing) return;
    const w = city.weather;
    setRefreshing(true);
    setHeroVisible(false);
    await new Promise((r) => setTimeout(r, 300));
    const result = await generateHero(buildHeroPayload(w, city.lat, city.lon));
    setCities(prev => prev.map((c, i) => i === activeIdx ? { ...c, hero: result.text } : c));
    setHeroVisible(true);
    setRefreshing(false);
  };

  // ----- Close cities screen with slide-down exit animation -----
  const closeCities = useCallback((selectIdx = null) => {
    if (selectIdx !== null) setActiveIdx(selectIdx);
    setCitiesClosing(true);
    setTimeout(() => {
      setShowCities(false);
      setCitiesClosing(false);
      if (selectIdx !== null) setScreen(0);
    }, 260);
  }, []);

  // ----- Gesture handlers -----
  const onDown = (x, y) => {
    dragging.current = true;
    dragStart.current = { x, y };
    gesture.current = null;
    viewportWidth.current = containerRef.current?.offsetWidth || window.innerWidth;
  };

  const onMove = (x, y, e) => {
    if (!dragging.current) return;
    const dx = x - dragStart.current.x;
    const dy = y - dragStart.current.y;

    if (!gesture.current && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      if (Math.abs(dy) > Math.abs(dx) && dy > 0 && screen === 0) {
        gesture.current = "v";
      } else {
        gesture.current = "h";
      }
    }

    if (gesture.current === "h") {
      const max = viewportWidth.current;
      let next = dx;
      if (screen === 0 && dx > 0) next = dx * 0.2;
      if (screen === 1 && dx < 0) next = dx * 0.2;
      if (next > max) next = max;
      if (next < -max) next = -max;
      setDrag(next);
      if (e && Math.abs(dx) > 10) e.preventDefault?.();
    } else if (gesture.current === "v") {
      const raw = Math.max(0, dy);
      const eased = raw <= PULL_THRESHOLD
        ? raw
        : PULL_THRESHOLD + (raw - PULL_THRESHOLD) * 0.35;
      setPullY(eased);
      if (e && dy > 10) e.preventDefault?.();
    }
  };

  const onUp = () => {
    if (!dragging.current) return;
    if (gesture.current === "h") {
      const threshold = 50;
      if (screen === 0 && drag < -threshold) setScreen(1);
      else if (screen === 1 && drag > threshold) setScreen(0);
      setDrag(0);
    } else if (gesture.current === "v") {
      if (pullY >= PULL_THRESHOLD && !refreshing) refreshHero();
      setPullY(0);
    }
    dragging.current = false;
    dragStart.current = { x: null, y: null };
    gesture.current = null;
  };

  const touchProps = {
    onTouchStart: (e) => onDown(e.touches[0].clientX, e.touches[0].clientY),
    onTouchMove: (e) => onMove(e.touches[0].clientX, e.touches[0].clientY, e),
    onTouchEnd: onUp,
    onMouseDown: (e) => onDown(e.clientX, e.clientY),
    onMouseMove: (e) => { if (dragging.current) onMove(e.clientX, e.clientY, e); },
    onMouseUp: onUp,
    onMouseLeave: onUp,
  };

  // ----- Derived values -----
  const activeCity = cities[activeIdx] ?? null;
  const weather = activeCity?.weather ?? null;
  const cityName = activeCity?.name ?? "";
  const aqi = activeCity?.aqi ?? null;
  const hero = activeCity?.hero ?? "";
  const temp = weather ? Math.round(weather.current.temperature_2m) : null;
  const feels = weather ? Math.round(weather.current.apparent_temperature) : null;
  const humidity = weather ? Math.round(weather.current.relative_humidity_2m) : null;
  const windspd = weather ? Math.round(weather.current.windspeed_10m) : null;
  const uv = weather ? weather.current.uv_index : null;
  const code = weather ? weather.current.weathercode : null;
  // isDay: default to true (day theme) when weather not yet loaded (splash/error)
  const isDay = phase !== "ready" ? true : (weather?.current?.is_day === 1);
  const theme = themeFor(isDay);
  const bg = bgFor(code, temp, isDay);
  const cardTint = widgetTint(bg, isDay);

  // Keep theme-color, body/html background, and color-scheme in sync.
  // iOS derives the home-indicator colour from:
  //   1. The CSS `color-scheme` property on <html>  ← most reliable
  //   2. The background-color of <html>/<body>       ← fills safe-area zone
  //   3. <meta name="color-scheme">                  ← browser-chrome hint
  useEffect(() => {
    // Two independent questions:
    // 1. What colour fills the safe-area strip below the app? → always the weather bg,
    //    white only during the splash / cities screen.
    // 2. Which home-indicator style should iOS render? → dark pill on day/light screens,
    //    white pill on night/dark screens.
    const isSplashOrCities = phase === "loading" || showCities;
    const bgBottom = isSplashOrCities ? "#ffffff" : darkenHex(bg);
    const scheme   = (isSplashOrCities || isDay) ? "light" : "dark";

    // theme-color (Android chrome bar / PWA splash tint)
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute("content", isSplashOrCities ? "#ffffff" : bg);

    // Fill the safe-area gap below 100dvh with the matching weather colour
    document.body.style.backgroundColor = bgBottom;
    document.documentElement.style.backgroundColor = bgBottom;

    // CSS color-scheme on <html> — what iOS actually reads for home-indicator colour
    document.documentElement.style.colorScheme = scheme;

    // meta tag (belt-and-suspenders for other browsers)
    let schemeMeta = document.querySelector('meta[name="color-scheme"]');
    if (!schemeMeta) {
      schemeMeta = document.createElement('meta');
      schemeMeta.setAttribute('name', 'color-scheme');
      document.head.appendChild(schemeMeta);
    }
    schemeMeta.setAttribute('content', scheme);
  }, [bg, phase, showCities, isDay]);

  /* -------------------- RENDER -------------------- */

  const outerStyle = {
    position: "fixed",
    inset: 0,
    width: "100vw",
    height: "100dvh",
    background: bgGradient(bg),
    color: theme.fg,
    transition: "color 800ms ease",
    overflow: "hidden",
    userSelect: "none",
    WebkitUserSelect: "none",
    touchAction: "pan-y",
    fontFamily: SFPRO_STACK,
    display: "flex",
    justifyContent: "center",
  };

  const APP_MAX_WIDTH = 480;
  const rootStyle = {
    position: "relative",
    width: "100%",
    maxWidth: `${APP_MAX_WIDTH}px`,
    height: "100%",
    overflow: "hidden",
  };

  // ---- Splash ----
  if (phase === "loading") {
    return (
      <div style={{ ...outerStyle, background: "#ffffff", color: "rgba(0,0,0,0.88)" }}>
        {GlobalStyle}
        <div style={rootStyle}>
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            paddingTop: "env(safe-area-inset-top, 0px)",
          }}>
            <div style={{ fontFamily: IMPACT_STACK, fontSize: "64px", letterSpacing: "-1px", animation: "featherFadeIn 700ms ease-out both" }}>
              F*eather
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Error / manual city entry ----
  if (phase === "error") {
    return (
      <div style={outerStyle}>
        {GlobalStyle}
        <div style={rootStyle}>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 32px", gap: "20px" }}>
            <div style={{ fontFamily: IMPACT_STACK, fontSize: "48px" }}>F*eather</div>
            <div style={{ fontFamily: SFPRO_STACK, fontSize: "15px", color: "rgba(0,0,0,0.55)", textAlign: "center", maxWidth: "320px", lineHeight: 1.4 }}>
              {geoError || "Enter a city to continue."}
            </div>
            <input
              value={manualCity}
              onChange={(e) => setManualCity(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitCity(); }}
              placeholder="City"
              style={{ fontFamily: SFPRO_STACK, fontSize: "16px", padding: "12px 16px", width: "min(320px, 80vw)", borderRadius: "12px", border: "1px solid rgba(0,0,0,0.15)", background: "rgba(255,255,255,0.6)", outline: "none", textAlign: "center" }}
              autoFocus
            />
            <button
              onClick={submitCity}
              style={{ fontFamily: SFPRO_STACK, fontSize: "14px", fontWeight: 600, padding: "10px 24px", borderRadius: "999px", border: "1px solid rgba(0,0,0,0.2)", background: "rgba(0,0,0,0.85)", color: "#fff", cursor: "pointer" }}
            >Find weather</button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Cities list screen ----
  if (showCities) {
    return (
      <>
        {GlobalStyle}
        <CitiesScreen
          cities={cities}
          activeIdx={activeIdx}
          citySearch={citySearch}
          setCitySearch={(v) => { setCitySearch(v); setCitySearchError(""); }}
          citySearching={citySearching}
          citySearchError={citySearchError}
          onSelectCity={(i) => closeCities(i)}
          onSearch={addCity}
          onDeleteCity={deleteCity}
          onClose={() => closeCities()}
          closing={citiesClosing}
        />
      </>
    );
  }

  // ---- Main + details ----
  const offset = -(screen * viewportWidth.current) + drag;

  const nowHourIdx = (() => {
    if (!weather?.hourly?.time) return 0;
    const tz = activeCity?.timezone || "UTC";
    try {
      // Open-Meteo hourly times are in the city's local timezone ("2024-04-26T14:00").
      // We must compare against the CITY's current local time, not the device's.
      // sv-SE locale reliably formats as "YYYY-MM-DD HH:MM" → replace space → ISO prefix.
      const cityNowStr = new Intl.DateTimeFormat("sv-SE", {
        timeZone: tz,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hour12: false,
      }).format(new Date()).replace(" ", "T"); // "YYYY-MM-DDTHH:MM"

      let best = 0;
      for (let i = 0; i < weather.hourly.time.length; i++) {
        if (weather.hourly.time[i] <= cityNowStr) best = i;
        else break;
      }
      return best;
    } catch {
      return 0;
    }
  })();

  // Normalised position: 0 = fully on main screen, 1 = fully on details
  // Used for smooth pill-temp fade while dragging.
  const vw = viewportWidth.current || 400;
  const screenPos = Math.max(0, Math.min(1, (screen * vw - drag) / vw));
  const pillTempOpacity = Math.max(0, Math.min(1, (screenPos - 0.3) / 0.3));

  const pullProgress = Math.min(pullY / PULL_THRESHOLD, 1);

  return (
    <div style={outerStyle}>
      {GlobalStyle}
      <div style={rootStyle} {...touchProps} ref={containerRef}>

        {/* Pull-to-refresh spinner */}
        <div style={{
          position: "absolute", top: 0, left: "50%",
          transform: refreshing ? "translate(-50%, 70px)" : `translate(-50%, ${pullY > 0 ? pullY - 10 : -80}px)`,
          transition: dragging.current ? "none" : "transform 300ms cubic-bezier(0.4, 0, 0.2, 1)",
          opacity: refreshing || pullY > 0 ? 1 : 0,
          zIndex: 15, width: "40px", height: "40px", borderRadius: "50%",
          background: theme.glassBg, border: `1px solid ${theme.glassBorder}`,
          backdropFilter: "blur(20px) saturate(180%)", WebkitBackdropFilter: "blur(20px) saturate(180%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: theme.fgMuted, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", pointerEvents: "none",
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
            style={{
              transform: refreshing ? "none" : `rotate(${pullProgress * 360}deg)`,
              opacity: refreshing ? 1 : 0.4 + pullProgress * 0.6,
              animation: refreshing ? "featherSpin 0.9s linear infinite" : "none",
              transition: dragging.current ? "none" : "transform 200ms ease, opacity 200ms ease",
            }}>
            <polyline points="23 4 23 10 17 10"></polyline>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
        </div>

        {/* Sliding pane wrapper */}
        <div style={{
          display: "flex", width: "200%", height: "100%",
          transform: `translateX(${offset}px) translateY(${gesture.current === "v" ? pullY * 0.6 : 0}px)`,
          transition: dragging.current ? "none" : "transform 420ms cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        }}>

          {/* ---------- SCREEN 1: MAIN ---------- */}
          <div style={{
            width: "50%", height: "100%", position: "relative",
            display: "flex", flexDirection: "column", alignItems: "center",
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 110px)",
            paddingBottom: "var(--content-bottom)",
            paddingLeft: "20px", paddingRight: "20px",
          }}>
            {/* Temperature */}
            <div style={{ marginBottom: "40px", opacity: refreshing ? 0 : 1, transition: "opacity 200ms ease" }}>
              <div style={{ fontFamily: IMPACT_STACK, fontSize: "32px", color: theme.fgMuted, letterSpacing: "-0.5px", lineHeight: 1 }}>
                {temp != null ? `${temp}°` : "—"}
              </div>
            </div>

            {/* Hero text — starts from the top after the temp, flows downward */}
            <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "0", width: "100%", overflow: "hidden" }}>
              {refreshing && !heroVisible ? (
                // Skeleton loading lines while AI generates a new quip
                <div style={{ width: "100%", paddingTop: "6px", display: "flex", flexDirection: "column", alignItems: "center" }}>
                  {[82, 68, 54].map((w, i) => (
                    <div key={i} style={{
                      height: "46px", borderRadius: "8px", marginBottom: "16px",
                      background: isDay ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.12)",
                      animation: `featherPulse 1.4s ease-in-out ${i * 0.15}s infinite`,
                      width: `${w}%`,
                    }} />
                  ))}
                </div>
              ) : (
                <div style={{
                  fontFamily: IMPACT_STACK, fontSize: heroFontSize(hero), lineHeight: 0.98,
                  textAlign: "center", letterSpacing: "-1px",
                  opacity: heroVisible ? 1 : 0, transform: heroVisible ? "scale(1)" : "scale(0.97)",
                  transition: "opacity 500ms ease, transform 500ms ease, font-size 300ms ease",
                  maxWidth: "640px",
                }}>
                  {hero}
                </div>
              )}
            </div>
          </div>

          {/* ---------- SCREEN 2: DETAILS ---------- */}
          <div className="feather-noscroll" style={{
            width: "50%", height: "100%", overflowY: "auto",
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 90px)",
            paddingRight: "14px", paddingLeft: "14px",
            paddingBottom: "var(--content-bottom)",
          }}>
            <div style={sectionHeaderStyle(theme)}>Hourly Forecast</div>

            <div style={{ position: "relative" }}>
              <div
                className="feather-noscroll"
                style={{ display: "flex", gap: "10px", overflowX: "auto", padding: "4px 4px 14px", scrollSnapType: "x proximity", touchAction: "pan-x" }}
                onTouchStart={e => e.stopPropagation()}
                onTouchMove={e => e.stopPropagation()}
                onTouchEnd={e => e.stopPropagation()}
              >
                {weather && weather.hourly?.time?.slice(nowHourIdx, nowHourIdx + 24).map((t, i) => {
                  const idx = nowHourIdx + i;
                  // Parse hour directly from the Open-Meteo ISO string ("2024-04-26T14:00")
                  // so the label reflects the CITY's local time, not the device's timezone.
                  const hr = localHourFromISO(t);
                  const label = i === 0 ? "Now" : `${hr === 0 ? 12 : hr > 12 ? hr - 12 : hr}${hr >= 12 ? "PM" : "AM"}`;
                  return (
                    <div key={t} style={{ minWidth: "60px", padding: "10px 6px", borderRadius: "14px", background: cardTint, display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", scrollSnapAlign: "start" }}>
                      <div style={{ fontFamily: SFPRO_STACK, fontSize: "11px", fontWeight: i === 0 ? 600 : 500, color: i === 0 ? theme.fg : theme.fgMuted }}>{label}</div>
                      <div style={{ fontSize: "20px" }}>{weatherEmoji(weather.hourly.weathercode[idx], weather.hourly.is_day?.[idx] === 1)}</div>
                      <div style={{ fontFamily: IMPACT_STACK, fontSize: "20px" }}>{Math.round(weather.hourly.temperature_2m[idx])}°</div>
                    </div>
                  );
                })}
              </div>
              {/* Right-edge fade: hints that the strip is scrollable */}
              <div style={{
                position: "absolute", right: 0, top: "4px", bottom: "14px",
                width: "48px", pointerEvents: "none",
                background: `linear-gradient(to right, transparent, ${bg})`,
              }} />
            </div>

            <div style={{ ...sectionHeaderStyle(theme), marginTop: "28px" }}>10-Day Forecast</div>

            <div style={{ borderRadius: "16px", background: cardTint, padding: "4px 16px" }}>
              {weather && weather.daily?.time?.map((d, i) => {
                const date = new Date(d);
                const name = i === 0 ? "Today" : date.toLocaleDateString(undefined, { weekday: "long" });
                const hi = Math.round(weather.daily.temperature_2m_max[i]);
                const lo = Math.round(weather.daily.temperature_2m_min[i]);
                return (
                  <div key={d} style={{ display: "grid", gridTemplateColumns: "1fr 40px 1fr", alignItems: "center", padding: "14px 0", borderBottom: i === weather.daily.time.length - 1 ? "none" : `1px solid ${theme.cardBorder}` }}>
                    <div style={{ fontFamily: SFPRO_STACK, fontSize: "14px", fontWeight: 500 }}>{name}</div>
                    <div style={{ textAlign: "center", fontSize: "20px" }}>{weatherEmoji(weather.daily.weathercode[i])}</div>
                    <div style={{ fontFamily: IMPACT_STACK, fontSize: "17px", textAlign: "right", letterSpacing: "0.5px" }}>
                      <span style={{ color: theme.fgMuted }}>{lo}°</span>
                      <span style={{ color: theme.fgFaint, margin: "0 6px" }}>|</span>
                      <span>{hi}°</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "28px" }}>
              <Widget label="Feels Like" value={feels != null ? `${feels}°` : "—"} sub={feels != null ? feelsLikeDescriptor(temp, feels, windspd) : ""} tint={cardTint} theme={theme} />
              <Widget label="UV Index" value={uv != null ? `${Math.round(uv)}` : "—"} sub={uvLabel(uv)} tint={cardTint} theme={theme} />
              <Widget label="Humidity" value={humidity != null ? `${humidity}%` : "—"} sub={humidityLabel(humidity)} tint={cardTint} theme={theme} />
              <Widget label="Air Quality" value={aqi != null ? `${Math.round(aqi)}` : "—"} sub={aqiLabel(aqi)} tint={cardTint} theme={theme} />
            </div>
          </div>
        </div>

        {/* ---- Floating top pill (tappable) ---- */}
        <div style={{
          position: "absolute",
          top: "calc(env(safe-area-inset-top, 0px) + 20px)",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10,
        }}>
          <div
            onClick={() => setShowCities(true)}
            onPointerDown={() => setPillActive(true)}
            onPointerUp={() => setPillActive(false)}
            onPointerLeave={() => setPillActive(false)}
            style={{
              fontFamily: SFPRO_STACK, fontSize: "14px", fontWeight: 500,
              padding: "8px 18px", borderRadius: "999px",
              border: `1px solid ${theme.glassBorder}`,
              background: theme.glassBg,
              color: theme.glassText,
              backdropFilter: "blur(22px) saturate(180%)", WebkitBackdropFilter: "blur(22px) saturate(180%)",
              boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
              display: "inline-flex", alignItems: "center", gap: "10px",
              whiteSpace: "nowrap", cursor: "pointer",
              transform: pillActive ? "scale(0.93)" : "scale(1)",
              transition: pillActive
                ? "transform 80ms ease, background 800ms ease, border-color 800ms ease, color 800ms ease"
                : "transform 200ms ease, background 800ms ease, border-color 800ms ease, color 800ms ease",
            }}>
            <span>{cityName || "—"}</span>
            {temp != null && !refreshing && pillTempOpacity > 0.01 && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "10px", opacity: pillTempOpacity, transition: dragging.current ? "none" : "opacity 200ms ease" }}>
                <span style={{ color: theme.fgFaint, fontFamily: SFPRO_STACK, fontWeight: 300 }}>|</span>
                <span style={{ fontFamily: IMPACT_STACK, fontSize: "14px", letterSpacing: "0.3px", lineHeight: 1 }}>{temp}°</span>
              </span>
            )}
          </div>
        </div>

        {/* ---- Floating bottom page indicator ---- */}
        <div style={{
          position: "absolute",
          bottom: "var(--bottom-gap)",
          left: "50%", transform: "translateX(-50%)",
          zIndex: 10, pointerEvents: "none",
          padding: "8px 14px", borderRadius: "999px",
          border: `1px solid ${theme.glassBorder}`,
          background: theme.glassBg,
          backdropFilter: "blur(22px) saturate(180%)", WebkitBackdropFilter: "blur(22px) saturate(180%)",
          boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
          display: "flex", gap: "7px", alignItems: "center",
          transition: "background 800ms ease, border-color 800ms ease",
        }}>
          <Dot active={screen === 0} theme={theme} />
          <Dot active={screen === 1} theme={theme} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Subcomponents
 * ------------------------------------------------------------------ */
function Dot({ active, theme }) {
  const t = theme || {
    dotActive: "rgba(0,0,0,0.75)",
    dotIdle:   "rgba(0,0,0,0.22)",
  };
  return (
    <div style={{
      width: "7px", height: "7px", borderRadius: "50%",
      background: active ? t.dotActive : t.dotIdle,
      transition: "background 200ms ease",
    }} />
  );
}

function Widget({ label, value, sub, tint, theme }) {
  const t = theme || { fg: "rgba(0,0,0,0.88)", fgMuted: "rgba(0,0,0,0.55)" };
  return (
    <div style={{
      background: tint, borderRadius: "16px", padding: "14px 16px",
      aspectRatio: "1 / 1", display: "flex", flexDirection: "column",
      justifyContent: "flex-start", minHeight: "130px",
    }}>
      <div style={{ fontFamily: SFPRO_STACK, fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.6px", color: t.fgMuted, marginBottom: "10px" }}>{label}</div>
      <div style={{ fontFamily: IMPACT_STACK, fontSize: "42px", lineHeight: 1, letterSpacing: "-0.5px", color: t.fg }}>{value}</div>
      <div style={{ fontFamily: SFPRO_STACK, fontSize: "12px", color: t.fgMuted, lineHeight: 1.3, marginTop: "auto" }}>{sub}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Cities list screen
 * ------------------------------------------------------------------ */
function CitiesScreen({ cities, activeIdx, citySearch, setCitySearch, citySearching, citySearchError, onSelectCity, onSearch, onDeleteCity, closing }) {
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const searchAreaRef = useRef(null);

  // ---- Swipe-to-delete state ----
  const DELETE_WIDTH = 88;
  const SWIPE_THRESHOLD = 44;
  const [openIdx, setOpenIdx] = useState(null);
  const [swipingIdx, setSwipingIdx] = useState(null); // tracks active drag for button visibility
  const [liveOffset, setLiveOffset] = useState(0);
  const liveOffsetRef = useRef(0);
  const swipeRef = useRef({ idx: null, startX: 0, isDragging: false, initialOpen: false });

  const setOffset = (val) => { liveOffsetRef.current = val; setLiveOffset(val); };

  const startSwipe = useCallback((i, clientX) => {
    if (i === 0) return;
    swipeRef.current = { idx: i, startX: clientX, isDragging: true, initialOpen: openIdx === i };
    setSwipingIdx(i);
    setOffset(openIdx === i ? -DELETE_WIDTH : 0);
  }, [openIdx, DELETE_WIDTH]);

  const moveSwipe = useCallback((clientX) => {
    if (!swipeRef.current.isDragging) return;
    const base = swipeRef.current.initialOpen ? -DELETE_WIDTH : 0;
    const dx = clientX - swipeRef.current.startX;
    setOffset(Math.min(0, Math.max(-DELETE_WIDTH, base + dx)));
  }, [DELETE_WIDTH]);

  const endSwipe = useCallback(() => {
    if (!swipeRef.current.isDragging) return;
    const idx = swipeRef.current.idx;
    swipeRef.current.isDragging = false;
    setSwipingIdx(null);
    if (liveOffsetRef.current < -SWIPE_THRESHOLD) setOpenIdx(idx);
    else setOpenIdx(null);
  }, [SWIPE_THRESHOLD]);

  const getTranslateX = (i) => {
    if (swipeRef.current.isDragging && swipeRef.current.idx === i) return liveOffset;
    if (openIdx === i) return -DELETE_WIDTH;
    return 0;
  };
  const isCardDragging = (i) => swipeRef.current.isDragging && swipeRef.current.idx === i;

  // Document-level mouse listeners for desktop swipe testing
  useEffect(() => {
    const onMM = (e) => moveSwipe(e.clientX);
    const onMU = () => endSwipe();
    document.addEventListener("mousemove", onMM);
    document.addEventListener("mouseup", onMU);
    return () => { document.removeEventListener("mousemove", onMM); document.removeEventListener("mouseup", onMU); };
  }, [moveSwipe, endSwipe]);

  // Close suggestions when clicking outside the search area
  useEffect(() => {
    const handler = (e) => {
      if (searchAreaRef.current && !searchAreaRef.current.contains(e.target)) {
        setSuggestions([]);
        setCitySearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, []);

  // Lift search bar above the keyboard on iOS PWA using visualViewport API.
  // On desktop/browser the viewport resizes with the keyboard so offset stays 0.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      // Offset = how many px the keyboard is covering from the bottom
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardOffset(offset);
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  // Debounced suggestions fetch
  useEffect(() => {
    const q = citySearch.trim();
    if (!q) { setSuggestions([]); return; }
    const timer = setTimeout(async () => {
      setSuggestionsLoading(true);
      try {
        const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=10`);
        const d = await r.json();
        const seen = new Set();
        const unique = (d?.results || []).filter(hit => {
          const key = `${hit.name}|${hit.admin1 || ""}|${hit.country || ""}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }).slice(0, 6);
        setSuggestions(unique);
      } catch {
        setSuggestions([]);
      } finally {
        setSuggestionsLoading(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [citySearch]);

  const handleSelectSuggestion = (hit) => {
    setSuggestions([]);
    onSearch(hit);
  };

  return (
    <div style={{
      position: "fixed", inset: 0,
      backgroundColor: "#ffffff",
      display: "flex", justifyContent: "center",
      fontFamily: SFPRO_STACK,
      userSelect: "none", WebkitUserSelect: "none",
      animation: closing
        ? "featherCitiesOut 260ms ease-in both"
        : "featherCitiesIn 280ms cubic-bezier(0.25, 0.46, 0.45, 0.94) both",
    }}>
      <div style={{ width: "100%", maxWidth: "480px", display: "flex", flexDirection: "column", height: "100%" }}>

        {/* Header */}
        <div style={{ padding: "calc(env(safe-area-inset-top, 0px) + 20px) 20px 24px", display: "flex", justifyContent: "flex-start", alignItems: "flex-end" }}>
          <div
            onClick={() => setShowAbout(true)}
            style={{ fontFamily: IMPACT_STACK, fontSize: "34px", letterSpacing: "-0.5px", color: "#111", cursor: "pointer" }}
          >F*eather</div>
        </div>

        {/* City cards */}
        <div className="feather-noscroll" style={{ flex: 1, overflowY: "auto", padding: "4px 16px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>
          {cities.map((city, i) => {
            const t = city.weather ? Math.round(city.weather.current.temperature_2m) : null;
            const wCode = city.weather?.current?.weathercode ?? 0;
            const hi = city.weather?.daily?.temperature_2m_max?.[0];
            const lo = city.weather?.daily?.temperature_2m_min?.[0];
            const cityIsDay = city.weather?.current?.is_day === 1;
            const cardBg = bgFor(wCode, t, cityIsDay);
            const cardTheme = themeFor(cityIsDay);
            const localTime = cityLocalTime(city.timezone);
            const tx = getTranslateX(i);
            const dragging = isCardDragging(i);

            return (
              <div key={i} style={{ position: "relative" }}>

                {/* Delete button — only rendered once a swipe starts or card is open */}
                {i > 0 && (openIdx === i || swipingIdx === i) && (
                  <div
                    onClick={(e) => { e.stopPropagation(); onDeleteCity(i); setOpenIdx(null); }}
                    style={{
                      position: "absolute", right: 0, top: 0, bottom: 0,
                      width: DELETE_WIDTH,
                      background: "#ff3b30",
                      borderRadius: "18px",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: "pointer",
                      zIndex: 0,
                    }}
                  >
                    <span style={{ fontFamily: SFPRO_STACK, fontSize: "14px", fontWeight: 600, color: "#fff", letterSpacing: "0.1px" }}>Delete</span>
                  </div>
                )}

                {/* Sliding card */}
                <div
                  onTouchStart={(e) => { e.stopPropagation(); startSwipe(i, e.touches[0].clientX); }}
                  onTouchMove={(e) => { e.stopPropagation(); moveSwipe(e.touches[0].clientX); }}
                  onTouchEnd={(e) => { e.stopPropagation(); endSwipe(); }}
                  onMouseDown={(e) => { if (i !== 0) startSwipe(i, e.clientX); }}
                  onClick={() => {
                    if (openIdx !== null) { setOpenIdx(null); return; }
                    onSelectCity(i);
                  }}
                  style={{
                    position: "relative", zIndex: 1,
                    background: bgGradient(cardBg),
                    border: "none",
                    borderRadius: "18px",
                    padding: "18px 20px 16px",
                    cursor: "pointer",
                    transform: `translateX(${tx}px)`,
                    transition: dragging ? "none" : "transform 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94)",
                    willChange: "transform",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontFamily: SFPRO_STACK, fontSize: "22px", fontWeight: 700, color: cardTheme.fg, letterSpacing: "-0.3px" }}>{city.name}</div>
                      <div style={{ fontFamily: SFPRO_STACK, fontSize: "13px", color: cardTheme.fgMuted, marginTop: "2px" }}>
                        {city.isMyLocation ? "My Location" : localTime}
                      </div>
                    </div>
                    <div style={{ fontFamily: IMPACT_STACK, fontSize: "52px", lineHeight: 1, letterSpacing: "-1px", color: cardTheme.fg }}>
                      {t != null ? `${t}°` : "—"}
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "18px" }}>
                    <div style={{ fontFamily: SFPRO_STACK, fontSize: "13px", fontWeight: 500, color: cardTheme.fgMuted }}>{conditionName(wCode)}</div>
                    <div style={{ fontFamily: IMPACT_STACK, fontSize: "13px", letterSpacing: "0.3px", color: cardTheme.fgMuted }}>
                      H:{hi != null ? Math.round(hi) : "—"}°&nbsp;&nbsp;L:{lo != null ? Math.round(lo) : "—"}°
                    </div>
                  </div>
                </div>

              </div>
            );
          })}
        </div>

        {/* Search bar + suggestions */}
        {/* zIndex: 20 ensures the dropdown floats above city cards (backdrop-filter on each card
            creates a new stacking context that would otherwise paint over the dropdown) */}
        <div ref={searchAreaRef} style={{
          padding: "10px 16px", paddingBottom: "var(--bottom-gap)",
          background: "#ffffff", position: "relative", zIndex: 20,
          transform: `translateY(-${keyboardOffset}px)`,
          transition: "transform 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        }}>

          {/* Suggestions dropdown */}
          {(suggestions.length > 0 || suggestionsLoading) && (
            <div style={{
              position: "absolute", bottom: "100%", left: "16px", right: "16px",
              marginBottom: "6px",
              background: "rgba(240,240,245,0.85)",
              backdropFilter: "blur(28px) saturate(200%)",
              WebkitBackdropFilter: "blur(28px) saturate(200%)",
              border: "1px solid rgba(255,255,255,0.65)",
              borderRadius: "16px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
              overflow: "hidden",
              zIndex: 21,
            }}>
              {suggestionsLoading && suggestions.length === 0 && (
                <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ width: "13px", height: "13px", border: "2px solid rgba(0,0,0,0.12)", borderTopColor: "rgba(0,0,0,0.5)", borderRadius: "50%", animation: "featherSpin 0.8s linear infinite" }} />
                  <span style={{ fontFamily: SFPRO_STACK, fontSize: "14px", color: "rgba(0,0,0,0.5)" }}>Searching…</span>
                </div>
              )}
              {suggestions.map((hit, i) => (
                <div
                  key={hit.id ?? i}
                  onClick={() => handleSelectSuggestion(hit)}
                  style={{
                    padding: "12px 16px",
                    borderBottom: i < suggestions.length - 1 ? "1px solid rgba(0,0,0,0.06)" : "none",
                    cursor: "pointer",
                    display: "flex", flexDirection: "column", gap: "2px",
                  }}
                >
                  <div style={{ fontFamily: SFPRO_STACK, fontSize: "15px", fontWeight: 500, color: "#111" }}>{hit.name}</div>
                  <div style={{ fontFamily: SFPRO_STACK, fontSize: "12px", color: "rgba(0,0,0,0.45)" }}>
                    {[hit.admin1, hit.country].filter(Boolean).join(", ")}
                  </div>
                </div>
              ))}
            </div>
          )}

          {citySearchError && (
            <div style={{ fontFamily: SFPRO_STACK, fontSize: "13px", color: "#c0392b", marginBottom: "8px", paddingLeft: "2px" }}>{citySearchError}</div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(0,0,0,0.07)", borderRadius: "12px", padding: "10px 14px" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.38)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              value={citySearch}
              onChange={(e) => setCitySearch(e.target.value)}
              placeholder="Search for a city"
              style={{ flex: 1, fontFamily: SFPRO_STACK, fontSize: "15px", border: "none", background: "transparent", outline: "none", color: "#111" }}
            />
            {citySearching && (
              <div style={{ width: "14px", height: "14px", border: "2px solid rgba(0,0,0,0.15)", borderTopColor: "rgba(0,0,0,0.55)", borderRadius: "50%", animation: "featherSpin 0.8s linear infinite", flexShrink: 0 }} />
            )}
          </div>
        </div>
      </div>

      {/* ---- About modal ---- */}
      {showAbout && (
        <div
          onClick={() => setShowAbout(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 100,
            background: "rgba(0,0,0,0.28)",
            backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "24px",
            animation: "featherFadeIn 200ms ease both",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: "360px",
              background: "rgba(255,255,255,0.88)",
              backdropFilter: "blur(40px) saturate(200%)",
              WebkitBackdropFilter: "blur(40px) saturate(200%)",
              border: "1px solid rgba(255,255,255,0.7)",
              borderRadius: "24px",
              padding: "32px 28px 28px",
              boxShadow: "0 24px 64px rgba(0,0,0,0.16), 0 4px 16px rgba(0,0,0,0.08)",
              display: "flex", flexDirection: "column", gap: "0",
            }}
          >
            {/* Title */}
            <div style={{ fontFamily: IMPACT_STACK, fontSize: "48px", letterSpacing: "-1px", color: "#111", lineHeight: 1, marginBottom: "14px" }}>
              F*eather
            </div>

            {/* Subtitle */}
            <div style={{ fontFamily: SFPRO_STACK, fontSize: "15px", color: "rgba(0,0,0,0.60)", lineHeight: 1.55, marginBottom: "28px" }}>
              A brutally honest weather app for the days when you just need the f*cking weather.
            </div>

            {/* Divider */}
            <div style={{ height: "1px", background: "rgba(0,0,0,0.08)", marginBottom: "20px" }} />

            {/* Made by */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontFamily: SFPRO_STACK, fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.7px", color: "rgba(0,0,0,0.38)", marginBottom: "3px" }}>
                  Made by
                </div>
                <div style={{ fontFamily: SFPRO_STACK, fontSize: "16px", fontWeight: 600, color: "#111", letterSpacing: "-0.2px" }}>
                  Saim Alshafi
                </div>
              </div>
              {/* GitHub link */}
              <a
                href="https://github.com/saimalshafi/Feather"
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: "44px", height: "44px", borderRadius: "12px",
                  background: "rgba(0,0,0,0.06)",
                  border: "1px solid rgba(0,0,0,0.08)",
                  color: "#111", textDecoration: "none",
                  transition: "background 150ms ease",
                  flexShrink: 0,
                }}
                onPointerEnter={e => e.currentTarget.style.background = "rgba(0,0,0,0.11)"}
                onPointerLeave={e => e.currentTarget.style.background = "rgba(0,0,0,0.06)"}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-label="GitHub">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
                </svg>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
