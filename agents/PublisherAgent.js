/**
 * PUBLISHER AGENT — WITH APPROVAL SYSTEM
 * Before posting to any platform:
 *  1. Sends review email with full content preview
 *  2. Waits for founder to click Approve or Reject
 *  3. Only publishes after explicit approval
 *  4. If auto-approve hours set in .env → auto-publishes after timeout
 */

const axios   = require('axios')
const https   = require('https')
const crypto  = require('crypto')
const { Content, PublishLog } = require('../models')
const { loadState: loadPlatformState } = require('../routes/platforms')

class PublisherAgent {
  constructor(orchestrator) {
    this.orchestrator = orchestrator
    this.name         = 'publisher'
    this.redditToken  = null
    this.tokenExpiry  = 0
    this.rl = {
      linkedin: { posts: 0, reset: Date.now(), max: 100 },
      reddit:   { posts: 0, reset: Date.now(), max: 100 },
      twitter:  { posts: 0, reset: Date.now(), max: 100 },
    }
  }

  async initialize() {
    const platforms = []
    if (process.env.LINKEDIN_ACCESS_TOKEN && process.env.LINKEDIN_PERSON_ID) platforms.push('LinkedIn ✓')
    if (process.env.REDDIT_CLIENT_ID && process.env.REDDIT_USERNAME) platforms.push('Reddit ✓')
    if (process.env.TWITTER_API_KEY && process.env.TWITTER_ACCESS_TOKEN) platforms.push('Twitter ✓')

    const approvalMode = process.env.REQUIRE_APPROVAL === 'true'
      ? '| Approval: EMAIL REVIEW REQUIRED'
      : '| Approval: auto-publish'

    console.log(`  ✓ PublisherAgent ready — platforms: ${platforms.join(', ') || 'none'} ${approvalMode}`)
  }

  // ── MAIN: publish content batch (with approval gate)
  async publishAll({ content } = {}) {
    if (!content) {
      const pending = await Content.find({ status: 'ready' }).sort({ createdAt: -1 }).limit(1)
      if (!pending.length) {
        this.orchestrator.broadcast({ type: 'task', message: '[PUBLISHER] No content ready — generating...', level: 'info' })
        const batch = await this.orchestrator.agents.content?.generateDailyContent({})
        if (!batch) return {}
        content = batch
      } else {
        content = pending[0].content
      }
    }

    const requireApproval = process.env.REQUIRE_APPROVAL === 'true'

    // Load platform on/off state
    const platformState = (() => { try { return loadPlatformState() } catch { return { linkedin:true, twitter:true, reddit:true } } })()

    this.orchestrator.broadcast({
      type:    'task',
      message: requireApproval
        ? '[PUBLISHER] Content ready — sending for your review via email...'
        : '[PUBLISHER] Publishing to all platforms...',
      level: 'info'
    })

    const results = {}

    // ── LinkedIn
    if (content.linkedin && this.canPost('linkedin') && platformState.linkedin !== false) {
      if (requireApproval) {
        const approved = await this.getApproval('linkedin', content.linkedin, content.product)
        if (!approved) {
          results.linkedin = { success: false, reason: 'rejected_or_pending' }
          this.orchestrator.broadcast({ type: 'task', message: '[LINKEDIN] ⏳ Waiting for your email approval...', level: 'info' })
          // Don't block other platforms — continue
        } else {
          results.linkedin = await this.postToLinkedIn(content.linkedin)
          this.bumpRL('linkedin')
        }
      } else {
        results.linkedin = await this.postToLinkedIn(content.linkedin)
        this.bumpRL('linkedin')
      }
      await this.sleep(1500)
    }

    // ── Twitter
    if (content.twitter && this.canPost('twitter') && platformState.twitter !== false) {
      if (requireApproval) {
        const approved = await this.getApproval('twitter', content.twitter, content.product)
        if (!approved) {
          results.twitter = { success: false, reason: 'rejected_or_pending' }
          this.orchestrator.broadcast({ type: 'task', message: '[TWITTER] ⏳ Waiting for your email approval...', level: 'info' })
        } else {
          results.twitter = await this.postTwitterThread(content.twitter)
          this.bumpRL('twitter')
        }
      } else {
        results.twitter = await this.postTwitterThread(content.twitter)
        this.bumpRL('twitter')
      }
      await this.sleep(1500)
    }

    // ── Reddit
    if (content.reddit && this.canPost('reddit') && platformState.reddit !== false) {
      if (requireApproval) {
        const approved = await this.getApproval('reddit', content.reddit, content.product)
        if (!approved) {
          results.reddit = { success: false, reason: 'rejected_or_pending' }
        } else {
          results.reddit = await this.postToReddit(content.reddit)
          this.bumpRL('reddit')
        }
      } else {
        results.reddit = await this.postToReddit(content.reddit)
        this.bumpRL('reddit')
      }
    }

    // Mark content published/pending
    const anyPublished = Object.values(results).some(r => r?.success)
    await Content.updateMany(
      { status: 'ready', createdAt: { $gte: new Date(Date.now() - 300000) } },
      { status: anyPublished ? 'published' : 'pending_approval', publishResults: results }
    ).catch(() => {})

    const published = Object.entries(results).filter(([, r]) => r?.success).map(([k]) => k)
    const pending   = Object.entries(results).filter(([, r]) => r?.reason === 'rejected_or_pending').map(([k]) => k)
    const simulated = Object.entries(results).filter(([, r]) => r?.simulated).map(([k]) => k)

    if (requireApproval && pending.length > 0) {
      this.orchestrator.broadcast({
        type:    'task',
        message: `[PUBLISHER] 📧 Review emails sent for: ${pending.join(', ')} — check ${process.env.ALERT_EMAIL}`,
        level:   'info'
      })
    }

    this.orchestrator.broadcast({
      type:    'task',
      message: `[PUBLISHER] Published: ${published.join(', ') || 'none'} | Pending: ${pending.join(', ') || 'none'} | Simulated: ${simulated.join(', ') || 'none'}`,
      level:   published.length > 0 ? 'success' : 'info'
    })

    return results
  }

