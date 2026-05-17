/**
 * LINKEDIN REPLY AGENT — Toolify AI
 * Monitors LinkedIn post comments and auto-replies using AI
 * Rules: short, human, friendly, never robotic
 */

const https = require('https')
const { AgentLog } = require('../models')

class LinkedInReplyAgent {
  constructor(orchestrator) {
    this.orchestrator = orchestrator
    this.name         = 'linkedinReply'
    this.enabled      = false
    this.processedComments = new Set() // track replied comment IDs in memory
  }

  async initialize() {
    const token    = process.env.LINKEDIN_ACCESS_TOKEN
    const personId = process.env.LINKEDIN_PERSON_ID
    this.enabled   = !!(token && personId && token.length > 50)
    console.log(`  ✓ LinkedInReplyAgent ready ${this.enabled ? '(monitoring comments)' : '(no token)'}`)
  }

  // ── Fetch recent posts by the user
  async getMyRecentPosts() {
    const token    = process.env.LINKEDIN_ACCESS_TOKEN
    const personId = process.env.LINKEDIN_PERSON_ID
    if (!token || !personId) return []

    return new Promise((resolve) => {
      const req = https.request({
        hostname: 'api.linkedin.com',
        path:     `/v2/ugcPosts?q=authors&authors=List(urn%3Ali%3Aperson%3A${personId})&count=5`,
        method:   'GET',
        headers:  {
          Authorization:               `Bearer ${token}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
        timeout: 10000,
      }, (res) => {
        let d = ''
        res.on('data', c => d += c)
        res.on('end', () => {
          try {
            const json = JSON.parse(d)
            resolve(json.elements || [])
          } catch { resolve([]) }
        })
      })
      req.on('error', () => resolve([]))
      req.on('timeout', () => { req.destroy(); resolve([]) })
      req.end()
    })
  }

  // ── Fetch comments on a specific post
  async getPostComments(postUrn) {
    const token = process.env.LINKEDIN_ACCESS_TOKEN
    if (!token) return []

    const encodedUrn = encodeURIComponent(postUrn)
    return new Promise((resolve) => {
      const req = https.request({
        hostname: 'api.linkedin.com',
        path:     `/v2/socialActions/${encodedUrn}/comments?count=20`,
        method:   'GET',
        headers:  {
          Authorization:               `Bearer ${token}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
        timeout: 10000,
      }, (res) => {
        let d = ''
        res.on('data', c => d += c)
        res.on('end', () => {
          try { resolve(JSON.parse(d).elements || []) }
          catch { resolve([]) }
        })
      })
      req.on('error', () => resolve([]))
      req.on('timeout', () => { req.destroy(); resolve([]) })
      req.end()
    })
  }

  // ── Generate reply using AI
  async generateReply({ postText, commentText, commenterName, previousReplies = [] }) {
    const prompt = `You are an AI social media engagement assistant for Toolify AI (a SaaS for Indian freelancers).

Your job is to generate professional, human-like replies to LinkedIn comments.

Rules:
- Keep replies short and natural (under 2 sentences)
- Sound friendly, smart, conversational
- Never sound robotic or corporate
- Match the tone of the comment
- If praise: thank genuinely
- If question: answer clearly and directly  
- If feedback: acknowledge positively
- Never argue, offend, or be defensive
- Avoid emojis unless comment uses them
- Avoid hashtags
- Never mention you are an AI
- If spam, irrelevant, or "DM me" style: return exactly: SKIP_REPLY

Context:
Original post: ${(postText || '').slice(0, 300)}
Commenter: ${commenterName || 'Someone'}
Comment: "${commentText}"
${previousReplies.length > 0 ? `Previous replies: ${previousReplies.slice(0, 2).join(' | ')}` : ''}

Output ONLY the reply text. Nothing else. No quotes.`

    try {
      const reply = await this.orchestrator.callAI(prompt)
      const cleaned = reply.trim().replace(/^["']|["']$/g, '')

      // Validate reply
      if (!cleaned || cleaned.length < 3) return null
      if (cleaned === 'SKIP_REPLY') return null
      if (cleaned.length > 400) return cleaned.slice(0, 400) // cap length

      return cleaned
    } catch {
      return null
    }
  }

  // ── Post a reply to a LinkedIn comment
  async postReply(postUrn, commentText) {
    const token    = process.env.LINKEDIN_ACCESS_TOKEN
    const personId = process.env.LINKEDIN_PERSON_ID
    if (!token || !personId) return false

    const encodedUrn = encodeURIComponent(postUrn)
    const body = JSON.stringify({
      actor:   `urn:li:person:${personId}`,
      message: { text: commentText },
    })

    return new Promise((resolve) => {
      const req = https.request({
        hostname: 'api.linkedin.com',
        path:     `/v2/socialActions/${encodedUrn}/comments`,
        method:   'POST',
        headers:  {
          Authorization:               `Bearer ${token}`,
          'Content-Type':              'application/json',
          'Content-Length':            Buffer.byteLength(body),
          'X-Restli-Protocol-Version': '2.0.0',
        },
        timeout: 10000,
      }, (res) => {
        res.resume()
        resolve(res.statusCode === 201)
      })
      req.on('error', () => resolve(false))
      req.on('timeout', () => { req.destroy(); resolve(false) })
      req.write(body)
      req.end()
    })
  }

  // ── MAIN: scan and reply to unprocessed comments
  async scanAndReply() {
    if (!this.enabled) return

    this.orchestrator.broadcast({ type: 'task', message: '[LINKEDIN REPLY] Scanning comments on recent posts...', level: 'info' })

    try {
      const posts = await this.getMyRecentPosts()
      if (!posts.length) return

      let repliedCount = 0

      for (const post of posts.slice(0, 3)) { // check last 3 posts
        const postUrn  = post.id
        const postText = post.specificContent?.['com.linkedin.ugc.ShareContent']?.shareCommentary?.text || ''
        const comments = await this.getPostComments(postUrn)

        for (const comment of comments) {
          const commentId     = comment.id
          const commentText   = comment.message?.text || ''
          const commenterName = comment.actor?.split(':').pop() || 'Someone'

          // Skip if already processed
          if (this.processedComments.has(commentId)) continue

          // Skip empty or very short comments
          if (!commentText || commentText.trim().length < 3) {
            this.processedComments.add(commentId)
            continue
          }

          // Generate reply
          const reply = await this.generateReply({ postText, commentText, commenterName })
          this.processedComments.add(commentId)

          if (!reply) {
            this.orchestrator.broadcast({
              type: 'task', message: `[LINKEDIN REPLY] Skipped: "${commentText.slice(0, 40)}..."`, level: 'info'
            })
            continue
          }

          // Post the reply
          const posted = await this.postReply(postUrn, reply)
          if (posted) {
            repliedCount++
            this.orchestrator.broadcast({
              type: 'task',
              message: `[LINKEDIN REPLY] ✅ Replied to "${commenterName}": "${reply.slice(0, 60)}..."`,
              level: 'success'
            })
            await AgentLog.create({ agent: 'linkedinReply', task: 'scanAndReply', level: 'success', message: `Replied to ${commenterName}: ${reply.slice(0, 100)}` }).catch(() => {})
          }

          // Rate limit: wait 3s between replies
          await new Promise(r => setTimeout(r, 3000))
        }
      }

      if (repliedCount === 0) {
        this.orchestrator.broadcast({ type: 'task', message: '[LINKEDIN REPLY] No new comments to reply to', level: 'info' })
      } else {
        this.orchestrator.broadcast({ type: 'task', message: `[LINKEDIN REPLY] Replied to ${repliedCount} comment(s)`, level: 'success' })
      }

    } catch (err) {
      this.orchestrator.broadcast({ type: 'error', message: `[LINKEDIN REPLY] Error: ${err.message}`, level: 'error' })
    }
  }
}

module.exports = LinkedInReplyAgent
