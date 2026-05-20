/**
 * TOOLIFY AI — AUTONOMOUS ENGINE v2.3
 * Fixed:
 *  1. ONE post per day — not 3x. Single 10am IST post.
 *  2. Startup immediate post only if no post today yet
 *  3. Daily loop has hard guard — runs maximum once per day
 *  4. Approval system wired in
 */

require('dotenv').config()
const http         = require('http')
const https        = require('https')
const mongoose     = require('mongoose')
const cron         = require('node-cron')
const EventEmitter = require('events')

const { Decision, Revenue, Content, AgentLog, PublishLog } = require('./models')
const ResearchAgent    = require('./agents/ResearchAgent')
const ContentAgent     = require('./agents/ContentAgent')
const PublisherAgent   = require('./agents/PublisherAgent')
const FinanceAgent     = require('./agents/FinanceAgent')
const OptimizerAgent   = require('./agents/OptimizerAgent')
const AdvertisingAgent    = require('./agents/AdvertisingAgent')
const LinkedInReplyAgent  = require('./agents/LinkedInReplyAgent')
const ImageAgent          = require('./agents/ImageAgent')

class AgentOrchestrator extends EventEmitter {
  constructor() {
    super()
    this.agents           = {}
    this.running          = false
    this.cycleCount       = 0
    this.dailyLoopRunning = false
    this.lastDailyPost    = null   // tracks date of last post (YYYY-MM-DD)
    this.dashboardClients = []
  }

  async initialize() {
    console.log('\n🤖 Toolify AI — Autonomous Engine v2.3 starting...')
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('✅ MongoDB connected')

    this.agents = {
      research:    new ResearchAgent(this),
      content:     new ContentAgent(this),
      publisher:   new PublisherAgent(this),
      finance:     new FinanceAgent(this),
      optimizer:   new OptimizerAgent(this),
      advertising:   new AdvertisingAgent(this),
      linkedinReply: new LinkedInReplyAgent(this),
      imageAgent:    new ImageAgent(this),
    }

    for (const [name, agent] of Object.entries(this.agents)) {
      try { await agent.initialize() }
      catch (err) { console.error(`  ⚠ ${name}: ${err.message}`) }
    }

    // Load last post date from DB on startup
    await this.loadLastPostDate()

    await this.testAI()
    this.startScheduler()
    this.running = true
    this.broadcast({ type:'system', message:'✅ Toolify AI Engine online — 1 post/day mode', level:'success' })
    console.log('\n✅ Engine running — 1 post per day\n')
  }

  // ── Load last post date from PublishLog
  async loadLastPostDate() {
    try {
      const last = await PublishLog.findOne({ status: 'success' }).sort({ createdAt: -1 })
      if (last) {
        this.lastDailyPost = last.createdAt.toISOString().split('T')[0]
        console.log(`  ℹ Last successful post: ${this.lastDailyPost}`)
      }
    } catch {}
  }

  // ── Check if we already posted today
  alreadyPostedToday() {
    const today = new Date().toISOString().split('T')[0]
    return this.lastDailyPost === today
  }

  // ── Mark today as posted
  markPostedToday() {
    this.lastDailyPost = new Date().toISOString().split('T')[0]
  }

  async testAI() {
    const provider = process.env.AI_PROVIDER || 'ollama'
    try {
      const res = await this.callAI('Reply with exactly: ok', '', { maxTokens: 5 })
      console.log(`  ✅ AI (${provider}) responding`)
    } catch (err) {
      console.warn(`  ⚠ AI (${provider}) not responding: ${err.message}`)
    }
  }

  // ── SCHEDULER — one post per day only
  startScheduler() {
    // Realtime: every 5 min — lightweight only
    cron.schedule('*/5 * * * *', () => this.realtimeLoop())

    // Hourly: revenue check + engagement
    cron.schedule('0 * * * *', () => this.hourlyLoop())

    // Daily post: 10am IST (4:30 UTC) — ONE TIME ONLY per day
    cron.schedule('30 4 * * *', () => this.dailyLoop(), {
      timezone: 'Asia/Kolkata'
    })

    // Weekly: Monday 8am IST
    cron.schedule('0 8 * * 1', () => this.weeklyLoop(), {
      timezone: 'Asia/Kolkata'
    })

    console.log('  ✅ Scheduler: 1 post/day at 10am IST | hourly revenue check | weekly research')
  }

  // ── REALTIME (every 5 min) — no AI calls, no posting
  async realtimeLoop() {
    this.cycleCount++
    this.broadcast({ type:'cycle', message:`Cycle #${this.cycleCount} — scanning`, level:'cycle' })
    await this.runTask('finance', 'checkBudget', { silent: true }).catch(() => {})
  }

