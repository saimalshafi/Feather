# F*eather

> For the days you just need the f*cking weather

![F*eather screenshot](screenshot.png)

A brutally honest weather Progressive Web App. No ads, no bloat — just the conditions, a sarcastic AI one-liner, and a background color that matches the vibe.

---

## Install on your phone

**iOS (Safari)**
Share → Add to Home Screen

**Android (Chrome)**
Menu (⋮) → Install app

---

## Features

### AI-generated weather commentary
Every refresh generates a unique two-sentence reaction via Claude Haiku, calibrated to exactly what's happening outside:

- Temperature and feels-like gap
- Weather condition (thunderstorm, rain, drizzle, fog, snow, clear skies)
- Time of day across 7 slots — dawn, morning, day, evening, dusk, night, late night — so it never suggests going for a walk at midnight or sleeping at 7pm
- Wind speed and UV index
- Whether the day is warming up or cooling down
- Seasonal anomalies (snow in July, 30°C in January)

When offline or without an AI connection, a built-in bank of 100+ handwritten lines covers every scenario — the app is fully functional either way.

### Color-coded weather scenarios
The background shifts to match the exact weather, with separate day and night palettes.

### Hourly forecast
A swipeable 24-hour strip showing temperature, condition emoji, and precipitation probability for each hour — without getting in the way.

### Multi-city support
Save as many cities as you want. Swipe between them. Each city keeps its own message history so you never see the same quip twice.

---

## Stack

| Layer | Technology |
|---|---|
| UI | React 18 + Vite |
| Weather data | [Open-Meteo](https://open-meteo.com/) (free, no API key needed) |
| AI messages | Anthropic Claude Haiku via Cloudflare Worker proxy |
| Hosting | GitHub Pages |

---

## Local development

```bash
git clone https://github.com/saimalshafi/Feather.git
cd Feather
npm i
npm run dev          # http://localhost:5173
```

For AI messages locally, create `.env.local`:

```
VITE_PROXY_URL=https://feather-proxy.YOURSUBDOMAIN.workers.dev
```

Without it the app falls back to the built-in message bank — fully functional.

---

## Deploy your own copy

1. Deploy the Cloudflare Worker first — see [`worker/README.md`](worker/README.md)
2. Fork this repo
3. **Settings → Pages → Source:** GitHub Actions
4. **Settings → Secrets → New repository secret:**
   - Name: `VITE_PROXY_URL`
   - Value: your worker URL
5. Push to `main` — it builds and deploys automatically

---

## License

MIT — see [LICENSE](LICENSE).
