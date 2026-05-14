/**
 * TOOLIFY AI — AUTONOMOUS COMPANY ENGINE
 * Fixed:
 *  1. Ollama timeout increased — was timing out on slow responses
 *  2. Daily loop only runs ONCE then stops (no infinite re-trigger)
 *  3. Added immediatePost() — posts right on startup for testing
 *  4. PIVOT message fixed — was returning [object Object]
 */

require('dotenv').config()
const http         = require('http')
const https        = require('https')
const mongoose     = require('mongoose')
const cron         = require('node-cron')
const EventEmitter = require('events')

const { Decision, Revenue, Content, AgentLog } = require('./models')
const ResearchAgent    = require('./agents/ResearchAgent')
const ContentAgent     = require('./agents/ContentAgent')
const PublisherAgent   = require('./agents/PublisherAgent')
const FinanceAgent     = require('./agents/FinanceAgent')
const OptimizerAgent   = require('./agents/OptimizerAgent')
const AdvertisingAgent = require('./agents/AdvertisingAgent')

class AgentOrchestrator extends EventEmitter {
  constructor() {
    super()
    this.agents           = {}
    this.running          = false
    this.cycleCount       = 0
    this.dailyLoopRunning = false   // prevent concurrent daily loops
    this.dashboardClients = []
  }

  async initialize() {
    console.log('\n🤖 Toolify AI — Autonomous Engine starting...')
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('✅ MongoDB connected')

    this.agents = {
      research:    new ResearchAgent(this),
      content:     new ContentAgent(this),
      publisher:   new PublisherAgent(this),
      finance:     new FinanceAgent(this),
      optimizer:   new OptimizerAgent(this),
      advertising: new AdvertisingAgent(this),
    }

    for (const [name, agent] of Object.entries(this.agents)) {
      try { await agent.initialize() }
      catch (err) { console.error(`  ⚠ ${name} init failed: ${err.message}`) }
    }

    await this.testAI()
    this.startScheduler()
    this.running = true
    this.broadcast({ type: 'system', message: '✅ Toolify AI Autonomous Engine online', level: 'success' })
    console.log('\n✅ Engine running autonomously\n')
  }

  async testAI() {
    const provider = process.env.AI_PROVIDER || 'ollama'
    try {
      const res = await this.callAI('Reply with exactly the word: ok', '', { maxTokens: 5 })
      console.log(`  ✅ AI (${provider}) responding — ${res.trim().slice(0, 20)}`)
    } catch (err) {
      console.warn(`  ⚠ AI (${provider}) not responding: ${err.message}`)
      if (provider === 'ollama') {
        console.warn('  → Make sure Ollama is running: ollama serve')
        console.warn('  → And model is pulled: ollama pull llama3.2')
      }
    }
  }

  // ── SCHEDULER
  startScheduler() {
    // Realtime: every 5 minutes
    cron.schedule('*/5 * * * *', () => this.realtimeLoop())

    // Hourly
    cron.schedule('0 * * * *', () => this.hourlyLoop())

    // Daily: 9am IST
    cron.schedule('0 9 * * *',  () => this.dailyLoop())
    // cron.schedule('0 14 * * *', () => this.dailyLoop())
    // cron.schedule('0 19 * * *', () => this.dailyLoop())

    // Weekly: Monday 8am
    cron.schedule('0 8 * * 1', () => this.weeklyLoop())

    console.log('  ✅ Scheduler active — realtime/hourly/daily(3x)/weekly')
  }

  // ── REALTIME (every 5 min) — lightweight only
  async realtimeLoop() {
    this.cycleCount++
    this.broadcast({ type: 'cycle', message: `Cycle #${this.cycleCount} — scanning`, level: 'cycle' })
    // Only budget check — no AI calls in realtime loop
    await this.runTask('finance', 'checkBudget', { silent: true }).catch(() => {})
  }

  // ── HOURLY
  async hourlyLoop() {
    this.broadcast({ type: 'loop', message: 'Hourly loop', level: 'info' })
    await Promise.allSettled([
      this.runTask('finance',   'pullRevenueData'),
      this.runTask('publisher', 'respondToMentions'),
      this.runTask('publisher', 'engageWithCommunity'),
    ])
  }

