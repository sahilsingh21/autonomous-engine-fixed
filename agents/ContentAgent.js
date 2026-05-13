/**
 * CONTENT AGENT — TOOLIFY AI
 * Fixed:
 *  1. LinkedIn post always has fallback — never returns null
 *  2. Twitter thread always has fallback
 *  3. Reddit post always has fallback
 *  4. All AI calls wrapped in try/catch with hardcoded fallbacks
 */

const https = require('https')
const axios = require('axios')
const { Content } = require('../models')

const PRODUCTS = [
  {
    id: 'replydraft', name: 'ReplyDraft AI', price: '₹750/mo',
    url:    process.env.REPLYDRAFT_URL || 'https://toolifyai.com/replydraft',
    pain:   'writing professional replies to client emails and LinkedIn messages',
    target: 'freelancers, consultants, VAs, and remote workers in India',
    sub:    'freelance',
  },
  {
    id: 'listinglift', name: 'ListingLift AI', price: '₹249/batch',
    url:    process.env.LISTINGLIFT_URL || 'https://toolifyai.com/listinglift',
    pain:   'writing product listings for Amazon, Flipkart, Etsy, Shopify',
    target: 'online sellers, Etsy shop owners, D2C brands in India',
    sub:    'Etsy',
  },
  {
    id: 'policypal', name: 'PolicyPal AI', price: '₹399/doc',
    url:    process.env.POLICYPAL_URL || 'https://toolifyai.com/policypal',
    pain:   'understanding Terms of Service and Privacy Policy documents',
    target: 'individuals, small businesses, and startup founders',
    sub:    'smallbusiness',
  },
]

// ── Hardcoded fallback content — used when AI is unavailable
const FALLBACK_LINKEDIN = [
  `Building Toolify AI in public 🚀

Running an autonomous AI company with 5 AI agents that post content, track revenue, and make decisions 24/7.

3 products live for Indian freelancers and sellers:
✍️ ReplyDraft AI — professional email replies in 10 seconds (₹750/mo)
🛒 ListingLift AI — 5 marketplace listings from one description (₹249)
🔍 PolicyPal AI — understand any ToS in plain English (₹399)

AI cost per user: ₹0 (running Ollama locally)
Margin: ~98%+

If you're a freelancer or online seller in India, check it out. Link in comments.

#ToolifyAI #BuildingInPublic #FreelanceIndia`,

  `The honest truth about building a SaaS in India in 2026:

The hardest part isn't building — it's getting the first 10 paying users.

What I'm doing with Toolify AI:
→ Autonomous engine posts content 3x/day on LinkedIn + Reddit
→ AI agents research trending topics and adjust messaging
→ Razorpay handles payments (UPI, cards, net banking)
→ Ollama runs all AI locally — ₹0 API cost

Products: ReplyDraft AI, ListingLift AI, PolicyPal AI

Still at ₹0 MRR. But the machine is running. Building in public until it works.

#IndieHacker #SaaSIndia #ToolifyAI`,

  `Freelancers — quick question:

How much time do you spend every week writing professional emails and replies to clients?

Most people I talk to say 3-5 hours per week. That's nearly a full day every month just on email copy.

I built ReplyDraft AI to fix this:
→ Paste the email you received
→ Pick your tone (professional, friendly, firm)
→ Get a ready-to-send reply in 10 seconds

₹750/month. Free trial available.

Link in comments if you want to try it.

#Freelance #Productivity #ToolifyAI`,
]

const FALLBACK_TWEETS = [
  [
    'Built an autonomous AI company that runs itself 24/7 🤖\n\nNo employees. No manual work. Just 5 AI agents.\n\nHere\'s how it works 👇',
    'α Research Agent scans Reddit + HN daily for trending topics\nFinds pain points real people are complaining about',
    'β Content Agent writes posts for LinkedIn, Reddit, and Twitter\nUsing Ollama locally — ₹0 AI cost',
    'γ Publisher Agent posts automatically\nLinkedIn ✓ | Reddit (soon) | Twitter ✓',
    'δ Finance Agent tracks Razorpay payments\nAuto-kills products with 0 revenue after 3 days',
    'ε Optimizer Agent runs A/B tests\nPricing, headlines, landing pages',
    '3 products live:\n✍️ ReplyDraft AI (₹750/mo)\n🛒 ListingLift AI (₹249)\n🔍 PolicyPal AI (₹399)\n\nAll for Indian freelancers and sellers.',
    'Still at ₹0 MRR. But the machine is running.\n\nBuilding in public → toolifyai.com\n\n#ToolifyAI #BuildingInPublic #IndieHacker',
  ],
  [
    'Running Ollama locally changed everything for my SaaS 🔥\n\nHere\'s what changed 👇',
    'Before: Paying $50-100/month for OpenAI API\nConversion rate anxiety: every AI call costs money',
    'After: Ollama on local machine\nAPI cost: ₹0\nSpeed: fast\nPrivacy: data never leaves device',
    'The margin math:\nReplyDraft AI: ₹750/user/mo\nOllama cost: ₹0\nRazorpay fee: ~₹22\nNet profit: ₹728 per user',
    'That\'s 97%+ margin before any fixed costs.\n\nBuilding Toolify AI on this stack.',
    '3 tools live: ReplyDraft, ListingLift, PolicyPal\nAll running on Ollama locally\n\nLink in bio → #ToolifyAI #Ollama #IndieHacker',
  ],
]