  // ── HOURLY — revenue + engagement only
  async hourlyLoop() {
    this.broadcast({ type:'loop', message:'Hourly: revenue check + engagement', level:'info' })
    await Promise.allSettled([
      this.runTask('finance',       'pullRevenueData'),
      this.runTask('publisher',     'respondToMentions'),
      this.runTask('linkedinReply', 'scanAndReply'),
    ])
  }

  // ── DAILY LOOP — runs once per day, guarded
  async dailyLoop() {
    // Hard guard: only one post per day
    if (this.alreadyPostedToday()) {
      this.broadcast({ type:'task', message:'Daily post already done today — skipping', level:'info' })
      return
    }

    if (this.dailyLoopRunning) {
      this.broadcast({ type:'task', message:'Daily loop already running — skipping', level:'warning' })
      return
    }

    this.dailyLoopRunning = true
    this.broadcast({ type:'loop', message:'📅 Daily loop — generating today\'s post...', level:'info' })

    try {
      // 1. Research
      const research = await this.runTask('research', 'trendResearch')

      // 2. Strategic decision
      const decision = await this.makeStrategicDecision()

      // 3. Generate content (always has fallbacks)
      const content = await this.runTask('content', 'generateDailyContent', { research, decision })

      // 4. Generate images for the post
      let images = {}
      try {
        images = await this.agents.imageAgent?.generateBatchImages(content) || {}
        if (Object.keys(images).length > 0) {
          // Attach image paths to content for publisher
          if (content.linkedin && images.linkedin) content.linkedin.imagePath = images.linkedin
          if (content.twitter  && images.twitter)  content.twitter.imagePath  = images.twitter
        }
      } catch {}

      // 5. Publish (sends approval email if REQUIRE_APPROVAL=true)
      const result = await this.runTask('publisher', 'publishAll', { content })

      // 5. Mark posted today (even if pending approval — prevents double send)
      this.markPostedToday()

      // 6. Finance report
      await this.runTask('finance', 'dailyReport')

      // 7. Kill or double-down
      await this.runTask('finance', 'killOrDoubleDown')

    } catch (err) {
      this.broadcast({ type:'error', message:`Daily loop error: ${err.message}`, level:'error' })
      await AgentLog.create({ agent:'orchestrator', task:'dailyLoop', level:'error', message:err.message }).catch(() => {})
    } finally {
      this.dailyLoopRunning = false
    }
  }

  // ── IMMEDIATE POST — only if not already posted today
  async immediatePost() {
    if (this.alreadyPostedToday()) {
      this.broadcast({ type:'task', message:'⏭ Already posted today — next post tomorrow at 10am IST', level:'info' })
      return { skipped: true, reason: 'already_posted_today' }
    }
    return this.dailyLoop()
  }

  // ── FORCE POST — bypass the once-per-day guard (manual only)
  async forcePost() {
    this.broadcast({ type:'loop', message:'⚡ FORCE POST — bypassing daily limit', level:'info' })
    this.dailyLoopRunning = false // reset guard
    const research = await this.runTask('research', 'trendResearch')
    const content  = await this.runTask('content', 'generateDailyContent', { research })
    const result   = await this.runTask('publisher', 'publishAll', { content })
    return result
  }

  // ── WEEKLY
  async weeklyLoop() {
    this.broadcast({ type:'loop', message:'📊 Weekly: deep research + portfolio eval', level:'info' })
    const evaluation = await this.runTask('finance', 'weeklyEvaluation')
    await this.runTask('research', 'findNewNiches')
    if (evaluation?.shouldLaunch) {
      await this.runTask('content', 'launchNewProduct', { niche: evaluation.bestNiche })
    }
    await this.runTask('finance', 'cullBottomPerformers')
  }

  // ── STRATEGIC AI DECISION
  async makeStrategicDecision() {
    try {
      const [recentRevenue, recentDecisions] = await Promise.all([
        Revenue.find().sort({ createdAt:-1 }).limit(7),
        Decision.find().sort({ createdAt:-1 }).limit(3),
      ])
      const prompt = `You are CEO of Toolify AI (India). Decide today's single post strategy.

Products:
- ReplyDraft AI (₹750/mo) — email reply generator for Indian freelancers
- ListingLift AI (₹249/batch) — marketplace listing generator for sellers  
- PolicyPal AI (₹399/doc) — ToS analyzer

Recent revenue: ${JSON.stringify(recentRevenue.map(r => ({ amount:r.amount, product:r.product })))}
Last decisions: ${JSON.stringify(recentDecisions.map(d => d.action))}

We post ONCE per day. Choose the best product and angle for today.

Return JSON only:
{"focus":"replydraft","contentAngle":"how Indian freelancers waste 5 hours/week on email","platform":"linkedin","immediateAction":"post about email productivity for freelancers","reasoning":"Monday morning — freelancers planning their week"}`

      const res      = await this.callAI(prompt)
      const decision = this.parseJSON(res)
      if (decision?.focus) {
        await Decision.create({ action:decision.immediateAction||'daily_strategy', reasoning:decision.reasoning||'', context:{ revenue:recentRevenue.length }, outcome:'pending' }).catch(() => {})
        return decision
      }
    } catch {}
    return { focus:'replydraft', contentAngle:'saving time on client communication', platform:'linkedin', immediateAction:'post value content', reasoning:'default' }
  }