  // ── DAILY (3x per day) — main loop, guarded against concurrent runs
  async dailyLoop() {
    if (this.dailyLoopRunning) {
      this.broadcast({ type: 'task', message: 'Daily loop already running — skipping', level: 'warning' })
      return
    }
    this.dailyLoopRunning = true
    this.broadcast({ type: 'loop', message: '📅 Daily loop starting — AI making decisions...', level: 'info' })

    try {
      // Step 1: Research
      const research = await this.runTask('research', 'trendResearch')

      // Step 2: AI strategic decision
      const decision = await this.makeStrategicDecision()

      // Step 3: Generate content (always works — has fallbacks)
      const content = await this.runTask('content', 'generateDailyContent', { research, decision })

      // Step 4: Publish to LinkedIn + Twitter + Reddit
      await this.runTask('publisher', 'publishAll', { content })

      // Step 5: Finance report
      await this.runTask('finance', 'dailyReport')

      // Step 6: Kill or double down
      await this.runTask('finance', 'killOrDoubleDown')

    } catch (err) {
      this.broadcast({ type: 'error', message: `Daily loop error: ${err.message}`, level: 'error' })
      await AgentLog.create({ agent: 'orchestrator', task: 'dailyLoop', level: 'error', message: err.message }).catch(() => {})
    } finally {
      this.dailyLoopRunning = false
    }
  }

  // ── IMMEDIATE POST — for testing, posts right now without waiting for cron
  async immediatePost() {
    this.broadcast({ type: 'loop', message: '⚡ Immediate post triggered', level: 'info' })
    try {
      const research = await this.runTask('research', 'trendResearch')
      const content  = await this.runTask('content', 'generateDailyContent', { research })
      const result   = await this.runTask('publisher', 'publishAll', { content })
      return result
    } catch (err) {
      this.broadcast({ type: 'error', message: `Immediate post error: ${err.message}`, level: 'error' })
    }
  }

  // ── WEEKLY (Monday 8am)
  async weeklyLoop() {
    this.broadcast({ type: 'loop', message: '📊 Weekly loop — deep analysis', level: 'info' })
    const evaluation = await this.runTask('finance', 'weeklyEvaluation')
    await this.runTask('research', 'findNewNiches')
    if (evaluation?.shouldLaunch) {
      await this.runTask('content', 'launchNewProduct', { niche: evaluation.bestNiche })
    }
    await this.runTask('finance',   'cullBottomPerformers')
    await this.runTask('advertising', 'refreshCreatives')
  }

  // ── AI STRATEGIC DECISION
  async makeStrategicDecision() {
    try {
      const [recentRevenue, recentDecisions] = await Promise.all([
        Revenue.find().sort({ createdAt: -1 }).limit(7),
        Decision.find().sort({ createdAt: -1 }).limit(3),
      ])

      const prompt = `You are CEO of Toolify AI (India). Decide today's strategy.

Products:
- ReplyDraft AI (₹750/mo) — email reply generator for Indian freelancers
- ListingLift AI (₹249/batch) — marketplace listing generator for sellers
- PolicyPal AI (₹399/doc) — ToS analyzer

Recent revenue: ${JSON.stringify(recentRevenue.map(r => ({ amount: r.amount, product: r.product })))}
Last decisions: ${JSON.stringify(recentDecisions.map(d => d.action))}

Return JSON only (no extra text):
{"focus":"replydraft","contentAngle":"saving time on client communication","platform":"linkedin","immediateAction":"post on LinkedIn about email productivity","reasoning":"freelancers are main audience"}`

      const res      = await this.callAI(prompt)
      const decision = this.parseJSON(res)

      if (decision?.focus) {
        await Decision.create({
          action:    decision.immediateAction || 'daily_strategy',
          reasoning: decision.reasoning || '',
          context:   { revenue: recentRevenue.length },
          outcome:   'pending'
        }).catch(() => {})
        return decision
      }
    } catch (err) {
      // Non-fatal — use default
    }

    return {
      focus:           'replydraft',
      contentAngle:    'saving time on client communication',
      platform:        'linkedin',
      immediateAction: 'post value content on LinkedIn',
      reasoning:       'default strategy — AI unavailable'
    }
  }