const FALLBACK_REDDIT = {
  replydraft: {
    title: 'How I handle 50+ client emails per week without losing my mind',
    body: `I've been freelancing for 3 years and the biggest time sink has always been email.

Not the actual work — the back-and-forth with clients. Confirming timelines, sending updates, handling revision requests, dealing with late payments.

Last year I started using an AI to draft my replies. Here's my current workflow:

**What I do:**
1. Read the email once
2. Paste it into the tool with a quick note on my goal (confirm meeting, ask for payment, etc.)
3. Review and send the AI draft — usually takes 30 seconds

This cut my email time from ~2 hours/day to about 20 minutes.

The key is having a good prompt for your specific tone. Mine is "professional but warm, not corporate, be direct."

Anyone else doing something similar? What's your workflow for handling client communication efficiently?

*(I ended up building a Chrome extension for this — ReplyDraft AI — if you want to try it, happy to share the link)*`,
    subreddit: 'freelance',
    mentionProduct: true,
    productMentionText: 'PS: The tool I mentioned is ReplyDraft AI — free trial available at toolifyai.com',
  },
  listinglift: {
    title: 'Stop writing marketplace listings from scratch — my time-saving process',
    body: `Selling on Etsy, Amazon, and eBay simultaneously is a lot of listing work.

Every product needs a different description for each platform:
- Amazon wants keyword-stuffed titles and bullet points
- Etsy wants a handmade story
- eBay wants clear condition descriptions

I used to write each one separately — took about 45 minutes per product.

Now I paste one description and generate all 5 platform listings at once. Takes 2 minutes.

The key differences per platform that the AI handles:
- **Amazon**: lead with the primary keyword, 5 bullet points starting with capital letters
- **Etsy**: story-driven, emphasize handmade/vintage, end with care instructions
- **Shopify**: conversion-focused, lead with the benefit not the feature
- **eBay**: condition first, then structured description
- **Depop**: casual Gen Z tone, keep it short

Anyone have tips for standing out in saturated categories?`,
    subreddit: 'Etsy',
    mentionProduct: true,
    productMentionText: 'PS: I use ListingLift AI for this — toolifyai.com',
  },
  policypal: {
    title: 'Always check the ToS before you sign up — a reminder',
    body: `Recently switched to a new SaaS tool for my freelance business. Didn't read the ToS properly.

Turns out: they own a non-exclusive license to anything processed through their platform.

That's my clients' work. Not ideal.

Three clauses I now always check before signing up for any tool:

1. **Data ownership** — who owns what you upload/create
2. **Cancellation terms** — can they keep your data after you cancel?
3. **Sharing/selling data** — will they share your data with third parties?

Most ToS are 30+ pages of legal language specifically designed to be unreadable.

I now paste them into an AI and ask for a plain-English summary with risk flags highlighted. Takes 30 seconds.

What's the worst ToS clause you've ever found hiding in the fine print?`,
    subreddit: 'smallbusiness',
    mentionProduct: true,
    productMentionText: 'PS: I use PolicyPal AI for ToS summaries — toolifyai.com',
  },
}

class ContentAgent {
  constructor(orchestrator) {
    this.orchestrator = orchestrator
    this.name = 'content'
    this.postCount = 0
  }

  async initialize() {
    console.log('  ✓ ContentAgent ready (Ollama-powered with hardcoded fallbacks)')
  }

