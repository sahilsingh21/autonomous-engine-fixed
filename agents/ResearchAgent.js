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
    this.ua   = 'ToolifyAIBot/1.0 (+http://toolify.sahilsingh.co.in)'
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

    return synthesis
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

  // ── AI: synthesize research into content angles
  async synthesize(data) {
    const prompt = `You are a market research analyst for Toolify AI (India).

Products:
- ReplyDraft AI (₹750/mo) — email reply generator for freelancers
- ListingLift AI (₹249) — marketplace listing generator for sellers  
- PolicyPal AI (₹399) — ToS/Privacy policy analyzer

Reddit trends: ${JSON.stringify(data.reddit?.slice(0, 8))}
HN trends: ${JSON.stringify(data.hackerNews?.slice(0, 5))}

Return JSON:
{
  "topTopics": ["topic1", "topic2", "topic3"],
  "contentAngles": ["angle for ReplyDraft", "angle for ListingLift", "angle for PolicyPal"],
  "bestPlatform": "linkedin|reddit|twitter",
  "urgentOpportunity": "one thing to act on TODAY",
  "redditSubsToPost": ["sub1", "sub2"],
  "suggestedHashtags": ["#tag1", "#tag2"]
}`

    try {
      const res = await this.orchestrator.callAI(prompt)
      return this.orchestrator.parseJSON(res)
    } catch {
      return {
        topTopics: ['AI productivity', 'freelancing in India', 'online selling'],
        contentAngles: ['saving time on client emails', 'selling on multiple platforms', 'understanding legal docs'],
        bestPlatform: 'linkedin',
        redditSubsToPost: ['freelance', 'india'],
        suggestedHashtags: ['#ToolifyAI', '#FreelanceIndia'],
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
