/**
 * RESEARCH AGENT — TOOLIFY AI
 * Scans Reddit, Hacker News, Google Trends
 * Finds trending topics + new niche opportunities
 * Outputs structured insights fed to ContentAgent
 */

const http   = require('http')
const https  = require('https')
const { ResearchResult } = require('../models')

class ResearchAgent {
  constructor(orchestrator) {
    this.orchestrator = orchestrator
    this.name = 'research'
    this.ua   = 'ToolifyAIBot/1.0 (+https://toolifyai.com)'
  }

  async initialize() {
    console.log('  ✓ ResearchAgent ready')
  }

  // ── DAILY: scan trends → content angles
  async trendResearch() {
    this.orchestrator.broadcast({ type: 'task', message: '[RESEARCH] Scanning Reddit + HN for trends...', level: 'info' })

    const [reddit, hn] = await Promise.allSettled([
      this.scanReddit(['freelance', 'Entrepreneur', 'smallbusiness', 'india']),
      this.scanHackerNews(),
    ])

    const data = {
      reddit:      reddit.value || [],
      hackerNews:  hn.value     || [],
    }

    const synthesis = await this.synthesize(data)

    await ResearchResult.create({ type: 'daily_trends', data, synthesis, date: new Date() })

    this.orchestrator.broadcast({
      type: 'task',
      message: `[RESEARCH] ✓ Found ${synthesis.topTopics?.length || 0} topics | Best angle: "${synthesis.contentAngles?.[0] || 'n/a'}"`,
      level: 'success'
    })

    // Merge raw data into synthesis so ContentAgent can use trending titles
    return { ...synthesis, reddit: data.reddit, hackerNews: data.hackerNews }
  }

  // ── WEEKLY: find new niche opportunities
  async findNewNiches() {
    this.orchestrator.broadcast({ type: 'task', message: '[RESEARCH] Scanning for new niche opportunities...', level: 'info' })

    const subs = ['freelance', 'Entrepreneur', 'smallbusiness', 'india', 'digitalnomad', 'SaaS']
    const painPoints = []

    for (const sub of subs) {
      try {
        const posts = await this.getRedditPosts(sub, 'hot', 8)
        const pains = await this.extractPains(posts, sub)
        painPoints.push(...pains)
        await this.sleep(1500)
      } catch {}
    }

    const scored = await this.scoreNiches(painPoints)
    await ResearchResult.create({ type: 'niche_research', data: { painPoints }, synthesis: scored, date: new Date() })

    this.orchestrator.broadcast({
      type: 'task',
      message: `[RESEARCH] ✓ Scored ${painPoints.length} pain points | Top pick: "${scored.topPick?.pain || 'none'}"`,
      level: 'success'
    })

    return scored
  }

  // ── Scan multiple subreddits
  async scanReddit(subs) {
    const results = []
    for (const sub of subs) {
      try {
        const posts = await this.getRedditPosts(sub, 'hot', 5)
        results.push(...posts.map(p => ({ sub, title: p.title, score: p.score, comments: p.num_comments })))
        await this.sleep(800)
      } catch {}
    }
    return results
  }

