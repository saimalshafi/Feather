# feather-proxy — Cloudflare Worker

Sits between the F*eather PWA and the Anthropic API. Validates requests, enforces a 20 req/IP/day rate limit via KV, and keeps the API key server-side.

## Deploy steps (run in order)

```bash
# 1. Install wrangler
cd worker && npm i

# 2. Authenticate with Cloudflare
npx wrangler login

# 3. Create the KV namespace and paste the returned id into wrangler.toml
npx wrangler kv namespace create RATE_LIMIT_KV
#   → Paste the id value into wrangler.toml under [[kv_namespaces]] id = "..."

# 4. Store your Anthropic API key as a secret (never committed to git)
npx wrangler secret put ANTHROPIC_API_KEY
#   → Paste your sk-ant-... key when prompted

# 5. Set ALLOWED_ORIGIN in wrangler.toml to your GitHub Pages URL (no trailing slash)
#   e.g.  ALLOWED_ORIGIN = "https://saimalshafi.github.io"

# 6. Deploy
npx wrangler deploy
#   → Note the deployed URL, e.g. https://feather-proxy.yoursubdomain.workers.dev

# 7. Add VITE_PROXY_URL secret to GitHub
#   GitHub repo → Settings → Secrets and variables → Actions → New repository secret
#   Name:  VITE_PROXY_URL
#   Value: https://feather-proxy.yoursubdomain.workers.dev
```

## Local dev

```bash
# Create worker/.dev.vars (git-ignored) with your secrets:
echo 'ANTHROPIC_API_KEY=sk-ant-...' >> .dev.vars
echo 'ALLOWED_ORIGIN=http://localhost:5173' >> .dev.vars

npm run dev   # worker listens on http://localhost:8787
```

Then in the root project set `VITE_PROXY_URL=http://localhost:8787` in `.env.local`.

## Rate limit

20 requests per IP per UTC day, tracked in KV. Returns `429 { error: "rate_limited" }` when exceeded — the app automatically falls back to its built-in message bank.