  // ── RUN TASK
  async runTask(agentName, method, params = {}) {
    const agent = this.agents[agentName]
    if (!agent || typeof agent[method] !== 'function') {
      this.broadcast({ type:'error', message:`Agent ${agentName}.${method} not found`, level:'warning' })
      return null
    }
    if (!params.silent) this.broadcast({ type:'task', message:`[${agentName.toUpperCase()}] → ${method}`, level:'info' })
    try {
      const result    = await agent[method](params)
      const resultStr = result ? JSON.stringify(result).slice(0,200) : ''
      await AgentLog.create({ agent:agentName, task:method, level:'success', result:resultStr }).catch(() => {})
      return result
    } catch (err) {
      await AgentLog.create({ agent:agentName, task:method, level:'error', message:err.message }).catch(() => {})
      this.broadcast({ type:'error', message:`[${agentName}] ${method}: ${err.message}`, level:'error' })
      return null
    }
  }

  // ── AI CALL: Ollama first, Anthropic fallback
  async callAI(prompt, system = '', opts = {}) {
    const provider = process.env.AI_PROVIDER || 'ollama'
    if (provider === 'ollama') {
      try { return await this._ollamaCall(prompt, system, opts) }
      catch (err) {
        if (process.env.ANTHROPIC_API_KEY) return await this._anthropicCall(prompt, system, opts)
        throw err
      }
    }
    return await this._anthropicCall(prompt, system, opts)
  }

  async _ollamaCall(prompt, system, opts = {}) {
    const messages = []
    if (system) messages.push({ role:'system', content:system })
    messages.push({ role:'user', content:prompt })
    const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434'
    const url       = new URL(ollamaUrl + '/api/chat')
    const lib       = url.protocol === 'https:' ? https : http
    const body      = JSON.stringify({ model:process.env.OLLAMA_MODEL||'llama3.2', messages, stream:false, options:{ temperature:0.7, num_predict:opts.maxTokens||1500, num_ctx:4096 } })
    return new Promise((resolve, reject) => {
      const req = lib.request({ hostname:url.hostname, port:url.port||(url.protocol==='https:'?443:80), path:url.pathname, method:'POST', headers:{ 'Content-Type':'application/json', 'Content-Length':Buffer.byteLength(body) }, timeout:180000 }, res => {
        let data = ''
        res.on('data', c => data += c)
        res.on('end', () => { try { const j=JSON.parse(data); if(j.error)return reject(new Error(j.error)); resolve(j.message?.content||'') } catch { reject(new Error('Invalid Ollama response')) } })
      })
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('Ollama timeout')) })
      req.write(body); req.end()
    })
  }

  async _anthropicCall(prompt, system, opts = {}) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('No Anthropic key')
    const body = JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:opts.maxTokens||1500, messages:[{ role:'user', content:prompt }], ...(system?{system}:{}) })
    return new Promise((resolve, reject) => {
      const req = https.request({ hostname:'api.anthropic.com', path:'/v1/messages', method:'POST', headers:{ 'x-api-key':process.env.ANTHROPIC_API_KEY, 'anthropic-version':'2023-06-01', 'Content-Type':'application/json', 'Content-Length':Buffer.byteLength(body) }, timeout:60000 }, res => {
        let data = ''
        res.on('data', c => data += c)
        res.on('end', () => { try { const j=JSON.parse(data); if(j.error)return reject(new Error(j.error?.message||'Anthropic error')); resolve(j.content?.map(c=>c.text).join('')||'') } catch { reject(new Error('Invalid Anthropic response')) } })
      })
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('Anthropic timeout')) })
      req.write(body); req.end()
    })
  }

  broadcast(event) {
    const data = JSON.stringify({ ...event, ts:new Date().toISOString() })
    this.dashboardClients = this.dashboardClients.filter(client => {
      try { client.write(`data: ${data}\n\n`); return true } catch { return false }
    })
    const icons = { success:'✅',error:'❌',warning:'⚠️',info:'→',decision:'🧠',task:'⚙️',cycle:'🔄',loop:'📋',system:'🚀' }
    console.log(`${icons[event.level]||'·'} ${event.message||''}`)
  }

  parseJSON(text) {
    try { const m=text.match(/\{[\s\S]*\}/); return m?JSON.parse(m[0]):{} } catch { return {} }
  }

  async triggerManual(agentName, task, params = {}) {
    // Special case: forcePost bypasses daily limit
    if (agentName === 'engine' && task === 'forcePost') return this.forcePost()
    return this.runTask(agentName, task, params)
  }
}

module.exports = new AgentOrchestrator()