  // ── Fetch Reddit JSON (no auth needed for public posts)
  getRedditPosts(sub, sort = 'hot', limit = 10) {
    return new Promise((resolve, reject) => {
      const opts = {
        hostname: 'www.reddit.com',
        path:     `/r/${sub}/${sort}.json?limit=${limit}`,
        method:   'GET',
        headers:  { 'User-Agent': this.ua, Accept: 'application/json' },
        timeout:  8000,
      }
      const req = https.request(opts, res => {
        let d = ''
        res.on('data', c => d += c)
        res.on('end', () => {
          try { resolve(JSON.parse(d).data.children.map(c => c.data)) }
          catch { reject(new Error('Reddit parse error')) }
        })
      })
      req.on('error',   reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('Reddit timeout')) })
      req.end()
    })
  }

  // ── Hacker News top stories
  async scanHackerNews() {
    const ids = await this.fetchJSON('https://hacker-news.firebaseio.com/v0/topstories.json')
    const stories = []
    for (const id of (ids || []).slice(0, 10)) {
      try {
        const s = await this.fetchJSON(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
        if (s?.title) stories.push({ title: s.title, score: s.score, url: s.url })
        await this.sleep(200)
      } catch {}
    }
    return stories
  }

  fetchJSON(url) {
    return new Promise((resolve, reject) => {
      const lib = url.startsWith('https') ? https : http
      lib.get(url, { headers: { 'User-Agent': this.ua }, timeout: 6000 }, res => {
        let d = ''
        res.on('data', c => d += c)
        res.on('end', () => { try { resolve(JSON.parse(d)) } catch { resolve(null) } })
      }).on('error', reject).on('timeout', () => reject(new Error('timeout')))
    })
  }

  // ── AI: synthesize research into RICH content insights (not just labels)
  async synthesize(data) {
    const redditPosts   = data.reddit?.slice(0, 10) || []
    const hnStories     = data.hackerNews?.slice(0, 5) || []

    const redditSummary = redditPosts.map(p =>
      `[r/${p.sub}] "${p.title}" — ${p.score} upvotes, ${p.comments} comments`
    ).join('\n')

    const hnSummary = hnStories.map(s =>
      `"${s.title}" — ${s.score} points`
    ).join('\n')

    const prompt = `You are a content strategist for Toolify AI (India), an AI SaaS company.

Products:
- ReplyDraft AI (₹750/mo) — writes professional email/LinkedIn replies for freelancers
- ListingLift AI (₹249/batch) — generates marketplace listings for Amazon/Flipkart/Etsy sellers
- PolicyPal AI (₹399/doc) — summarizes Terms of Service / Privacy Policies in plain English

TODAY'S LIVE DATA:
Reddit posts (sorted by engagement):
${redditSummary || 'No Reddit data available'}

Hacker News trending:
${hnSummary || 'No HN data available'}

YOUR JOB: Extract SPECIFIC, USABLE insights that a founder can turn into non-generic LinkedIn/Twitter posts TODAY.

Return JSON (be specific — use real details from the posts above, not generic labels):
{
  "topTopics": [
    "specific topic 1 with context from the data — e.g. 'Indian freelancers complaining about scope creep in client emails (r/freelance, 847 upvotes)'",
    "specific topic 2",
    "specific topic 3"
  ],
  "contentAngles": [
    {
      "product": "replydraft",
      "angle": "specific hook — e.g. 'r/freelance post about spending 3hrs/day on client emails has 847 upvotes — write about this exact pain'",
      "hook": "opening line for a post — e.g. 'A freelancer on Reddit just vented about spending 3 hours a day writing client emails. 847 people upvoted it.'",
      "insight": "2-3 sentence insight that connects the trending topic to the product — be specific, use the real data",
      "redditPost": "the exact Reddit title that inspired this angle"
    },
    { "product": "listinglift", "angle": "", "hook": "", "insight": "", "redditPost": "" },
    { "product": "policypal", "angle": "", "hook": "", "insight": "", "redditPost": "" }
  ],
  "urgentOpportunity": "specific one-sentence opportunity based on what is trending TODAY — reference actual post",
  "bestPlatform": "linkedin",
  "redditSubsToPost": ["sub1", "sub2"],
  "suggestedHashtags": ["#specific1", "#specific2", "#specific3"]
}`

    try {
      const res      = await this.orchestrator.callAI(prompt)
      const parsed   = this.orchestrator.parseJSON(res)
      // Validate we got real content not just template labels
      if (parsed?.contentAngles?.length && parsed.urgentOpportunity && parsed.urgentOpportunity !== 'one thing to act on TODAY') {
        return parsed
      }
      throw new Error('Synthesis returned template placeholders')
    } catch {
      return {
        topTopics: [
          'Freelancers spending 3+ hours/day on client email replies (common r/freelance complaint)',
          'Indian online sellers struggling with platform-specific listing requirements',
          'Startups signing SaaS tools without reading data ownership clauses'
        ],
        contentAngles: [
          {
            product: 'replydraft',
            angle: 'The hidden time cost of professional email replies for freelancers',
            hook: 'Every week, the average freelancer writes 40+ professional emails. Almost none of them are billable.',
            insight: 'Freelancers lose 3-5 hours a week on email alone — confirmations, follow-ups, revision requests, payment reminders. That is 200+ hours a year on communication that could be automated.',
            redditPost: 'How do you handle difficult client emails without sounding rude?'
          },
          {
            product: 'listinglift',
            angle: 'Why the same product description fails on Amazon but works on Etsy',
            hook: 'Selling the same product on 3 platforms? You need 3 completely different descriptions.',
            insight: `Amazon buyers search by keyword and want bullet-point facts. Etsy buyers connect emotionally and want a story. Shopify visitors want benefits. One description can't serve all three — but most sellers use the same copy everywhere.`,
            redditPost: 'My Etsy listings are not converting even though I get traffic'
          },
          {
            product: 'policypal',
            angle: 'The ToS clause that cost a freelancer their client work',
            hook: 'A popular SaaS tool quietly owns a license to everything you process through it. Most users never noticed.',
            insight: `Data ownership clauses are buried on page 18 of every ToS. Most freelancers and small businesses sign up without reading them — until something goes wrong. Knowing what you're agreeing to takes 30 seconds with AI.`,
            redditPost: 'PSA: check the data ownership clause before using AI tools for client work'
          }
        ],
        urgentOpportunity: 'High engagement on r/freelance around client communication pain — ideal time to post about email automation',
        bestPlatform: 'linkedin',
        redditSubsToPost: ['freelance', 'india'],
        suggestedHashtags: ['#FreelanceIndia', '#OnlineSelling', '#AIProductivity'],
      }
    }
  }

  // ── AI: extract pain points from posts
  async extractPains(posts, sub) {
    if (!posts.length) return []
    const titles = posts.map(p => p.title).slice(0, 8).join('\n')
    const prompt = `From these r/${sub} posts, extract user pain points solvable by an AI tool.
Posts:\n${titles}
JSON array: [{"pain":"","frequency":"high|medium|low","potentialProduct":""}]`

    try {
      const res = await this.orchestrator.callAI(prompt)
      const arr = this.orchestrator.parseJSON(res)
      return Array.isArray(arr) ? arr : []
    } catch { return [] }
  }

  // ── AI: score niche opportunities
  async scoreNiches(painPoints) {
    if (!painPoints.length) return { opportunities: [], topPick: null }
    const prompt = `Score these pain points as AI tool opportunities for Indian market.
Pain points: ${JSON.stringify(painPoints.slice(0, 15))}

JSON: {
  "opportunities": [{"pain":"","demandScore":0,"competitionScore":0,"suggestedProduct":"","suggestedPrice":"₹X"}],
  "topPick": {"pain":"","reasoning":""}
}`

    try {
      const res = await this.orchestrator.callAI(prompt)
      return this.orchestrator.parseJSON(res)
    } catch { return { opportunities: [], topPick: null } }
  }

  sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
}

module.exports = ResearchAgent