  // ── DAILY: generate full content batch
  async generateDailyContent({ research, decision, topic, imagePrompt } = {}) {
    this.orchestrator.broadcast({ type: 'task', message: '[CONTENT] Generating daily content batch...', level: 'info' })
    this.orchestrator.broadcast({ type: 'task', message: `[CONTENT] Params: topic=${topic}, imagePrompt=${imagePrompt?.slice(0,50)}`, level: 'info' })
    this.postCount++

    if (!research) {
      research = await this.orchestrator.runTask('research', 'trendResearch', { silent: true }) || {}
    }

    const product     = this.selectProduct(decision)
    const angle       = this.pickContentAngle(research, topic)
    const imagePromptText = imagePrompt?.trim() || `A high quality social media marketing image for ${product.name} about ${angle}. Bright, modern, minimal, professional style with an Indian startup founder vibe.`
    const image       = await this.generateHuggingFaceImage(imagePromptText).catch(() => null)

    // Run all in parallel — each has its own fallback
    const [reddit, twitter, linkedin, blog] = await Promise.allSettled([
      this.generateRedditPost(product, angle, research),
      this.generateTwitterThread(product, angle),
      this.generateLinkedInPost(product, angle),
      this.generateBlogOutline(product, angle), 
    ])

    let linkedinPayload = linkedin.value
    if (typeof linkedinPayload === 'string') {
      linkedinPayload = { text: linkedinPayload, platform: 'linkedin', product: product.id }
    }
    if (!linkedinPayload || typeof linkedinPayload !== 'object') {
      linkedinPayload = { text: FALLBACK_LINKEDIN[this.postCount % FALLBACK_LINKEDIN.length], platform: 'linkedin', product: product.id }
    }

    const imagePayload = image ? { data: image, alt: `Generated image for ${product.name}`, title: `${product.name} social creative`, prompt: imagePromptText } : null
    if (imagePayload) {
      linkedinPayload.image = imagePayload
    }

    const batch = {
      product:  product.id,
      date:     new Date(),
      reddit:   reddit.value   || FALLBACK_REDDIT[product.id] || FALLBACK_REDDIT.replydraft,
      twitter:  twitter.value  || FALLBACK_TWEETS[this.postCount % FALLBACK_TWEETS.length],
      linkedin: linkedinPayload,
      blog:     blog.value     || null,
      angle,
      image:    imagePayload,
    }

    // Ensure linkedin always has content
    if (!batch.linkedin?.text || batch.linkedin.text.length < 50) {
      batch.linkedin = {
        text: FALLBACK_LINKEDIN[this.postCount % FALLBACK_LINKEDIN.length],
        platform: 'linkedin',
        product: product.id
      }
    }

    // Ensure twitter always has content
    if (!batch.twitter || !Array.isArray(batch.twitter) || batch.twitter.length === 0) {
      batch.twitter = FALLBACK_TWEETS[this.postCount % FALLBACK_TWEETS.length]
    }

    await Content.create({
      type: 'daily_batch', product: product.id,
      platform: 'multi', content: batch, status: 'ready',
    }).catch(() => {})

    const count = [batch.reddit, batch.twitter, batch.linkedin].filter(Boolean).length
    this.orchestrator.broadcast({
      type: 'task',
      message: `[CONTENT] ✓ Generated ${count} content pieces for ${product.name}`,
      level: 'success'
    })

    return batch
  }

  // ── Reddit post
  async generateRedditPost(product, angle, research) {
    // Use fallback immediately if AI unavailable
    const fallback = FALLBACK_REDDIT[product.id] || FALLBACK_REDDIT.replydraft

    const sub    = research?.redditSubsToPost?.[0] || product.sub
    const prompt = `Write a Reddit post for r/${sub} that provides GENUINE VALUE to the community.

Product context: ${product.name} solves: ${product.pain} for ${product.target}
Content angle: ${angle}

Rules:
- Genuine helpful content FIRST — not promotional
- Write like a real community member
- Use fresh research and keep the post unique
- Only mention the product briefly at the END if it fits
- Hook title that gets upvotes
- 3-5 actionable tips in the body

Return JSON ONLY (no extra text):
{"title":"","body":"","subreddit":"${sub}","mentionProduct":true,"productMentionText":"PS: I built ${product.name} for this — ${product.url}"}`

    try {
      const res    = await this.orchestrator.callAI(prompt)
      const parsed = this.orchestrator.parseJSON(res)
      if (parsed?.title && parsed?.body && parsed.title.length > 10 && parsed.body.length > 100) {
        return parsed
      }
      return fallback
    } catch {
      return fallback
    }
  }

