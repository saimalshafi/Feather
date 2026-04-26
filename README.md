# F*eather

> Sarcastic weather, with attitude.

<!-- Replace with an actual screenshot once deployed -->
![F*eather screenshot](screenshot-placeholder.png)

**Live demo:** https://USERNAME.github.io/Feather/
*(replace USERNAME with your GitHub handle after deploying)*

---

## Install on your phone

**iOS (Safari)**
Share → Add to Home Screen

**Android (Chrome)**
Menu (⋮) → Install app

---

## Local development

```bash
git clone https://github.com/USERNAME/Feather.git
cd Feather
npm i
npm run dev          # http://localhost:5173
```

To get AI-generated weather messages locally, set `VITE_PROXY_URL` in `.env.local`:

```
VITE_PROXY_URL=https://feather-proxy.YOURSUBDOMAIN.workers.dev
```

Without it the app falls back to the built-in message bank — fully functional.

---

## Deploy to GitHub Pages

1. [Deploy the Cloudflare Worker](worker/README.md) first — this gives you the proxy URL.
2. Create the GitHub repo and push your code.
3. **Settings → Pages → Source:** GitHub Actions.
4. **Settings → Secrets and variables → Actions → New repository secret:**
   - Name: `VITE_PROXY_URL`
   - Value: your deployed worker URL (e.g. `https://feather-proxy.yoursubdomain.workers.dev`)
5. Push to `main` — the workflow builds and deploys automatically.
6. Replace the `USERNAME` placeholder in this README with your handle, then push again.
7. Open the live URL on your phone and install it.

---

## Stack

| Layer | Technology |
|---|---|
| UI | React 18 + Vite |
| Weather data | [Open-Meteo](https://open-meteo.com/) (free, no key) |
| AI messages | Anthropic Claude Haiku via Cloudflare Worker proxy |
| Hosting | GitHub Pages |

---

## License

MIT — see [LICENSE](LICENSE).