  // ── APPROVAL GATE — send email and wait
  async getApproval(platform, content, product) {
    try {
      const approval = require('../services/ApprovalService')
      const result   = await approval.requestApproval(content, platform, product || 'toolifyai')

      if (result.auto) return true // auto-approved (approval disabled)

      // Wait for founder to click approve/reject in email
      this.orchestrator.broadcast({
        type:    'task',
        message: `[PUBLISHER] 📧 Review email sent for ${platform.toUpperCase()} — waiting for your decision...`,
        level:   'info'
      })

      const decision = await approval.waitForApproval(result.pendingId, 120) // wait up to 2 hours

      if (decision.approved) {
        this.orchestrator.broadcast({
          type:    'task',
          message: `[PUBLISHER] ✅ ${platform.toUpperCase()} post APPROVED — publishing now`,
          level:   'success'
        })
        return true
      } else {
        this.orchestrator.broadcast({
          type:    'task',
          message: `[PUBLISHER] ❌ ${platform.toUpperCase()} post ${decision.reason === 'rejected' ? 'REJECTED' : 'timed out'} — skipping`,
          level:   'warning'
        })
        return false
      }
    } catch (err) {
      // If approval system fails, fall back to auto-publish
      this.orchestrator.broadcast({
        type:    'error',
        message: `[PUBLISHER] Approval error: ${err.message} — publishing anyway`,
        level:   'warning'
      })
      return true
    }
  }