  // ── RUN TASK
  async runTask(agentName, method, params = {}) {
    const agent = this.agents[agentName]
    if (!agent || typeof agent[method] !== 'function') {
      this.broadcast({ type: 'error', message: `Agent ${agentName}.${method} not found`, level: 'warning' })
      return null
    }
    if (!params.silent) {
      this.broadcast({ type: 'task', message: `[${agentName.toUpperCase()}] → ${method}`, level: 'info' })
    }
    try {
      const result = await agent[method](params)
      const resultStr = result ? JSON.stringify(result).slice(0, 200) : ''
      await AgentLog.create({ agent: agentName, task: method, level: 'success', result: resultStr }).catch(() => {})
      return result
    } catch (err) {
      await AgentLog.create({ agent: agentName, task: method, level: 'error', message: err.message }).catch(() => {})
      this.broadcast({ type: 'error', message: `[${agentName}] ${method}: ${err.message}`, level: 'error' })
      return null
    }
  }

  // ── AI CALL: Ollama first, Anthropic fallback
  async callAI(prompt, system = '', opts = {}) {
    const provider = process.env.AI_PROVIDER || 'ollama'

    if (provider === 'ollama') {
      try {
        return await this._ollamaCall(prompt, system, opts)
      } catch (err) {
        if (process.env.ANTHROPIC_API_KEY) {
          // Silent fallback — no need to log every time
          return await this._anthropicCall(prompt, system, opts)
        }
        throw err
      }
    }
    return await this._anthropicCall(prompt, system, opts)
  }

  async _ollamaCall(prompt, system, opts = {}) {
    const messages = []
    if (system) messages.push({ role: 'system', content: system })
    messages.push({ role: 'user', content: prompt })

    const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434'
    const url       = new URL(ollamaUrl + '/api/chat')
    const isHttps   = url.protocol === 'https:'
    const lib       = isHttps ? https : http
    const body      = JSON.stringify({
      model:    process.env.OLLAMA_MODEL || 'llama3.2',
      messages,
      stream:   false,
      options:  {
        temperature:  0.7,
        num_predict:  opts.maxTokens || 1500,
        num_ctx:      4096,
      }
    })

    return new Promise((resolve, reject) => {
      const req = lib.request({
        hostname: url.hostname,
        port:     url.port || (isHttps ? 443 : 80),
        path:     url.pathname,
        method:   'POST',
        headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout:  180000,  // 3 minutes — Ollama can be slow on first call
      }, (res) => {
        let data = ''
        res.on('data', c => data += c)
        res.on('end', () => {
          try {
            const json = JSON.parse(data)
            if (json.error) return reject(new Error(json.error))
            resolve(json.message?.content || '')
          } catch {
            reject(new Error('Invalid Ollama response'))
          }
        })
      })
      req.on('error',   reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('Ollama timeout — model loading or overloaded')) })
      req.write(body)
      req.end()
    })
  }

  async _anthropicCall(prompt, system, opts = {}) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('No Anthropic key')
    const body = JSON.stringify({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: opts.maxTokens || 1500,
      messages:   [{ role: 'user', content: prompt }],
      ...(system ? { system } : {})
    })

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.anthropic.com',
        path:     '/v1/messages',
        method:   'POST',
        headers:  {
          'x-api-key':          process.env.ANTHROPIC_API_KEY,
          'anthropic-version':  '2023-06-01',
          'Content-Type':       'application/json',
          'Content-Length':     Buffer.byteLength(body),
        },
        timeout: 60000,
      }, (res) => {
        let data = ''
        res.on('data', c => data += c)
        res.on('end', () => {
          try {
            const json = JSON.parse(data)
            if (json.error) return reject(new Error(json.error.message || JSON.stringify(json.error)))
            resolve(json.content?.map(c => c.text).join('') || '')
          } catch {
            reject(new Error('Invalid Anthropic response'))
          }
        })
      })
      req.on('error',   reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('Anthropic timeout')) })
      req.write(body)
      req.end()
    })
  }

  // ── BROADCAST to SSE dashboard clients
  broadcast(event) {
    const data = JSON.stringify({ ...event, ts: new Date().toISOString() })
    this.dashboardClients = this.dashboardClients.filter(client => {
      try { client.write(`data: ${data}\n\n`); return true } catch { return false }
    })
    const icons = { success:'✅', error:'❌', warning:'⚠️', info:'→', decision:'🧠', task:'⚙️', cycle:'🔄', loop:'📋', system:'🚀' }
    console.log(`${icons[event.level] || '·'} ${event.message || ''}`)
  }

  parseJSON(text) {
    try {
      const match = text.match(/\{[\s\S]*\}/)
      return match ? JSON.parse(match[0]) : {}
    } catch { return {} }
  }

  async triggerManual(agentName, task, params = {}) {
    return this.runTask(agentName, task, params)
  }
}

module.exports = new AgentOrchestrator()
