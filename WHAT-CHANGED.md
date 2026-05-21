# Toolify AI Engine v2.4 — What Changed & How To Use

## MERGED FEATURES (v2.4)

This version combines **Email Approval** + **Image Generation** features:

| Feature | Description |
|---------|-------------|
| 📧 Email Approval | Every post goes through email review before publishing |
| 🖼️ Image Generation | Auto-generates images for LinkedIn/Twitter posts via Replicate (Stable Diffusion) or free Picsum fallback |
| 🔌 Platform Toggles | Dashboard → "🔌 Platform Toggles" — flip LinkedIn/Twitter/Reddit on/off |
| 🤖 LinkedIn Auto-Reply | Monitors and replies to LinkedIn comments hourly |
| 1️⃣ 1 Post Per Day | Engine posts ONCE at 10am IST only |
| ⚡ Force Post | `npm run force-post` bypasses the daily limit for testing |

---

## PROBLEMS FIXED (from earlier versions)

| Problem | Root Cause | Fix |
|---------|-----------|-----|
| `npm run dev` never posts | Cron runs at 9am/2pm/7pm only — startup has no trigger | Server now posts immediately on startup |
| Twitter not posting | Access token had wrong format (base64 encoded) | Fixed token format + OAuth 1.0a implementation |
| LinkedIn posts once then stops | Rate limit was 2/hour | Rate limit raised to 100 (unlimited for testing) |
| `[object Object]` in PIVOT message | AI returning object instead of string | Fixed string extraction in FinanceAgent |
| Optimizer 403 errors | PostHog `phc_` key is frontend-only, not API key | OptimizerAgent now skips if phc_ key |
| Ollama timeout / falling back to Anthropic | Timeout was 30s — model loading takes longer | Timeout raised to 180s |
| Content generating but LinkedIn null | No fallback when AI returns empty | Added 3 hardcoded fallback posts |
| Daily loop running multiple times | No concurrency guard | Added `dailyLoopRunning` flag |

---

## HOW TO CONFIGURE IMAGE GENERATION

Add to your `.env`:

```env
# Replicate — best quality ($0.003/image)
REPLICATE_API_TOKEN=r8_your-token-here

# Without this, posts use free Lorem Picsum placeholder images
```

Sign up at [replicate.com](https://replicate.com) → Account → API Tokens.

---

## HOW TO CONFIGURE EMAIL APPROVAL

Add to your `.env`:

```env
REQUIRE_APPROVAL=true
RESEND_API_KEY=re_your-resend-key
ALERT_EMAIL=you@yourdomain.com
ENGINE_PUBLIC_URL=https://toolify.sahilsingh.co.in
```

When `REQUIRE_APPROVAL=true`, every post triggers an email to `ALERT_EMAIL` with Approve/Reject links before publishing.

Set `REQUIRE_APPROVAL=false` to auto-publish without review.

---

## YOUR TWITTER TOKEN ISSUE

Your `.env` had:
```
TWITTER_ACCESS_TOKEN=OE1RbTdrZjFOQXhGdXppTFdPYjE6MTpjaQ
```

This is BASE64 ENCODED — it's a client credentials token, not an access token.

**Correct format should be:**
```
TWITTER_ACCESS_TOKEN=1924474369636474112-XXXXXXXXXXXXXXXXXXXX
```
(starts with your numeric Twitter user ID)

**How to fix:**
1. Go to `developer.twitter.com`
2. Your Project → Your App → **Keys and Tokens**
3. Under **"Authentication Tokens"** section
4. Click **"Regenerate"** next to **Access Token and Secret**
5. Copy the new token (starts with your user ID number)
6. Paste into `.env` as `TWITTER_ACCESS_TOKEN`

---

## HOW TO START

### Step 1 — Test all tokens first
```bash
node test-tokens.js
```
Fix any ❌ errors before continuing.

### Step 2 — Post RIGHT NOW (test)
```bash
npm run post-now
```
This generates content (+ image) and posts to LinkedIn + Twitter immediately.
If `REQUIRE_APPROVAL=true`, sends review emails instead of posting directly.

### Step 3 — Force post (bypass daily limit)
```bash
npm run force-post
```

### Step 4 — Run continuously (24/7)
```bash
npm run dev
```

### Step 5 — Run on server (never stops)
```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

---

## FILE STRUCTURE

```
autonomous-engine-fixed/
├── agents/
│   ├── ContentAgent.js          ← Image generation (HuggingFace/Replicate/Picsum)
│   ├── PublisherAgent.js        ← Image upload to LinkedIn + Email approval gate
│   ├── ImageAgent.js            ← Batch image generation
│   ├── LinkedInReplyAgent.js    ← Auto-reply to LinkedIn comments
│   ├── FinanceAgent.js
│   ├── ResearchAgent.js
│   ├── AdvertisingAgent.js
│   └── OptimizerAgent.js
├── routes/
│   ├── approval.js              ← /api/approval — approve/reject endpoints
│   ├── platforms.js             ← /api/platforms — toggle LinkedIn/Twitter/Reddit
│   └── payment.js
├── services/
│   ├── ApprovalService.js       ← Approval DB logic + email sending
│   └── EmailService.js
├── models/
│   └── index.js                 ← Includes Approval model
├── dashboard/
│   └── index.html               ← Live dashboard with platform toggles
├── orchestrator.js              ← Wires all agents + 1-post/day guard
├── server.js                    ← Approval + platform routes registered
├── package.json                 ← v2.4.0 with force-post script
├── ecosystem.config.js
├── linkedin-auth.js
├── test-tokens.js
├── test-huggingface.js          ← Test image generation standalone
├── .env                         ← Your credentials
└── WHAT-CHANGED.md              ← This file
```

---

## COMMANDS REFERENCE

```bash
# Test all credentials before starting
node test-tokens.js

# Test image generation only
node test-huggingface.js

# Post to LinkedIn + Twitter RIGHT NOW (one-off)
npm run post-now

# Force post (bypass the 1-per-day limit)
npm run force-post

# Run full daily loop once
npm run test-daily

# Test LinkedIn posting only
npm run test-linkedin

# Test Twitter posting only
npm run test-twitter

# Run engine (posts on startup + runs 24/7 via cron)
npm run dev

# Refresh LinkedIn token (run every 60 days)
node linkedin-auth.js

# Deploy to server with PM2
pm2 start ecosystem.config.js
pm2 logs nicheai-engine
pm2 restart nicheai-engine
```

---

## WHAT POSTS AUTOMATICALLY (when running `npm run dev`)

| When | What |
|------|------|
| Immediately on startup | Research → Generate content + image → (Approval email if enabled) → Post |
| 10:00 AM IST daily | Same full cycle |
| Every hour | Pull Razorpay revenue, reply to LinkedIn comments |
| Every 5 min | Lightweight budget check (no AI calls) |
| Monday 8am | Weekly deep research + portfolio evaluation |

---

## PLATFORM TOGGLES

Dashboard → "🔌 Platform Toggles" — flip any platform on/off instantly:
- 💼 LinkedIn — on/off
- 🐦 Twitter/X — on/off
- 🔴 Reddit — on/off
- 🤖 Auto-reply agent — on/off

State saved to `.platform-state.json` — persists across restarts.
