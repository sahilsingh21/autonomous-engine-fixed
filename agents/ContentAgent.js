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
    url:    process.env.REPLYDRAFT_URL || 'https://toolify.sahilsingh.co.in/replydraft',
    pain:   'writing professional replies to client emails and LinkedIn messages',
    target: 'freelancers, consultants, VAs, and remote workers in India',
    sub:    'freelance',
  },
  {
    id: 'listinglift', name: 'ListingLift AI', price: '₹249/batch',
    url:    process.env.LISTINGLIFT_URL || 'https://toolify.sahilsingh.co.in/listinglift',
    pain:   'writing product listings for Amazon, Flipkart, Etsy, Shopify',
    target: 'online sellers, Etsy shop owners, D2C brands in India',
    sub:    'Etsy',
  },
  {
    id: 'policypal', name: 'PolicyPal AI', price: '₹399/doc',
    url:    process.env.POLICYPAL_URL || 'https://toolify.sahilsingh.co.in/policypal',
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
// Fallback posts — used ONLY when AI is completely unavailable
// Written as genuine information posts, NOT product pitches
// Rotated by day so the same post never appears twice in a row

const FALLBACK_LINKEDIN = [

  // Topic: The real cost of writing client emails
  `Most freelancers track billable hours. Almost nobody tracks email hours.

I started timing myself last month. Here is what I found:

2.5 hours every week on client emails alone — follow-ups, project updates, revision requests, payment reminders. None of it billable. All of it mentally draining.

The compounding effect is brutal. Over a year that is 130 hours — more than 3 full work weeks — spent on writing emails that clients read in 10 seconds.

The shift that helped: writing templates for the 10 email situations that repeat every month. Scope change requests. Timeline delays. Payment reminders. Positive project updates.

Once you have a template for each, you stop writing from scratch. You edit instead. Editing is 5x faster than writing.

What is the email situation that costs you the most time every week?

#FreelanceIndia #Productivity #ClientManagement #Freelance #IndianFreelancer`,

  // Topic: Why Indian online sellers fail on Etsy but succeed on Amazon
  `Selling on Etsy vs Amazon is not just a platform difference. It is a completely different buyer psychology.

Amazon buyers are in solve mode. They know what they want. They search, compare specs, check reviews, buy. Your listing needs a keyword-rich title and bullet points that answer objections.

Etsy buyers are in discover mode. They are browsing. They want to feel something about a product before buying. Your listing needs a story — who made this, why, what makes it special.

The mistake most Indian sellers make: they write one description and copy-paste it across both platforms. Amazon listings that read like Amazon listings get buried on Etsy. Etsy listings that feel handcrafted and personal do not convert on Amazon.

Platform-specific copy is not optional. It is the difference between being visible and being invisible.

The same product, two completely different stories — both true, just told differently for different buyers.

#EcommercIndia #Etsy #AmazonSeller #OnlineSelling #D2CIndia`,

  // Topic: Terms of Service — what most people never check
  `Most people click "I agree" without reading a single line of the Terms of Service.

I was the same. Until I found this clause buried in page 22 of a popular design tool I was using for client work:

"You grant us a worldwide, non-exclusive, royalty-free license to use, reproduce, and distribute content you submit through the service."

That means client work I processed through their platform — they had a license to it.

I am not a lawyer. But I do think everyone should know these three things before accepting any ToS:

1. Who owns content you create or upload through the platform
2. What happens to your data if you cancel the subscription
3. Whether they can share or sell your usage data to third parties

None of this takes a law degree. You just need to know which three sections to read. Everything else is usually standard.

Worth 5 minutes before signing up for any tool you use for paid client work.

#SmallBusiness #FreelanceIndia #LegalTips #SaaSTools #DataPrivacy`,

  // Topic: Why first-time founders underestimate distribution
  `A product nobody finds is not a product. It is a hobby.

Most first-time founders — including me — spend 80% of time building and 20% on distribution. The ratio that actually works is closer to the opposite.

Here is the uncomfortable reality:

A mediocre product with great distribution beats a great product with no distribution. Every time. Without exception.

What distribution actually means in practice:
1. Showing up consistently in places where your audience already spends time
2. Being useful before you ask for anything in return
3. Saying the same thing in enough different ways that it finally lands for someone

The founders who get their first 10 customers are not the ones who built the best product. They are the ones who told the most people about a good enough product.

What is your current distribution channel that is actually working?

#IndianStartup #Founders #SaaSIndia #ProductBuilding #GrowthStrategy`,

  // Topic: How AI tools actually save time (vs the hype)
  `The AI productivity hype is mostly noise. But buried in the noise are 3 or 4 genuinely useful workflows.

Here is what actually saves time in my experience:

WORKS: First drafts of structured documents. Contracts, proposals, email templates, listing descriptions. AI gets you to 70% in seconds. You edit to 100%.

WORKS: Summarising long documents. Terms of Service, meeting transcripts, competitor blog posts. Paste → plain English summary → done.

WORKS: Generating variations. Need 5 subject lines for the same email? 3 ways to phrase a price increase? AI handles this faster than any human.

DOES NOT WORK: Open-ended creative work. Strategy. Anything requiring real context about your specific situation.

The pattern: AI is fast at structure, slow at nuance. Use it where structure matters and speed is the constraint.

What is the one AI workflow that actually made a real difference for you?

#AITools #Productivity #IndianStartup #WorkSmart #FutureOfWork`,
]

const FALLBACK_TWEETS = [
  [
    `Freelancers underestimate how much time email actually costs them.

I tracked mine for a month. Here's what I found 👇`,
    `Week 1: 2.5 hours on client emails
Week 2: 3.1 hours
Week 3: 2.8 hours
Week 4: 2.6 hours

Average: ~11 hours/month. None of it billable.`,
    `The emails that take longest:
→ Explaining a scope change diplomatically
→ Following up on late payments without being rude
→ Declining a client request without losing the relationship`,
    `What actually helped: writing a template for the 10 email situations that repeat every month.

Editing a template takes 90 seconds. Writing from scratch takes 15 minutes.`,
    `The deeper issue: email is a context switch. Every time you stop to write a client email you lose 20 min of flow on actual work.

Batching email to twice a day helps more than any other change.`,
    `None of this is magic. It is just treating email as a system instead of an inbox to react to.`,
    `If you track your own email time this week you will probably be surprised.

The number is always higher than people think.

#FreelanceIndia #Productivity #ClientManagement #Freelance #TimeManagement`,
  ],
  [
    `Indian sellers on Etsy vs Amazon are playing two completely different games.

Most people treat them the same. Here's why that is a mistake 👇`,
    `Amazon buyer mindset: I need X. Show me the best X at the best price.

They search a keyword, scan titles and bullet points, check reviews, buy.

Your listing needs to WIN the search. Keywords first.`,
    `Etsy buyer mindset: I am browsing. Show me something that makes me feel something.

They scroll, stop at visuals, read the story, buy if it connects.

Your listing needs to tell a story. Emotion first.`,
    `The same handmade leather wallet.

Amazon listing: "Genuine leather bifold wallet, RFID blocking, 6 card slots, brown, men"

Etsy listing: "Hand-stitched full grain leather wallet — made one at a time in a small workshop in Jaipur"

Both accurate. Completely different psychology.`,
    `Most Indian sellers copy-paste the same description across platforms.

Result: mediocre performance everywhere instead of strong performance on one.`,
    `Pick one platform, write for its buyer, win there first.

Then adapt for the second platform. Then the third.

Never the same copy across all three.`,
    `What platform is actually driving the most sales for you right now?

#Ecommerce #Etsy #AmazonIndia #OnlineSelling #D2CIndia #IndianSellers`,
  ],
  [
    `The ToS clause almost every freelancer misses — and why it matters 👇`,
    `Most SaaS tools you use for client work have a clause like this buried in their Terms:

"You grant us a non-exclusive license to use content submitted through the service"

That includes your client work.`,
    `I am not a lawyer. But I do think this is worth knowing.

Three things worth checking before agreeing to any ToS:

1. Who owns content you process through the platform`,
    `2. What happens to your data after you cancel

Some tools keep it for 30 days. Some keep it indefinitely. Some delete it immediately.

Matters more than most people realise.`,
    `3. Whether they share usage data with third parties

"Anonymised and aggregated" usually means your data is included.

"We do not sell personal data" does not mean they do not share it.`,
    `None of this requires a law degree.

You just need to know which 3 pages in a 30-page document to actually read.`,
    `Worth 5 minutes before signing up for any tool you use for paid client work.

#SmallBusiness #FreelanceIndia #DataPrivacy #LegalTips #SaaSTools`,
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
    productMentionText: 'PS: The tool I mentioned is ReplyDraft AI — free trial available at toolify.sahilsingh.co.in',
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
    productMentionText: 'PS: I use ListingLift AI for this — toolify.sahilsingh.co.in',
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
    productMentionText: 'PS: I use PolicyPal AI for ToS summaries — toolify.sahilsingh.co.in',
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
10. BANNED words and phrases — never use any of these:
    "game-changer", "leverage", "unlock", "are you tired of", "transform", "dive into",
    "supercharge", "revolutionize", "empower", "in today's fast-paced world", "the future is here"

11. BANNED formats — never write the post as:
    → A product spec sheet listing features with arrows
    → A "What I'm doing with [product]:" bullet list
    → A list of product names + prices + one-liners
    → Anything structured like: "Product X → does Y (₹price)"
    The post must read as a story, observation, or insight — not a brochure

12. The product mention (if any) should be ONE natural sentence woven into the post
    — not a section at the end that lists all products

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
      pain: niche.pain, target: niche.targetSub, sub: niche.targetSub, url: 'https://toolify.sahilsingh.co.in'
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