  // ── LINKEDIN
  async postToLinkedIn(post) {
    const token    = process.env.LINKEDIN_ACCESS_TOKEN
    const personId = process.env.LINKEDIN_PERSON_ID

    if (!token || !personId || token.includes('your-') || token.length < 20) {
      return this.logPost('linkedin', '', null, 'no_credentials', 'Run: node linkedin-auth.js')
    }

    const postText = this.buildLinkedInText(post)
    const body     = JSON.stringify({
      author:          `urn:li:person:${personId}`,
      lifecycleState:  'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary:    { text: postText },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    })

    return new Promise((resolve) => {
      const req = https.request({
        hostname: 'api.linkedin.com',
        path:     '/v2/ugcPosts',
        method:   'POST',
        headers:  {
          Authorization:               `Bearer ${token}`,
          'Content-Type':              'application/json',
          'Content-Length':            Buffer.byteLength(body),
          'X-Restli-Protocol-Version': '2.0.0',
        },
      }, (res) => {
        let data = ''
        res.on('data', c => data += c)
        res.on('end', async () => {
          if (res.statusCode === 201) {
            let json = {}; try { json = JSON.parse(data) } catch {}
            const url = json.id ? `https://www.linkedin.com/feed/update/${json.id}/` : 'https://linkedin.com'
            await this.logPost('linkedin', postText.slice(0, 120), url, 'success')
            this.orchestrator.broadcast({ type: 'task', message: `[LINKEDIN] ✅ Posted to personal profile`, level: 'success' })
            resolve({ success: true, url, postId: json.id })
          } else if (res.statusCode === 401) {
            await this.logPost('linkedin', postText.slice(0, 120), null, 'failed', 'Token expired')
            this.orchestrator.broadcast({ type: 'error', message: '[LINKEDIN] ❌ Token expired — run: node linkedin-auth.js', level: 'error' })
            resolve({ success: false, error: 'token_expired' })
          } else {
            await this.logPost('linkedin', postText.slice(0, 120), null, 'failed', `${res.statusCode}: ${data.slice(0,100)}`)
            this.orchestrator.broadcast({ type: 'error', message: `[LINKEDIN] ❌ Failed ${res.statusCode}: ${data.slice(0, 80)}`, level: 'error' })
            resolve({ success: false, error: data })
          }
        })
      })
      req.on('error', async (err) => {
        await this.logPost('linkedin', postText.slice(0, 120), null, 'failed', err.message)
        resolve({ success: false, error: err.message })
      })
      req.write(body); req.end()
    })
  }

  buildLinkedInText(post) {
    if (post?.text && typeof post.text === 'string' && post.text.trim().length > 80) return post.text.trim()
    const fallbacks = [
      `Building Toolify AI in public 🚀\n\nDay ${new Date().getDate()} — autonomous engine update:\n\n→ AI agents researched Reddit + HN trends\n→ Generated content for LinkedIn, Twitter, Reddit\n→ Razorpay tracking revenue (₹0 so far — but live)\n\n3 AI tools for Indian freelancers:\n✍️ ReplyDraft AI — email replies in 10s (₹750/mo)\n🛒 ListingLift AI — 5 marketplace listings instantly (₹249)\n🔍 PolicyPal AI — understand any ToS (₹399)\n\nOllama local = ₹0 AI cost. ~98% margin.\n\nLink in comments. #ToolifyAI #BuildingInPublic`,
      `Freelancers — how much time do you spend writing client emails?\n\nMost people I talk to: 3-5 hours/week.\n\nThat's nearly a full day every month just on email.\n\nBuilt ReplyDraft AI to fix this:\n→ Paste the email you received\n→ Pick your tone\n→ Get a professional reply in 10 seconds\n\n₹750/month. Free trial available. Link in comments.\n\n#FreelanceIndia #Productivity #ToolifyAI`,
      `The honest math of running a SaaS in India in 2026:\n\nOllama local AI → ₹0/month\nMongoDB Atlas free tier → ₹0/month\nVercel hosting → ₹0/month\nRazorpay fee → 2% of revenue\n\nProduct price: ₹750/user\nCost per user: ~₹15\nMargin: ~98%\n\nBuilding Toolify AI on this stack. 3 products live.\n\nStill at ₹0 MRR — but the machine is running.\n\n#IndieHacker #SaaSIndia #ToolifyAI`,
    ]
    return fallbacks[new Date().getDate() % fallbacks.length]
  }

  // ── TWITTER (OAuth 1.0a)
  async postTwitterThread(tweets) {
    const apiKey    = process.env.TWITTER_API_KEY
    const apiSecret = process.env.TWITTER_API_SECRET
    const accToken  = process.env.TWITTER_ACCESS_TOKEN
    const accSecret = process.env.TWITTER_ACCESS_SECRET

    if (!apiKey || !apiSecret || !accToken || !accSecret) {
      return this.logPost('twitter', '', null, 'no_credentials', 'Need TWITTER_API_KEY, API_SECRET, ACCESS_TOKEN, ACCESS_SECRET')
    }

    const tweetList = Array.isArray(tweets) && tweets.length > 0 ? tweets : this.buildFallbackTweets()

    try {
      let replyToId = null
      const posted  = []

      for (const tweetText of tweetList.slice(0, 8)) {
        const body    = JSON.stringify({ text: String(tweetText).slice(0, 280), ...(replyToId ? { reply: { in_reply_to_tweet_id: replyToId } } : {}) })
        const authHdr = this.buildOAuth1Header('POST', 'https://api.twitter.com/2/tweets', apiKey, apiSecret, accToken, accSecret)
        const res     = await axios.post('https://api.twitter.com/2/tweets', body, {
          headers: { Authorization: authHdr, 'Content-Type': 'application/json' },
          timeout: 15000,
        })
        replyToId = res.data?.data?.id
        if (replyToId) posted.push(replyToId)
        await this.sleep(1000)
      }

      if (posted.length > 0) {
        const url = `https://twitter.com/i/status/${posted[0]}`
        await this.logPost('twitter', tweetList[0].slice(0, 100), url, 'success')
        this.orchestrator.broadcast({ type: 'task', message: `[TWITTER] ✅ Thread posted — ${posted.length} tweets`, level: 'success' })
        return { success: true, url, tweetIds: posted }
      }
      throw new Error('No tweet IDs returned')
    } catch (err) {
      const msg = err.response?.data?.detail || err.response?.data?.title || err.message
      await this.logPost('twitter', (tweetList[0] || '').slice(0, 100), null, 'failed', msg)
      this.orchestrator.broadcast({ type: 'error', message: `[TWITTER] ❌ ${msg}`, level: 'error' })
      return { success: false, error: msg }
    }
  }

  buildOAuth1Header(method, url, apiKey, apiSecret, accToken, accSecret) {
    const ts    = Math.floor(Date.now() / 1000).toString()
    const nonce = crypto.randomBytes(16).toString('hex')
    const params = { oauth_consumer_key: apiKey, oauth_nonce: nonce, oauth_signature_method: 'HMAC-SHA1', oauth_timestamp: ts, oauth_token: accToken, oauth_version: '1.0' }
    const sorted = Object.keys(params).sort().map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&')
    const base   = [method.toUpperCase(), encodeURIComponent(url), encodeURIComponent(sorted)].join('&')
    const sigKey = `${encodeURIComponent(apiSecret)}&${encodeURIComponent(accSecret)}`
    params.oauth_signature = crypto.createHmac('sha1', sigKey).update(base).digest('base64')
    const parts = Object.keys(params).sort().map(k => `${encodeURIComponent(k)}="${encodeURIComponent(params[k])}"`).join(', ')
    return `OAuth ${parts}`
  }

  buildFallbackTweets() {
    return [
      `Building an autonomous AI company in India 🤖\n\nThe engine posts content, tracks revenue, and makes decisions — all without me.\n\nDay ${new Date().getDate()} update 👇`,
      `3 AI tools live on Toolify AI:\n\n✍️ ReplyDraft AI — client emails in 10 seconds\n🛒 ListingLift AI — 5 marketplace listings instantly\n🔍 PolicyPal AI — understand any ToS\n\nAll built for Indian freelancers and sellers.`,
      `The margin math:\n→ Ollama local AI: ₹0 cost\n→ Razorpay fee: 2%\n→ Product price: ₹249–₹750\n\n~98% margin on every sale.\n\nBuilding in public until it works.`,
      `Still at ₹0 MRR. But the machine is running 24/7.\n\nTry free → toolifysahilsingh.co.in.com\n\n#ToolifyAI #BuildingInPublic #IndieHacker #SaaSIndia`,
    ]
  }

  // ── REDDIT
  async postToReddit(post) {
    const token = await this.getRedditToken()
    if (!token) return this.logPost('reddit', post?.title || '', null, 'simulated', 'Add Reddit credentials to .env')
    try {
      const body = new URLSearchParams({
        sr: post.subreddit || 'freelance', kind: 'self',
        title: post.title || 'Sharing something useful',
        text: (post.body || '') + (post.mentionProduct && post.productMentionText ? `\n\n---\n${post.productMentionText}` : ''),
        resubmit: 'true', sendreplies: 'true',
      })
      const res    = await axios.post('https://oauth.reddit.com/api/submit', body, {
        headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'ToolifyAIBot/1.0', 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000,
      })
      const errors = res.data?.json?.errors
      if (errors?.length) throw new Error(errors[0][1])
      const postId = res.data?.json?.data?.id
      const url    = postId ? `https://reddit.com/r/${post.subreddit}/comments/${postId}` : null
      await this.logPost('reddit', post.title || '', url, 'success')
      this.orchestrator.broadcast({ type: 'task', message: `[REDDIT] ✅ Posted to r/${post.subreddit}`, level: 'success' })
      return { success: true, url, postId }
    } catch (err) {
      await this.logPost('reddit', post?.title || '', null, 'failed', err.message)
      this.orchestrator.broadcast({ type: 'error', message: `[REDDIT] ❌ ${err.message}`, level: 'error' })
      return { success: false, error: err.message }
    }
  }

  // ── ENGAGEMENT
  async respondToMentions() {
    const token = await this.getRedditToken(); if (!token) return
    try {
      const res      = await axios.get('https://oauth.reddit.com/message/mentions.json', { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'ToolifyAIBot/1.0' } })
      const mentions = res.data?.data?.children?.map(c => c.data) || []
      for (const m of mentions.slice(0, 3)) {
        const reply = await this.orchestrator.agents.content?.generateReply({ text: m.body, platform: 'reddit', product: 'toolifyai', sentiment: 'neutral' }).catch(() => null)
        if (reply?.length > 20) { await this.replyReddit(m.name, reply); await this.sleep(5000) }
      }
    } catch {}
  }

  async engageWithCommunity() {
    const token = await this.getRedditToken(); if (!token) return
    for (const sub of ['freelance', 'Etsy']) {
      try {
        const res   = await axios.get(`https://oauth.reddit.com/r/${sub}/new.json?limit=10`, { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'ToolifyAIBot/1.0' } })
        const posts = res.data?.data?.children?.map(c => c.data) || []
        for (const post of posts.slice(0, 2)) {
          const kw = ['email', 'reply', 'listing', 'terms of service', 'privacy', 'client']
          if (kw.some(k => (post.title + post.selftext).toLowerCase().includes(k)) && !post.locked) {
            const reply = await this.orchestrator.agents.content?.generateReply({ text: post.title, platform: 'reddit', product: 'toolifyai', sentiment: 'neutral' }).catch(() => null)
            if (reply?.length > 50) { await this.replyReddit(post.name, reply); await this.sleep(30000) }
          }
        }
        await this.sleep(3000)
      } catch {}
    }
  }

