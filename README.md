# 🤖 NicheAI Labs — Autonomous Company Engine

A fully autonomous AI system that runs your company 24/7 without human input.

## What it does — autonomously, on its own

| What | How | When |
|------|-----|------|
| Research trending topics | Scans Reddit, HN, Google Trends | Every day |
| Make strategic decisions | AI CEO decides focus, platform, angle | Every day |
| Write content | Reddit posts, Twitter threads, LinkedIn posts, blogs | Every day |
| Post to social media | Reddit API, Twitter API, LinkedIn API | 3x per day |
| Monitor & reply to mentions | Reddit comments, @ mentions | Every hour |
| Engage with community | Comments on relevant posts | Every hour |
| Track Stripe revenue | Pulls real payment data | Every hour |
| Kill failing products | 3 days zero revenue → auto-kill | Every day |
| Double down on winners | $50+ in 3 days → increase focus | Every day |
| Manage ad campaigns | Reddit Ads, pause/scale based on ROAS | Every hour |
| Refresh ad creatives | Auto-generate new copy when CTR drops | Every week |
| Send you email reports | Revenue alerts, weekly P&L digest | Real-time + weekly |

## Architecture

```
server.js               ← HTTP server + SSE dashboard stream
orchestrator.js         ← Brain: dispatches tasks, runs loops, makes decisions
│
├── agents/
│   ├── ResearchAgent   ← Reddit, HN, Google Trends scanning
│   ├── ContentAgent    ← AI content generation (all platforms)
│   ├── PublisherAgent  ← Real API posting + engagement
│   ├── FinanceAgent    ← Stripe revenue + kill-switch logic
│   ├── AdvertisingAgent← Ad campaigns + performance optimization
│   └── OptimizerAgent  ← A/B testing + conversion tracking
│
├── models/             ← MongoDB schemas (Decision, Revenue, Content...)
├── services/           ← EmailService (Resend)
└── dashboard/          ← Live monitoring UI (SSE-powered)
```

## Quick Start

### Option A: Local (simplest)

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
# Fill in MONGODB_URI and ANTHROPIC_API_KEY (minimum)

# 3. Start MongoDB
mongod --dbpath /tmp/nicheai-db

# 4. Run engine
npm run dev

# Dashboard → http://localhost:4000
```

### Option B: Docker (recommended for production)

```bash
cp .env.example .env
# Fill in your keys

docker-compose up -d

# Dashboard → http://localhost:4000
# Logs: docker-compose logs -f engine
```

### Option C: VPS with PM2 (best for 24/7)

```bash
# On your VPS (DigitalOcean $6/mo, Hetzner €3/mo, etc.)
git clone your-repo
cd autonomous-engine
npm install
cp .env.example .env && nano .env

# Install PM2
npm install -g pm2

# Start
pm2 start ecosystem.config.js

# Auto-start on reboot
pm2 startup
pm2 save

# Monitor
pm2 logs nicheai-engine
pm2 monit
```

## Minimum Setup (Start Earning)

You only NEED these to start:

```env
MONGODB_URI=mongodb://localhost:27017/nicheai-engine
ANTHROPIC_API_KEY=sk-ant-...
STRIPE_SECRET_KEY=sk_test_...
```

With just these, the engine will:
- ✅ Research niches daily
- ✅ Generate content (logged, not posted)
- ✅ Track Stripe revenue
- ✅ Make kill/double-down decisions
- ✅ Show everything in the dashboard

Then add social keys one at a time:

```env
# Week 1: Add Reddit (free, fastest approval)
REDDIT_CLIENT_ID=...
REDDIT_CLIENT_SECRET=...
REDDIT_USERNAME=...
REDDIT_PASSWORD=...
```

Reddit approval takes minutes at reddit.com/prefs/apps.

## Social Media Setup

### Reddit (fastest — 5 minutes)
1. Go to reddit.com/prefs/apps
2. Create app → type: "script"
3. Add credentials to `.env`
4. Engine will post 1-3 times/day to relevant subreddits

### Twitter/X (1-3 days approval)
1. Apply at developer.twitter.com
2. Request Elevated access (needed for posting)
3. Create project + app
4. Generate access tokens

### LinkedIn (1 week)
1. Apply at linkedin.com/developers
2. Create app with "Share on LinkedIn" product
3. OAuth2 flow to get access token

## The Autonomous Loops

```
Every 5 minutes:
  → Monitor conversion rates
  → Check budget limits
  → Check for new mentions

Every hour:
  → Pull Stripe revenue
  → Reply to mentions
  → Engage with community
  → Check ad performance

Every day (9am, 2pm, 7pm):
  → AI makes strategic decision
  → Research trending topics
  → Generate content for all platforms
  → Publish to configured platforms
  → Finance snapshot
  → Kill or double-down on products

Every Monday 8am:
  → Deep niche research
  → Weekly portfolio evaluation
  → Launch new product if criteria met
  → Cull bottom 20% performers
  → Refresh ad creatives
  → Send weekly P&L email
```

## Kill-Switch Rules (Autonomous)

The Finance Agent makes these decisions without asking you:

| Condition | Action |
|-----------|--------|
| 3 days zero revenue | AI decides: kill or pivot |
| Revenue $50+ in 3 days | Double down (more content + ads) |
| API spend > $50/day | Pause all new experiments |
| Monthly spend > $90 | Stop new launches |
| Product margin < 30% | Adjust pricing or kill |
| Ad CTR < 0.3% | Pause and refresh creative |
| Ad ROAS > 3x | Scale budget |

## When You ARE Notified

The engine emails you ONLY for:
- 💰 New revenue (Stripe payment)
- 🔴 Product killed
- ⚠️ Budget at 80%+
- 🚨 Stripe KYC / payment failure
- 📊 Weekly P&L digest (Monday)

Everything else runs silently.

## Dashboard

Open http://localhost:4000 to see:
- Live agent activity feed (SSE)
- Revenue by product (real Stripe data)
- All AI decisions with reasoning
- Platform post history
- Agent status (running/idle/monitoring)
- Budget consumption
- Manual trigger buttons for any agent

## Costs

| Item | Cost |
|------|------|
| VPS (Hetzner CX22) | €3.79/mo |
| MongoDB Atlas (free tier) | $0 |
| Anthropic API | ~$5/mo (Haiku) |
| SERPAPI (optional) | $0 (50 free/mo) |
| Reddit Ads (optional) | Set your own budget |
| **Total to run** | **~$9/mo** |
