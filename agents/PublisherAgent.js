/**
 * PUBLISHER AGENT — TOOLIFY AI
 * Fixed:
 *  1. Twitter uses OAuth 1.0a (not Bearer) for posting
 *  2. Rate limits raised — unlimited for testing
 *  3. LinkedIn fallback content always generated
 *  4. Better error messages
 */

const axios   = require('axios')
const https   = require('https')
const crypto  = require('crypto')
const { Content, PublishLog } = require('../models')

class PublisherAgent {
  constructor(orchestrator) {
    this.orchestrator = orchestrator
    this.name = 'publisher'
    this.redditToken = null
    this.tokenExpiry = 0
    // Rate limits — set high for testing phase
    this.rl = {
      linkedin: { posts: 0, reset: Date.now(), max: 100 },  // unlimited for testing
      reddit:   { posts: 0, reset: Date.now(), max: 100 },
      twitter:  { posts: 0, reset: Date.now(), max: 100 },
    }
  }

  async initialize() {
    const platforms = []
    if (process.env.LINKEDIN_ACCESS_TOKEN && process.env.LINKEDIN_PERSON_ID) platforms.push('LinkedIn ✓')
    if (process.env.REDDIT_CLIENT_ID && process.env.REDDIT_USERNAME) platforms.push('Reddit ✓')
    if (process.env.TWITTER_API_KEY && process.env.TWITTER_ACCESS_TOKEN) platforms.push('Twitter ✓')
    console.log(`  ✓ PublisherAgent ready — platforms: ${platforms.join(', ') || 'none configured'}`)
  }

  // ── MAIN: publish a content batch
  async publishAll({ content } = {}) {
    if (!content) {
      const pending = await Content.find({ status: 'ready' }).sort({ createdAt: -1 }).limit(1)
      if (!pending.length) {
        this.orchestrator.broadcast({ type: 'task', message: '[PUBLISHER] No content ready — generating now...', level: 'info' })
        // Auto-generate if nothing ready
        const batch = await this.orchestrator.agents.content?.generateDailyContent({})
        if (!batch) return {}
        content = batch
      } else {
        content = pending[0].content
      }
    }

    this.orchestrator.broadcast({ type: 'task', message: '[PUBLISHER] Publishing to all platforms...', level: 'info' })
    const results = {}

    // LinkedIn first — most reliable
    if (this.canPost('linkedin')) {
      results.linkedin = await this.postToLinkedIn(content.linkedin)
      this.bumpRL('linkedin')
      await this.sleep(2000)
    }

    // Twitter
    if (this.canPost('twitter')) {
      results.twitter = await this.postTwitterThread(content.twitter)
      this.bumpRL('twitter')
      await this.sleep(1500)
    }

    // Reddit
    if (content.reddit && this.canPost('reddit')) {
      results.reddit = await this.postToReddit(content.reddit)
      this.bumpRL('reddit')
    }

    // Mark content published
    await Content.updateMany(
      { status: 'ready', createdAt: { $gte: new Date(Date.now() - 300000) } },
      { status: 'published', publishResults: results }
    ).catch(() => {})

    const published  = Object.entries(results).filter(([, r]) => r?.success).map(([k]) => k)
    const simulated  = Object.entries(results).filter(([, r]) => r?.simulated).map(([k]) => k)
    const failed     = Object.entries(results).filter(([, r]) => r?.success === false && !r?.simulated).map(([k]) => k)

    this.orchestrator.broadcast({
      type: 'task',
      message: `[PUBLISHER] ✓ Published: ${published.join(', ') || 'none'} | Simulated: ${simulated.join(', ') || 'none'} | Failed: ${failed.join(', ') || 'none'}`,
      level: published.length > 0 ? 'success' : 'warning'
    })

    return results
  }