  // ── Twitter thread
  async generateTwitterThread(product, angle) {
    const fallback = FALLBACK_TWEETS[this.postCount % FALLBACK_TWEETS.length]

    const prompt = `Write a Twitter thread (6-7 tweets) about: "${angle}"
Target: ${product.target}

Rules:
- Tweet 1: powerful hook — stat, bold claim, or relatable pain
- Tweets 2-5: genuine tips — real value, not sales
- Tweet 6: mention building ${product.name} to solve this
- Tweet 7: soft CTA + #ToolifyAI #BuildingInPublic
- Use fresh research and avoid repeating old posts
- Each tweet under 270 chars
- Sound like a real founder, not a brand

Return JSON array ONLY: ["tweet1","tweet2","tweet3","tweet4","tweet5","tweet6","tweet7"]`

    try {
      const res    = await this.orchestrator.callAI(prompt)
      const parsed = this.orchestrator.parseJSON(res)
      if (Array.isArray(parsed) && parsed.length >= 4) return parsed
      return fallback
    } catch {
      return fallback
    }
  }

  // ── LinkedIn post — always returns something
  async generateLinkedInPost(product, angle) {
    const fallback = {
      text: FALLBACK_LINKEDIN[this.postCount % FALLBACK_LINKEDIN.length],
      platform: 'linkedin',
      product: product.id
    }

    const prompt = `Write a LinkedIn post (180-250 words) from a founder building Toolify AI in India.

Topic: ${angle}
Related product: ${product.name} — solves: ${product.pain}

Style:
- Personal observation or story — NOT a press release
- Hook first line (no "I'm excited to announce")
- 3-4 real insights
- Mention building Toolify AI naturally
- Use fresh research and keep this post unique
- End: "Toolify AI helps ${product.target}. Link in comments."
- Max 2 hashtags: #ToolifyAI #BuildingInPublic

Write the post text directly. No JSON. Just the post.`

    try {
      const text = await this.orchestrator.callAI(prompt)
      if (text && text.trim().length > 100) {
        return { text: text.trim(), platform: 'linkedin', product: product.id }
      }
      return fallback
    } catch {
      return fallback
    }
  }

  // ── Blog outline
  async generateBlogOutline(product, angle) {
    const prompt = `Create a brief SEO blog outline for Indian freelancers.
Topic: "${angle}" related to ${product.name}
Return JSON: {"title":"","primaryKeyword":"","sections":[{"h2":"","points":[""]}]}`
    try {
      const res = await this.orchestrator.callAI(prompt)
      return this.orchestrator.parseJSON(res)
    } catch { return null }
  }

  async generateHuggingFaceImage(prompt) {
    // Try Replicate first
    try {
      const replicateResult = await this.generateReplicateImage(prompt)
      if (replicateResult) return replicateResult
    } catch (err) {
      console.log('Replicate failed, trying free alternative:', err.message)
    }

    // Fallback to free Unsplash API
    return this.generateUnsplashImage(prompt)
  }

  async generateReplicateImage(prompt) {
    const apiToken = process.env.REPLICATE_API_TOKEN
    if (!apiToken) return null

    const model = process.env.REPLICATE_MODEL || 'stability-ai/stable-diffusion:db21e45d3f7023abc2a46ee38a23973f6dce16bb082a930b0c49861f96d1e5bf'
    const [modelName, version] = model.split(':')

    const body = JSON.stringify({
      version: version,
      input: {
        prompt: prompt,
        width: 512,
        height: 512,
        num_inference_steps: 20,
        guidance_scale: 7.5
      }
    })

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.replicate.com',
        path: '/v1/predictions',
        method: 'POST',
        headers: {
          Authorization: `Token ${apiToken}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: 120000,
      }, (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          const buffer = Buffer.concat(chunks)
          const contentType = res.headers['content-type'] || ''

          if (contentType.includes('application/json')) {
            try {
              const json = JSON.parse(buffer.toString('utf8'))
              if (json.error) {
                return reject(new Error(json.error))
              }
              if (json.id) {
                this.pollReplicatePrediction(json.id, apiToken).then(resolve).catch(reject)
              } else {
                reject(new Error('No prediction ID received from Replicate'))
              }
            } catch {
              return reject(new Error('Unexpected Replicate JSON response'))
            }
          } else {
            reject(new Error(`Unexpected Replicate response content-type: ${contentType}`))
          }
        })
      })

      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('Replicate request timed out')) })
      req.write(body)
      req.end()
    })
  }

  async generateUnsplashImage(prompt) {
    // Use Lorem Picsum for free placeholder images (no API key required)
    try {
      // Generate a random image based on prompt hash for consistency
      const hash = require('crypto').createHash('md5').update(prompt).digest('hex')
      const seed = parseInt(hash.substring(0, 8), 16) % 1000

      const imageUrl = `https://picsum.photos/800/600?random=${seed}`

      // Download the image
      const imageResponse = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 15000
      })

