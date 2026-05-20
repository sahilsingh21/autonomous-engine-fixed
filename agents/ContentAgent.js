/**
 * CONTENT AGENT — TOOLIFY AI v2.4
 * Fixed:
 *  1. Research data (trending titles, HN stories, pain points, urgentOpportunity) fully injected into every AI prompt
 *  2. Hashtags pulled from research.suggestedHashtags + smart platform-specific tag sets
 *  3. LinkedIn post uses real trending context — not generic angles
 *  4. Twitter thread hooks on actual HN/Reddit trending topics
 *  5. Reddit post targets the exact subreddit + pain point the research found today
 *  6. Fallbacks still work if AI is down
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

// ── Platform-specific hashtag pools (research picks from these)
const HASHTAG_POOLS = {
  linkedin: {
    core:      ['#ToolifyAI', '#BuildingInPublic', '#SaaSIndia'],
    reach:     ['#AI', '#ArtificialIntelligence', '#MachineLearning', '#Automation', '#ProductivityHacks'],
    audience:  ['#FreelanceIndia', '#IndianStartup', '#IndieHacker', '#Founders', '#StartupLife'],
    vertical:  ['#Ecommerce', '#OnlineSelling', '#LegalTech', '#EmailProductivity', '#WorkSmarter'],
    trending:  ['#FutureOfWork', '#AITools', '#SaaS', '#DigitalIndia', '#TechIndia'],
  },
  twitter: {
    core:      ['#ToolifyAI', '#BuildingInPublic'],
    reach:     ['#AI', '#IndieHacker', '#SaaS', '#Automation'],
    audience:  ['#FreelanceIndia', '#IndianStartup', '#StartupLife'],
    vertical:  ['#ProductBuilding', '#AITools', '#MicroSaaS'],
  },
  reddit: [], // Reddit doesn't use hashtags
}

// ── Hardcoded fallback content — used only when AI is completely unavailable
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

#ToolifyAI #BuildingInPublic #FreelanceIndia #AI #IndianStartup`,

  `The honest truth about building a SaaS in India in 2026:

The hardest part isn't building — it's getting the first 10 paying users.

What I'm doing with Toolify AI:
→ Autonomous engine posts content daily on LinkedIn + Reddit + Twitter
→ AI agents research trending topics and adjust messaging in real-time
→ Razorpay handles payments (UPI, cards, net banking)
→ Ollama runs all AI locally — ₹0 API cost

Products: ReplyDraft AI, ListingLift AI, PolicyPal AI

Still at ₹0 MRR. But the machine is running. Building in public until it works.

#IndieHacker #SaaSIndia #ToolifyAI #BuildingInPublic #Founders`,

  `Freelancers — quick question:

How much time do you spend every week writing professional emails and replies to clients?

Most people say 3-5 hours per week. That's nearly a full day every month just on email copy.

I built ReplyDraft AI to fix this:
→ Paste the email you received
→ Pick your tone (professional, friendly, firm)
→ Get a ready-to-send reply in 10 seconds

₹750/month. Free trial available.

Link in comments if you want to try it.

#Freelance #Productivity #ToolifyAI #FreelanceIndia #EmailProductivity`,
]

const FALLBACK_TWEETS = [
  [
    'Built an autonomous AI company that runs itself 24/7 🤖\n\nNo employees. No manual work. Just 5 AI agents.\n\nHere\'s how it works 👇',
    '① Research Agent scans Reddit + HN daily for trending topics\nFinds pain points real people are complaining about',
    '② Content Agent writes posts for LinkedIn, Reddit, and Twitter\nUsing Ollama locally — ₹0 AI cost per post',
    '③ Publisher Agent posts automatically\nLinkedIn ✓ | Reddit ✓ | Twitter ✓',
    '④ Finance Agent tracks Razorpay payments\nAuto-kills products with 0 revenue after 3 days',
    '⑤ Optimizer Agent runs A/B tests on pricing and headlines',
    '3 products live:\n✍️ ReplyDraft AI (₹750/mo)\n🛒 ListingLift AI (₹249)\n🔍 PolicyPal AI (₹399)\n\nAll for Indian freelancers and sellers.',
    'Still at ₹0 MRR. But the machine is running.\n\nBuilding in public → toolifyai.com\n\n#ToolifyAI #BuildingInPublic #IndieHacker #AI #SaaS',
  ],
  [
    'Running Ollama locally changed everything for my SaaS 🔥\n\nHere\'s what changed 👇',
    'Before: Paying $50-100/month for OpenAI API\nConversion rate anxiety: every AI call costs money',
    'After: Ollama on local machine\nAPI cost: ₹0\nSpeed: fast\nPrivacy: data never leaves device',
    'The margin math:\nReplyDraft AI: ₹750/user/mo\nOllama cost: ₹0\nRazorpay fee: ~₹22\nNet profit: ₹728 per user',
    'That\'s 97%+ margin before any fixed costs.\n\nBuilding Toolify AI on this stack.',
    '3 tools live: ReplyDraft, ListingLift, PolicyPal\nAll running on Ollama locally\n\nLink in bio → #ToolifyAI #Ollama #IndieHacker #AI #MicroSaaS',
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

**Key differences per platform:**
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
    console.log('  ✓ ContentAgent ready — research-driven content with smart hashtags')
  }

  // ── DAILY: generate full content batch
  async generateDailyContent({ research, decision, topic, imagePrompt } = {}) {
    this.orchestrator.broadcast({ type: 'task', message: '[CONTENT] Generating daily content batch...', level: 'info' })
    this.orchestrator.broadcast({ type: 'task', message: `[CONTENT] Params: topic=${topic}, imagePrompt=${imagePrompt?.slice(0,50)}`, level: 'info' })
    this.postCount++

    if (!research) {
      research = await this.orchestrator.runTask('research', 'trendResearch', { silent: true }) || {}
    }

    const product         = this.selectProduct(decision)
    const angle           = this.pickContentAngle(research, topic, product.id)
    const richAngle       = this.pickRichAngle(research, product.id)
    const hashtags        = this.buildHashtags(research, product)
    const imagePromptText = imagePrompt?.trim() || `A high quality social media marketing image for ${product.name} about ${angle}. Bright, modern, minimal, professional style with an Indian startup founder vibe.`
    const image           = await this.generateHuggingFaceImage(imagePromptText).catch(() => null)

    // Run all in parallel — each has its own fallback
    const [reddit, twitter, linkedin, blog] = await Promise.allSettled([
      this.generateRedditPost(product, angle, research, richAngle),
      this.generateTwitterThread(product, angle, research, hashtags.twitter, richAngle),
      this.generateLinkedInPost(product, angle, research, hashtags.linkedin, richAngle),
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
      hashtags,
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
      message: `[CONTENT] ✓ Generated ${count} content pieces for ${product.name} | Angle: "${angle}" | Tags: ${hashtags.linkedin.slice(0,3).join(' ')}`,
      level: 'success'
    })

    return batch
  }

  // ── LinkedIn post — FULLY uses research data
  async generateLinkedInPost(product, angle, research, hashtagsArr, richAngle) {
    const fallback = {
      text: FALLBACK_LINKEDIN[Math.floor(Math.random() * FALLBACK_LINKEDIN.length)],
      platform: 'linkedin',
      product: product.id
    }

    const hashtagLine = (hashtagsArr || []).join(' ')

    // Build the richest possible context block from research
    const trendingTitles = (research?.reddit || []).slice(0, 5).map(r => `• [r/${r.sub}] "${r.title}" (${r.score} upvotes)`).filter(Boolean)
    const hnTitles       = (research?.hackerNews || []).slice(0, 3).map(h => `• "${h.title}" (${h.score} pts)`).filter(Boolean)
    const urgentOpp      = research?.urgentOpportunity || ''

    // Rich angle from synthesis — has hook, insight, and the specific Reddit post that inspired it
    const hook      = richAngle?.hook    || ''
    const insight   = richAngle?.insight || ''
    const sourcePost = richAngle?.redditPost || ''

    const researchBlock = [
      trendingTitles.length ? `WHAT'S TRENDING ON REDDIT RIGHT NOW:\n${trendingTitles.join('\n')}` : '',
      hnTitles.length       ? `HACKER NEWS TODAY:\n${hnTitles.join('\n')}` : '',
      urgentOpp             ? `TODAY'S OPPORTUNITY: ${urgentOpp}` : '',
      hook                  ? `SUGGESTED HOOK (use or riff on this): ${hook}` : '',
      insight               ? `KEY INSIGHT TO BUILD ON: ${insight}` : '',
      sourcePost            ? `REDDIT POST THAT INSPIRED THIS: "${sourcePost}"` : '',
    ].filter(Boolean).join('\n\n')

    this.orchestrator.broadcast({
      type: 'task',
      message: `[CONTENT] LinkedIn research context: ${researchBlock.length} chars | Hook: "${hook.slice(0,60)}"`,
      level: 'info'
    })

    const prompt = `You are Sahil Singh, founder of Toolify AI (India), writing a LinkedIn post for today.

YOUR RESEARCH FOR TODAY — USE THIS, DO NOT IGNORE IT:
${researchBlock || 'No live data — write a strong original post based on the product below.'}

Product: ${product.name} — ${product.pain}
Audience: ${product.target}
Angle: ${angle}

WRITE THE POST NOW. RULES:
1. START with the suggested hook above (or your own version of it) — it must reference something SPECIFIC from the research
2. Build a short story or insight (2-3 sentences) using the KEY INSIGHT above
3. Give 3 concrete, specific takeaways — use real numbers, real platform names, real examples
4. Mention ${product.name} in 1 sentence naturally — not as a pitch
5. End with a question or observation that invites replies
6. Last line: ONLY these hashtags, nothing else: ${hashtagLine}
7. Total length: 180-250 words
8. PLAIN TEXT ONLY — no asterisks, no markdown, no dashes as bullets
9. Use → or numbers for lists
10. Never say: "game-changer", "leverage", "unlock", "are you tired of", "transform", "dive into"

Output the post text only. No preamble, no explanation.`

    try {
      const text = await this.orchestrator.callAI(prompt)
      if (text && text.trim().length > 100) {
        return { text: this.sanitizeForLinkedIn(text.trim()), platform: 'linkedin', product: product.id }
      }
      return fallback
    } catch {
      return fallback
    }
  }

  // ── Twitter thread — uses research for hook
  async generateTwitterThread(product, angle, research, hashtagsArr, richAngle) {
    const fallback = FALLBACK_TWEETS[this.postCount % FALLBACK_TWEETS.length]

    const trendingTitles = (research?.reddit || []).slice(0, 4).map(r => `[r/${r.sub}] "${r.title}" (${r.score} upvotes)`).filter(Boolean)
    const hnTitles       = (research?.hackerNews || []).slice(0, 2).map(h => `"${h.title}" (${h.score} pts)`).filter(Boolean)
    const urgentOpp      = research?.urgentOpportunity || ''
    const hashtagLine    = (hashtagsArr || []).join(' ')
    const hook           = richAngle?.hook    || ''
    const insight        = richAngle?.insight || ''
    const sourcePost     = richAngle?.redditPost || ''

    const researchContext = [
      trendingTitles.length ? `Reddit trending:\n${trendingTitles.join('\n')}` : '',
      hnTitles.length       ? `HN trending:\n${hnTitles.join('\n')}` : '',
      urgentOpp             ? `Today's opportunity: ${urgentOpp}` : '',
      hook                  ? `Suggested hook: ${hook}` : '',
      insight               ? `Key insight: ${insight}` : '',
      sourcePost            ? `Inspired by: "${sourcePost}"` : '',
    ].filter(Boolean).join('\n\n')

    const prompt = `Write a Twitter/X thread (7 tweets) as Sahil Singh, founder of Toolify AI India.

TODAY'S LIVE RESEARCH — BUILD THE THREAD AROUND THIS:
${researchContext || 'No live research — write a strong original thread.'}

Angle: "${angle}"
Product: ${product.name} — ${product.pain}
Audience: ${product.target}

RULES:
- Tweet 1: Use the suggested hook or your own version — must reference a SPECIFIC pain or stat from the research. Under 250 chars.
- Tweets 2-5: Each tweet = one concrete, specific insight. Use real numbers, platform names, or relatable situations. Reference the research. Under 270 chars each.
- Tweet 6: 1-2 sentences on how you built ${product.name} to solve this exact problem
- Tweet 7: Soft CTA + end with: ${hashtagLine}
- Never repeat the same idea twice
- Sound like a real founder, not a content creator
- NEVER use **bold** or *italic* — shows as literal asterisks on Twitter
- Use plain text, emoji, or ALL CAPS for emphasis

Return a JSON array of 7 strings only: ["tweet1","tweet2","tweet3","tweet4","tweet5","tweet6","tweet7"]`

    try {
      const res    = await this.orchestrator.callAI(prompt)
      const parsed = this.orchestrator.parseJSON(res)
      if (Array.isArray(parsed) && parsed.length >= 4) return parsed
      return fallback
    } catch {
      return fallback
    }
  }

  // ── Reddit post — targets the exact subreddit + pain the research found
  async generateRedditPost(product, angle, research, richAngle) {
    const fallback = FALLBACK_REDDIT[product.id] || FALLBACK_REDDIT.replydraft

    // Use research-recommended subreddit if available
    const sub          = research?.redditSubsToPost?.[0] || product.sub
    const trendingInSub = (research?.reddit || [])
      .filter(r => r.sub === sub)
      .slice(0, 4)
      .map(r => `• "${r.title}" (${r.score} upvotes)`)
      .filter(Boolean)
    const allSubPosts   = (research?.reddit || [])
      .slice(0, 6)
      .map(r => `• [r/${r.sub}] "${r.title}" (${r.score} upvotes)`)
      .filter(Boolean)
    const urgentOpp     = research?.urgentOpportunity || ''
    const hook          = richAngle?.hook    || ''
    const insight       = richAngle?.insight || ''
    const sourcePost    = richAngle?.redditPost || ''

    const researchContext = [
      trendingInSub.length ? `Trending in r/${sub} right now:\n${trendingInSub.join('\n')}` : '',
      allSubPosts.length && !trendingInSub.length ? `Trending across related subs:\n${allSubPosts.join('\n')}` : '',
      urgentOpp   ? `Opportunity: ${urgentOpp}` : '',
      insight     ? `Key insight to build on: ${insight}` : '',
      sourcePost  ? `Inspired by this real post: "${sourcePost}"` : '',
    ].filter(Boolean).join('\n\n')

    const prompt = `Write a Reddit post for r/${sub} that provides GENUINE VALUE and fits the community naturally.

TODAY'S LIVE CONTEXT — USE THIS TO MAKE IT FEEL TIMELY AND REAL:
${researchContext || 'No live data — write a helpful, specific post based on common community pain points.'}

Product: ${product.name} solves: ${product.pain} for ${product.target}
Angle: ${angle}

RULES:
- Title: specific, curiosity-driven, or relatable — NOT a headline, under 100 chars
- Body: write as a real community member, NOT a marketer
- If there is a "Inspired by this real post" above — write a post that RESPONDS TO THAT TOPIC from your own experience
- Use the KEY INSIGHT as your personal story/experience in the body
- Include 3-5 concrete, actionable tips — use real specifics, not generic advice
- Mention ${product.name} ONLY as a one-line PS at the very end
- Min 200 words body
- Use Reddit markdown: **bold** for key terms, numbered lists, paragraph breaks

Return JSON ONLY:
{"title":"","body":"","subreddit":"${sub}","mentionProduct":true,"productMentionText":"PS: Built ${product.name} for this — ${product.url}"}`

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

  // ── Build smart, research-driven hashtags for each platform
  buildHashtags(research, product) {
    const researchTags = (research?.suggestedHashtags || [])
      .map(t => t.startsWith('#') ? t : `#${t}`)
      .filter(Boolean)
      .slice(0, 3)

    // LinkedIn: 5-8 tags — mix core + audience + reach + any research tags
    const linkedinBase = [
      ...HASHTAG_POOLS.linkedin.core.slice(0, 2),
      ...this._pickRandom(HASHTAG_POOLS.linkedin.audience, 2),
      ...this._pickRandom(HASHTAG_POOLS.linkedin.reach, 2),
      ...this._pickRandom(HASHTAG_POOLS.linkedin.trending, 1),
    ]
    const linkedinTags = this._dedupe([...linkedinBase, ...researchTags]).slice(0, 8)

    // Twitter: 3-5 tags — punchy and discoverable
    const twitterBase = [
      ...HASHTAG_POOLS.twitter.core.slice(0, 2),
      ...this._pickRandom(HASHTAG_POOLS.twitter.reach, 2),
      ...this._pickRandom(HASHTAG_POOLS.twitter.audience, 1),
    ]
    const twitterTags = this._dedupe([...twitterBase, ...researchTags.slice(0, 1)]).slice(0, 5)

    return { linkedin: linkedinTags, twitter: twitterTags }
  }

  _pickRandom(arr, n) {
    if (!arr || !arr.length) return []
    const shuffled = [...arr].sort(() => 0.5 - Math.random())
    return shuffled.slice(0, n)
  }

  _dedupe(arr) {
    const seen = new Set()
    return arr.filter(t => { const k = t.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true })
  }

  // ── Image generation
  async generateHuggingFaceImage(prompt) {
    try {
      const replicateResult = await this.generateReplicateImage(prompt)
      if (replicateResult) return replicateResult
    } catch (err) {
      console.log('Replicate failed, trying free alternative:', err.message)
    }
    return this.generateUnsplashImage(prompt)
  }

  async generateReplicateImage(prompt) {
    const apiToken = process.env.REPLICATE_API_TOKEN
    if (!apiToken) return null

    const model   = process.env.REPLICATE_MODEL || 'stability-ai/stable-diffusion:db21e45d3f7023abc2a46ee38a23973f6dce16bb082a930b0c49861f96d1e5bf'
    const [, version] = model.split(':')

    const body = JSON.stringify({
      version,
      input: { prompt, width: 512, height: 512, num_inference_steps: 20, guidance_scale: 7.5 }
    })

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.replicate.com',
        path: '/v1/predictions',
        method: 'POST',
        headers: { Authorization: `Token ${apiToken}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 120000,
      }, (res) => {
        const chunks = []
        res.on('data', c => chunks.push(c))
        res.on('end', () => {
          const buf = Buffer.concat(chunks)
          const ct  = res.headers['content-type'] || ''
          if (ct.includes('application/json')) {
            try {
              const json = JSON.parse(buf.toString('utf8'))
              if (json.error) return reject(new Error(json.error))
              if (json.id) this.pollReplicatePrediction(json.id, apiToken).then(resolve).catch(reject)
              else reject(new Error('No prediction ID from Replicate'))
            } catch { reject(new Error('Unexpected Replicate JSON')) }
          } else {
            reject(new Error(`Unexpected Replicate response: ${ct}`))
          }
        })
      })
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('Replicate timeout')) })
      req.write(body)
      req.end()
    })
  }

  async generateUnsplashImage(prompt) {
    try {
      const hash  = require('crypto').createHash('md5').update(prompt).digest('hex')
      const seed  = parseInt(hash.substring(0, 8), 16) % 1000
      const resp  = await axios.get(`https://picsum.photos/800/600?random=${seed}`, { responseType: 'arraybuffer', timeout: 15000 })
      const base64 = Buffer.from(resp.data).toString('base64')
      const ct     = resp.headers['content-type'] || 'image/jpeg'
      return `data:${ct};base64,${base64}`
    } catch (err) {
      console.log('Lorem Picsum fallback failed:', err.message)
    }
    return null
  }

  async pollReplicatePrediction(predictionId, apiToken) {
    return new Promise((resolve, reject) => {
      const poll = () => {
        const req = https.request({
          hostname: 'api.replicate.com',
          path: `/v1/predictions/${predictionId}`,
          method: 'GET',
          headers: { Authorization: `Token ${apiToken}`, 'Content-Type': 'application/json' },
          timeout: 30000,
        }, (res) => {
          const chunks = []
          res.on('data', c => chunks.push(c))
          res.on('end', () => {
            try {
              const json = JSON.parse(Buffer.concat(chunks).toString('utf8'))
              if (json.status === 'succeeded' && json.output) {
                const url = Array.isArray(json.output) ? json.output[0] : json.output
                this.downloadImageFromUrl(url).then(resolve).catch(reject)
              } else if (json.status === 'failed') {
                reject(new Error(json.error || 'Replicate prediction failed'))
              } else if (json.status === 'processing' || json.status === 'starting') {
                setTimeout(poll, 2000)
              } else {
                reject(new Error(`Unexpected prediction status: ${json.status}`))
              }
            } catch (err) { reject(err) }
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
        res.on('data', c => chunks.push(c))
        res.on('end', () => {
          const buf = Buffer.concat(chunks)
          const ct  = res.headers['content-type'] || 'image/png'
          resolve(`data:${ct};base64,${buf.toString('base64')}`)
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
    const hashtags = this.buildHashtags({}, prod)
    const [reddit, twitter, linkedin] = await Promise.allSettled([
      this.generateRedditPost(prod, 'new launch announcement', {}),
      this.generateTwitterThread(prod, 'why I built this', {}, hashtags.twitter),
      this.generateLinkedInPost(prod, 'new product launch', {}, hashtags.linkedin),
    ])
    return { reddit: reddit.value, twitter: twitter.value, linkedin: linkedin.value }
  }

  pickContentAngle(research, topic, productId) {
    if (Array.isArray(topic) && topic.length) {
      return topic.map(t => String(t).trim()).filter(Boolean).join(' | ')
    }
    if (typeof topic === 'string' && topic.trim()) return topic.trim()

    // Use rich contentAngles if available (new format with hooks + insights)
    const richAngles = Array.isArray(research?.contentAngles) ? research.contentAngles : []
    if (richAngles.length) {
      // Try to find the angle matching the current product
      const match = richAngles.find(a => a?.product === productId)
      const chosen = match || richAngles[Math.floor(Math.random() * richAngles.length)]
      // Return the angle string (old format) OR the angle field (new format)
      return typeof chosen === 'string' ? chosen : (chosen?.angle || chosen?.hook || 'saving time on client communication')
    }

    const topics = Array.isArray(research?.topTopics) ? research.topTopics.filter(Boolean) : []
    if (topics.length) return topics[Math.floor(Math.random() * topics.length)]
    return 'saving time on client communication'
  }

  // Pull the full rich insight object for a product from research
  pickRichAngle(research, productId) {
    const richAngles = Array.isArray(research?.contentAngles) ? research.contentAngles : []
    if (!richAngles.length || typeof richAngles[0] === 'string') return null
    return richAngles.find(a => a?.product === productId) || richAngles[0] || null
  }

  selectProduct(decision) {
    if (decision?.focus) {
      const found = PRODUCTS.find(p => p.id === decision.focus)
      if (found) return found
    }
    return PRODUCTS[new Date().getDate() % PRODUCTS.length]
  }

  // ── Sanitize text for platforms that don't render markdown
  sanitizeForLinkedIn(text) {
    if (!text) return text
    return text
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^- /gm, '→ ')
      .trim()
  }
}

module.exports = ContentAgent