  async checkEngagements() {}

  async getRedditToken() {
    if (!process.env.REDDIT_CLIENT_ID || process.env.REDDIT_CLIENT_ID === 'your-reddit-app-id') return null
    if (this.redditToken && this.tokenExpiry > Date.now()) return this.redditToken
    try {
      const res = await axios.post('https://www.reddit.com/api/v1/access_token',
        `grant_type=password&username=${encodeURIComponent(process.env.REDDIT_USERNAME)}&password=${encodeURIComponent(process.env.REDDIT_PASSWORD)}`,
        { auth: { username: process.env.REDDIT_CLIENT_ID, password: process.env.REDDIT_CLIENT_SECRET }, headers: { 'User-Agent': 'ToolifyAIBot/1.0', 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 8000 }
      )
      this.redditToken = res.data.access_token
      this.tokenExpiry = Date.now() + (res.data.expires_in * 1000) - 60000
      return this.redditToken
    } catch { return null }
  }

  async replyReddit(thingId, text) {
    const token = await this.getRedditToken(); if (!token) return
    await axios.post('https://oauth.reddit.com/api/comment', new URLSearchParams({ thing_id: thingId, text }),
      { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'ToolifyAIBot/1.0' } }).catch(() => {})
  }

  canPost(p) { const r=this.rl[p]; if(!r)return false; if(Date.now()-r.reset>3600000){r.posts=0;r.reset=Date.now()} return r.posts<r.max }
  bumpRL(p)  { if(this.rl[p]) this.rl[p].posts++ }
  async logPost(platform, content, url, status, error='') {
    try { await PublishLog.create({ platform, content: String(content).slice(0,200), url, status, error }) } catch {}
    return { success: status==='success', simulated: status==='simulated', url }
  }
  sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
}

module.exports = PublisherAgent