      const base64 = Buffer.from(imageResponse.data).toString('base64')
      const contentType = imageResponse.headers['content-type'] || 'image/jpeg'

      return `data:${contentType};base64,${base64}`
    } catch (err) {
      console.log('Lorem Picsum fallback failed:', err.message)
    }

    // Ultimate fallback - return null so it posts text only
    return null
  }

  async pollReplicatePrediction(predictionId, apiToken) {
    return new Promise((resolve, reject) => {
      const poll = () => {
        const req = https.request({
          hostname: 'api.replicate.com',
          path: `/v1/predictions/${predictionId}`,
          method: 'GET',
          headers: {
            Authorization: `Token ${apiToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000,
        }, (res) => {
          const chunks = []
          res.on('data', (chunk) => chunks.push(chunk))
          res.on('end', () => {
            try {
              const json = JSON.parse(Buffer.concat(chunks).toString('utf8'))
              if (json.status === 'succeeded' && json.output) {
                // Replicate returns an array of URLs, get the first one
                const imageUrl = Array.isArray(json.output) ? json.output[0] : json.output
                this.downloadImageFromUrl(imageUrl).then(resolve).catch(reject)
              } else if (json.status === 'failed') {
                reject(new Error(json.error || 'Replicate prediction failed'))
              } else if (json.status === 'processing' || json.status === 'starting') {
                setTimeout(poll, 2000) // Poll again in 2 seconds
              } else {
                reject(new Error(`Unexpected prediction status: ${json.status}`))
              }
            } catch (err) {
              reject(err)
            }
          })
        })

        req.on('error', reject)
        req.on('timeout', () => { req.destroy(); reject(new Error('Replicate poll timed out')) })
        req.end()
      }

      poll()
    })
  }

  async downloadImageFromUrl(url) {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          const buffer = Buffer.concat(chunks)
          const contentType = res.headers['content-type'] || 'image/png'
          resolve(`data:${contentType};base64,${buffer.toString('base64')}`)
        })
      }).on('error', reject)
    })
  }

  // ── Ad copy
  async generateAdCopy(product, platform = 'reddit') {
    const prompt = `Write ad copy for ${platform} promoting ${product.name || 'Toolify AI'} (${product.price || '₹749'}) to Indian users.
Return JSON: {"headline":"","primaryText":"","cta":"Try Free","abVariants":[{"headline":"","primaryText":""}]}`
    try {
      const res = await this.orchestrator.callAI(prompt)
      return this.orchestrator.parseJSON(res)
    } catch { return null }
  }

  // ── Reply to comment/mention
  async generateReply(context) {
    const prompt = `Write a genuine helpful reply to this ${context.platform} comment:
"${context.text}"
Rules: Be human, max 2-3 sentences, never use "absolutely" or "certainly".
Return just the reply text.`
    try {
      const text = await this.orchestrator.callAI(prompt)
      return text?.trim() || 'Thanks for sharing! Happy to help if you have any questions.'
    } catch {
      return 'Thanks for sharing! Feel free to reach out if you need help.'
    }
  }

  // ── New product launch content
  async launchNewProduct({ niche } = {}) {
    if (!niche) return
    this.orchestrator.broadcast({ type: 'task', message: `[CONTENT] Creating launch content for: ${niche.suggestedProduct}`, level: 'info' })
    const prod = {
      id: 'new', name: niche.suggestedProduct, price: niche.suggestedPrice,
      pain: niche.pain, target: niche.targetSub, sub: niche.targetSub, url: 'https://toolifyai.com'
    }
    const [reddit, twitter, linkedin] = await Promise.allSettled([
      this.generateRedditPost(prod, 'new launch announcement', {}),
      this.generateTwitterThread(prod, 'why I built this'),
      this.generateLinkedInPost(prod, 'new product launch'),
    ])
    return { reddit: reddit.value, twitter: twitter.value, linkedin: linkedin.value }
  }

  pickContentAngle(research, topic) {
    if (topic?.trim()) return topic.trim()
    const angles = Array.isArray(research?.contentAngles) ? research.contentAngles.filter(Boolean) : []
    const topics = Array.isArray(research?.topTopics) ? research.topTopics.filter(Boolean) : []
    if (angles.length) return angles[Math.floor(Math.random() * angles.length)]
    if (topics.length) return topics[Math.floor(Math.random() * topics.length)]
    return 'saving time on client communication'
  }

  selectProduct(decision) {
    if (decision?.focus) {
      const found = PRODUCTS.find(p => p.id === decision.focus)
      if (found) return found
    }
    return PRODUCTS[new Date().getDate() % PRODUCTS.length]
  }
}

module.exports = ContentAgent
