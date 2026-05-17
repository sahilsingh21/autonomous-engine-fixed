# Toolify AI Engine v2.1 — What Changed & How To Use

## PROBLEMS FIXED

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

## HOW TO START NOW

### Step 1 — Test all tokens first
```bash
node test-tokens.js
```
Fix any ❌ errors before continuing.

### Step 2 — Post RIGHT NOW (test)
```bash
npm run post-now
```
This generates content and posts to LinkedIn + Twitter immediately.
Watch terminal for `✅ Posted` messages.

### Step 3 — Run continuously (24/7)
```bash
npm run dev
```
This starts the engine. It will:
- Post immediately on startup
- Post again at 9am, 2pm, 7pm every day
- Check revenue hourly (Razorpay)
- Reply to mentions hourly

### Step 4 — Run on server (never stops)
```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

---

## FILE STRUCTURE — WHERE EACH FILE GOES

```
autonomous-engine-fixed/
├── agents/
│   ├── ContentAgent.js       ← UPDATED — hardcoded fallbacks
│   ├── FinanceAgent.js       ← UPDATED — Razorpay, fixed PIVOT bug
│   ├── PublisherAgent.js     ← UPDATED — OAuth 1.0a Twitter, LinkedIn
│   ├── OptimizerAgent.js     ← UPDATED — fixed 403 spam
│   ├── ResearchAgent.js
│   ├── AdvertisingAgent.js
│   └── (README: put all agent files in agents/ folder)
├── models/
│   └── index.js
├── routes/
│   └── payment.js            ← Razorpay routes
├── services/
│   ├── EmailService.js
│   └── (put RazorpayService.js, OllamaFirstAI.js here from toolify-updates)
├── dashboard/
│   └── index.html            ← Live dashboard
├── orchestrator.js           ← UPDATED — posts on startup, fixed loops
├── server.js                 ← UPDATED — immediatePost on startup
├── package.json              ← UPDATED — new scripts
├── ecosystem.config.js       ← PM2 config for 24/7
├── linkedin-auth.js          ← Get/refresh LinkedIn token
├── test-tokens.js            ← NEW — test all credentials
├── .env                      ← UPDATED — fixed tokens
└── WHAT-CHANGED.md           ← This file
```

---

## COMMANDS REFERENCE

```bash
# Test all credentials before starting
node test-tokens.js

# Post to LinkedIn + Twitter RIGHT NOW (one-off)
npm run post-now

# Run full daily loop once (research → content → publish → finance)
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
| Immediately on startup | Research → Generate content → Post LinkedIn + Twitter |
| 9:00 AM daily | Same full cycle |
| 2:00 PM daily | Same full cycle |
| 7:00 PM daily | Same full cycle |
| Every hour | Pull Razorpay revenue, reply to Reddit mentions |
| Every 5 min | Lightweight budget check (no AI calls) |
| Monday 8am | Weekly deep research + portfolio evaluation |

---

## LINKEDIN PERSON ID CHECK

Your current `LINKEDIN_PERSON_ID=QHoZd8T01y`

Run `node test-tokens.js` — if LinkedIn shows ✅ with your name, the ID is correct.
If it shows ❌, run `node linkedin-auth.js` to get the correct ID.

---

## TWITTER PERMISSIONS CHECK

Your app needs **"Read and Write"** permissions to post tweets.

1. Go to `developer.twitter.com`
2. Your Project → App Settings
3. **User authentication settings** → Edit
4. App permissions: select **"Read and Write"**
5. Save → then **regenerate your Access Token** (permissions change requires new token)

---

## v2.3 NEW FEATURES

### 1. Platform On/Off Toggles
Dashboard → "🔌 Platform Toggles" — flip any platform on/off instantly:
- 💼 LinkedIn — on/off
- 🐦 Twitter/X — on/off
- 🔴 Reddit — on/off
- Auto-reply agent — on/off

State saved to `.platform-state.json` — persists across restarts.

### 2. LinkedIn Auto-Reply Agent
Monitors comments on your LinkedIn posts every hour.
Replies with human-like AI responses:
- Praise → genuine thank you
- Question → clear direct answer
- Feedback → positive acknowledgement
- Spam / "DM me" → SKIP (no reply)
Enable in: Dashboard → Platform Toggles → Auto-reply toggle

### 3. Domain Fixed
All URLs now point to `sahilsingh.co.in` instead of `toolify.sahilsingh.co.in`

### 4. 1 Post Per Day
Engine posts ONCE at 10am IST only.
No more duplicate posting.
`npm run force-post` bypasses the limit for testing.

### 5. Email Approval Flow
Every post goes through email review before publishing.
Approve or reject from your email — no login needed.