  // ── LINKEDIN — personal profile post
  async postToLinkedIn(post) {
    const token    = process.env.LINKEDIN_ACCESS_TOKEN
    const personId = process.env.LINKEDIN_PERSON_ID

    if (!token || !personId || token.includes('your-linkedin') || token.length < 20) {
      return this.logPost('linkedin', '', null, 'no_credentials', 'Run: node linkedin-auth.js')
    }

    // Build text — always have fallback
    const postText = this.buildLinkedInText(post)

    const body = JSON.stringify({
      author:          `urn:li:person:${personId}`,
      lifecycleState:  'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary:    { text: postText },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    })

    return new Promise((resolve) => {
      const opts = {
        hostname: 'api.linkedin.com',
        path:     '/v2/ugcPosts',
        method:   'POST',
        headers:  {
          Authorization:               `Bearer ${token}`,
          'Content-Type':              'application/json',
          'Content-Length':            Buffer.byteLength(body),
          'X-Restli-Protocol-Version': '2.0.0',
        },
      }

      const req = https.request(opts, (res) => {
        let data = ''
        res.on('data', c => data += c)
        res.on('end', async () => {
          if (res.statusCode === 201) {
            let json = {}
            try { json = JSON.parse(data) } catch {}
            const postId = json.id || ''
            const url    = postId ? `https://www.linkedin.com/feed/update/${postId}/` : 'https://linkedin.com'
            await this.logPost('linkedin', postText.slice(0, 120), url, 'success')
            this.orchestrator.broadcast({
              type: 'task', message: `[LINKEDIN] ✅ Posted to personal profile`, level: 'success'
            })
            resolve({ success: true, url, postId })
          } else if (res.statusCode === 401) {
            await this.logPost('linkedin', postText.slice(0, 120), null, 'failed', 'Token expired')
            this.orchestrator.broadcast({
              type: 'error', message: '[LINKEDIN] ❌ Token expired — run: node linkedin-auth.js', level: 'error'
            })
            resolve({ success: false, error: 'token_expired' })
          } else if (res.statusCode === 422) {
            await this.logPost('linkedin', postText.slice(0, 120), null, 'failed', `422 Unprocessable: ${data.slice(0,200)}`)
            this.orchestrator.broadcast({
              type: 'error', message: `[LINKEDIN] ❌ 422 Error — person ID might be wrong. Check LINKEDIN_PERSON_ID in .env`, level: 'error'
            })
            resolve({ success: false, error: '422_person_id' })
          } else {
            await this.logPost('linkedin', postText.slice(0, 120), null, 'failed', `${res.statusCode}: ${data.slice(0,100)}`)
            this.orchestrator.broadcast({
              type: 'error', message: `[LINKEDIN] ❌ Failed ${res.statusCode}: ${data.slice(0, 80)}`, level: 'error'
            })
            resolve({ success: false, error: data })
          }
        })
      })

      req.on('error', async (err) => {
        await this.logPost('linkedin', postText.slice(0, 120), null, 'failed', err.message)
        resolve({ success: false, error: err.message })
      })

      req.write(body)
      req.end()
    })
  }

  buildLinkedInText(post) {
    // Try to use generated content
    if (post?.text && typeof post.text === 'string' && post.text.trim().length > 80) {
      return post.text.trim()
    }

    // Fallback posts — rotate daily
    const fallbacks = [
      `Building Toolify AI in public 🚀

Day ${new Date().getDate()} of running an autonomous AI company.

Today the engine:
→ Researched trending topics on Reddit and HN
→ Generated content for all 3 products
→ Checked Razorpay for new payments (₹0 so far — but we're live)

3 products live:
✍️ ReplyDraft AI — reply to client emails in 10 seconds (₹750/mo)
🛒 ListingLift AI — 5 marketplace listings from one description (₹249)
🔍 PolicyPal AI — understand any ToS in plain English (₹399)

All running on Ollama locally — zero AI cost, ~100% margin.

If you're a freelancer in India, check the link in comments.

#ToolifyAI #BuildingInPublic #FreelanceIndia`,

      `The thing nobody tells you about building AI tools in India:

The margin is insane.

Ollama runs locally → ₹0 AI cost
Razorpay processes payments → 2% fee
MongoDB Atlas free tier → ₹0
Vercel hosting → ₹0

Revenue: ₹249 to ₹750 per user
Cost per user: ~₹5 (Razorpay only)

That's 98%+ margin on every sale.

Working on Toolify AI — 3 AI tools for Indian freelancers and sellers.
Link in comments if curious.

#ToolifyAI #IndieHacker #SaaSIndia`,

      `Freelancers: how many hours/week do you spend writing client emails?

For most of my friends it's 3-5 hours.

That's 15-20 hours a month. Roughly 2 full working days.

I built ReplyDraft AI to fix this — paste any message, pick your tone, get a professional reply in 10 seconds.

Live now at ₹750/month. Try it free (link in comments).

#FreelanceIndia #Productivity #ToolifyAI`,
    ]

    return fallbacks[new Date().getDate() % fallbacks.length]
  }

  // ── TWITTER — uses OAuth 1.0a (NOT Bearer token) for posting
  async postTwitterThread(tweets) {
    const apiKey       = process.env.TWITTER_API_KEY
    const apiSecret    = process.env.TWITTER_API_SECRET
    const accessToken  = process.env.TWITTER_ACCESS_TOKEN
    const accessSecret = process.env.TWITTER_ACCESS_SECRET

    if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
      this.orchestrator.broadcast({ type: 'task', message: '[TWITTER] Missing OAuth 1.0a keys — need API_KEY, API_SECRET, ACCESS_TOKEN, ACCESS_SECRET', level: 'warning' })
      return this.logPost('twitter', '', null, 'no_credentials', 'Need all 4 OAuth 1.0a keys')
    }

    // If no tweets array, build a simple tweet
    const tweetList = Array.isArray(tweets) && tweets.length > 0
      ? tweets
      : this.buildFallbackTweets()

    try {
      const posted    = []
      let replyToId   = null

      for (const tweetText of tweetList.slice(0, 8)) {
        const body = JSON.stringify({
          text: tweetText.slice(0, 280),
          ...(replyToId ? { reply: { in_reply_to_tweet_id: replyToId } } : {})
        })

        const authHeader = this.buildOAuth1Header(
          'POST',
          'https://api.twitter.com/2/tweets',
          apiKey, apiSecret, accessToken, accessSecret
        )

        const res = await axios.post('https://api.twitter.com/2/tweets', body, {
          headers: {
            Authorization:  authHeader,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        })

        replyToId = res.data?.data?.id
        if (replyToId) posted.push(replyToId)
        await this.sleep(1000)
      }

      if (posted.length > 0) {
        const url = `https://twitter.com/i/status/${posted[0]}`
        await this.logPost('twitter', tweetList[0].slice(0, 100), url, 'success')
        this.orchestrator.broadcast({
          type: 'task', message: `[TWITTER] ✅ Thread posted — ${posted.length} tweets → ${url}`, level: 'success'
        })
        return { success: true, url, tweetIds: posted }
      } else {
        throw new Error('No tweet IDs returned')
      }

    } catch (err) {
      const msg = err.response?.data?.detail || err.response?.data?.title || err.message
      await this.logPost('twitter', (tweetList[0] || '').slice(0, 100), null, 'failed', msg)
      this.orchestrator.broadcast({
        type: 'error', message: `[TWITTER] ❌ Failed: ${msg}`, level: 'error'
      })
      return { success: false, error: msg }
    }
  }

  // ── Build OAuth 1.0a Authorization header for Twitter
  buildOAuth1Header(method, url, apiKey, apiSecret, accessToken, accessSecret) {
    const ts    = Math.floor(Date.now() / 1000).toString()
    const nonce = crypto.randomBytes(16).toString('hex')

    const params = {
      oauth_consumer_key:     apiKey,
      oauth_nonce:            nonce,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp:        ts,
      oauth_token:            accessToken,
      oauth_version:          '1.0',
    }

    // Build signature base string
    const sortedParams = Object.keys(params).sort().map(k =>
      `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`
    ).join('&')

    const baseString = [
      method.toUpperCase(),
      encodeURIComponent(url),
      encodeURIComponent(sortedParams),
    ].join('&')

    // Sign with HMAC-SHA1
    const signingKey  = `${encodeURIComponent(apiSecret)}&${encodeURIComponent(accessSecret)}`
    const signature   = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64')
    params.oauth_signature = signature

    // Build Authorization header
    const headerParts = Object.keys(params).sort().map(k =>
      `${encodeURIComponent(k)}="${encodeURIComponent(params[k])}"`
    ).join(', ')

    return `OAuth ${headerParts}`
  }

  buildFallbackTweets() {
    return [
      `Building an autonomous AI company in public 🤖\n\nThe engine posts content, tracks revenue, and makes decisions — all without me.\n\nDay ${new Date().getDate()} update 👇`,
      `3 AI tools live:\n\n✍️ ReplyDraft AI — client emails in 10 seconds\n🛒 ListingLift AI — 5 marketplace listings instantly\n🔍 PolicyPal AI — understand any ToS\n\nAll built for Indian freelancers and sellers.`,
      `Stack:\n→ Ollama running locally (₹0 AI cost)\n→ Razorpay for payments (works in India)\n→ MongoDB Atlas for data\n→ 5 AI agents running 24/7\n\nMargin: ~98%+ on every sale 💰`,
      `Try any tool free → toolifyai.com\n\n#ToolifyAI #BuildingInPublic #IndieHacker #SaaSIndia`,
    ]
  }

  // ── REDDIT
  async postToReddit(post) {
    const token = await this.getRedditToken()
    if (!token) {
      return this.logPost('reddit', post?.title || '', null, 'simulated',
        'Add REDDIT_CLIENT_ID/SECRET/USERNAME/PASSWORD to .env')
    }

    try {
      const body = new URLSearchParams({
        sr:          post.subreddit || 'freelance',
        kind:        'self',
        title:       post.title || 'Sharing something useful for freelancers',
        text:        (post.body || '') + (post.mentionProduct && post.productMentionText
                       ? `\n\n---\n${post.productMentionText}` : ''),
        resubmit:    'true',
        sendreplies: 'true',
      })

      const res = await axios.post('https://oauth.reddit.com/api/submit', body, {
        headers: {
          Authorization:  `Bearer ${token}`,
          'User-Agent':   'ToolifyAIBot/1.0 (+https://toolifyai.com)',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 10000,
      })

      const errors = res.data?.json?.errors
      if (errors?.length) throw new Error(errors[0][1])

      const postId = res.data?.json?.data?.id
      const url    = postId ? `https://reddit.com/r/${post.subreddit}/comments/${postId}` : null
      await this.logPost('reddit', post.title || '', url, 'success')
      this.orchestrator.broadcast({
        type: 'task', message: `[REDDIT] ✅ Posted to r/${post.subreddit}: "${(post.title||'').slice(0,50)}"`, level: 'success'
      })
      return { success: true, url, postId }

    } catch (err) {
      await this.logPost('reddit', post?.title || '', null, 'failed', err.message)
      this.orchestrator.broadcast({ type: 'error', message: `[REDDIT] ❌ Failed: ${err.message}`, level: 'error' })
      return { success: false, error: err.message }
    }
  }

  // ── MENTIONS & ENGAGEMENT
  async respondToMentions() {
    const token = await this.getRedditToken()
    if (!token) return
    try {
      const res      = await axios.get('https://oauth.reddit.com/message/mentions.json',
        { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'ToolifyAIBot/1.0' } })
      const mentions = res.data?.data?.children?.map(c => c.data) || []
      for (const m of mentions.slice(0, 3)) {
        const reply = await this.orchestrator.agents.content?.generateReply({
          text: m.body, platform: 'reddit', product: 'toolifyai', sentiment: 'neutral'
        }).catch(() => null)
        if (reply && reply.length > 20) {
          await this.replyReddit(m.name, reply)
          await this.sleep(5000)
        }
      }
    } catch {}
  }

  async engageWithCommunity() {
    const token = await this.getRedditToken()
    if (!token) return
    const subs = ['freelance', 'Etsy', 'smallbusiness']
    for (const sub of subs.slice(0, 2)) {
      try {
        const res   = await axios.get(`https://oauth.reddit.com/r/${sub}/new.json?limit=10`,
          { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'ToolifyAIBot/1.0' } })
        const posts = res.data?.data?.children?.map(c => c.data) || []
        for (const post of posts.slice(0, 2)) {
          const kw    = ['email', 'reply', 'listing', 'terms of service', 'privacy', 'client']
          const text  = (post.title + ' ' + (post.selftext||'')).toLowerCase()
          const match = kw.some(k => text.includes(k))
          if (match && !post.locked && post.score > 2) {
            const reply = await this.orchestrator.agents.content?.generateReply({
              text: post.title, platform: 'reddit', product: 'toolifyai', sentiment: 'neutral'
            }).catch(() => null)
            if (reply && reply.length > 50) {
              await this.replyReddit(post.name, reply)
              await this.sleep(30000)
            }
          }
        }
        await this.sleep(3000)
      } catch {}
    }
  }

  async checkEngagements() { /* future: track post metrics */ }

  // ── Reddit OAuth
  async getRedditToken() {
    if (!process.env.REDDIT_CLIENT_ID || !process.env.REDDIT_USERNAME) return null
    if (process.env.REDDIT_CLIENT_ID === 'your-reddit-app-id') return null
    if (this.redditToken && this.tokenExpiry > Date.now()) return this.redditToken
    try {
      const res = await axios.post(
        'https://www.reddit.com/api/v1/access_token',
        `grant_type=password&username=${encodeURIComponent(process.env.REDDIT_USERNAME)}&password=${encodeURIComponent(process.env.REDDIT_PASSWORD)}`,
        {
          auth:    { username: process.env.REDDIT_CLIENT_ID, password: process.env.REDDIT_CLIENT_SECRET },
          headers: { 'User-Agent': 'ToolifyAIBot/1.0', 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 8000,
        }
      )
      this.redditToken = res.data.access_token
      this.tokenExpiry = Date.now() + (res.data.expires_in * 1000) - 60000
      return this.redditToken
    } catch { return null }
  }

  async replyReddit(thingId, text) {
    const token = await this.getRedditToken()
    if (!token) return
    await axios.post('https://oauth.reddit.com/api/comment',
      new URLSearchParams({ thing_id: thingId, text }),
      { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'ToolifyAIBot/1.0' } }
    ).catch(() => {})
  }

  canPost(platform) {
    const r = this.rl[platform]
    if (!r) return false
    if (Date.now() - r.reset > 3600000) { r.posts = 0; r.reset = Date.now() }
    return r.posts < r.max
  }

  bumpRL(platform) { if (this.rl[platform]) this.rl[platform].posts++ }

  async logPost(platform, content, url, status, error = '') {
    try { await PublishLog.create({ platform, content: String(content).slice(0, 200), url, status, error }) } catch {}
    return { success: status === 'success', simulated: status === 'simulated', url }
  }

  sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
}

module.exports = PublisherAgent
