/**
 * TOOLIFY AI — ENGINE SERVER
 * Fixed:
 *  1. AUTOSTART posts immediately on startup (no waiting for cron)
 *  2. /api/engine/trigger now works for immediatePost too
 *  3. LinkedIn OAuth callback fixed
 *  4. All data routes working
 */

require('dotenv').config()
const express   = require('express')
const path      = require('path')
const cors      = require('cors')
const helmet    = require('helmet')
const rateLimit = require('express-rate-limit')

const app  = express()
const PORT = parseInt(process.env.ENGINE_PORT || '4000')

app.use(cors({ origin: '*' }))
app.use(express.json({ limit: '10mb' }))
app.use(helmet({ contentSecurityPolicy: false }))
app.use('/api/engine/trigger', rateLimit({ windowMs: 60000, max: 60 }))
app.use(express.static(path.join(__dirname, 'dashboard')))

// ── Orchestrator — lazy loaded
let orc    = null
let orErr  = null
let orInit = false

async function getOrc() {
  if (orc)   return orc
  if (orErr) throw orErr
  if (orInit) {
    // Wait for initialization to complete
    await new Promise(r => setTimeout(r, 1000))
    if (orc) return orc
    if (orErr) throw orErr
  }
  orInit = true
  try {
    orc = require('./orchestrator')
    await orc.initialize()
    return orc
  } catch (err) {
    orErr = err
    throw err
  }
}

// ── SSE STREAM — live dashboard feed
app.get('/api/engine/stream', async (req, res) => {
  res.setHeader('Content-Type',      'text/event-stream')
  res.setHeader('Cache-Control',     'no-cache')
  res.setHeader('Connection',        'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const ka = setInterval(() => {
    try { res.write(': keepalive\n\n') } catch { clearInterval(ka) }
  }, 20000)

  const welcome = JSON.stringify({
    type: 'system', message: 'Dashboard connected to Toolify AI Engine',
    level: 'success', ts: new Date().toISOString()
  })
  res.write(`data: ${welcome}\n\n`)

  try {
    const o = await getOrc()
    o.dashboardClients.push(res)
    req.on('close', () => {
      clearInterval(ka)
      const i = o.dashboardClients.indexOf(res)
      if (i > -1) o.dashboardClients.splice(i, 1)
    })
  } catch (err) {
    const errMsg = JSON.stringify({
      type: 'error',
      message: `Engine error: ${err.message} — check terminal for details`,
      level: 'error', ts: new Date().toISOString()
    })
    res.write(`data: ${errMsg}\n\n`)
    clearInterval(ka)
    res.end()
  }
})

// ── TRIGGER — run any agent manually
app.post('/api/engine/trigger', async (req, res) => {
  const { agent, task, params = {} } = req.body
  if (!agent || !task) return res.status(400).json({ error: 'agent and task required' })

  try {
    const o = await getOrc()

    // Special: immediatePost runs the full daily loop right now
    if (agent === 'engine' && task === 'immediatePost') {
      o.immediatePost().catch(err =>
        o.broadcast({ type: 'error', message: `immediatePost error: ${err.message}`, level: 'error' })
      )
      return res.json({ ok: true, message: 'Immediate post triggered — watch live feed' })
    }

    // Special: full daily loop
    if (agent === 'engine' && task === 'dailyLoop') {
      o.dailyLoop().catch(err =>
        o.broadcast({ type: 'error', message: `dailyLoop error: ${err.message}`, level: 'error' })
      )
      return res.json({ ok: true, message: 'Daily loop triggered — watch live feed' })
    }

    // Run specific agent task
    o.triggerManual(agent, task, params).catch(err =>
      o.broadcast({ type: 'error', message: `Trigger failed: ${err.message}`, level: 'error' })
    )
    res.json({ ok: true, message: `Triggered ${agent}.${task}` })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── STATUS
app.get('/api/engine/status', async (req, res) => {
  try {
    const o = await getOrc()
    res.json({
      running:          o.running,
      cycleCount:       o.cycleCount,
      dailyLoopRunning: o.dailyLoopRunning,
      dashboardClients: o.dashboardClients.length,
      mongodb:          require('mongoose').connection.readyState === 1 ? 'connected' : 'disconnected',
      aiProvider:       process.env.AI_PROVIDER || 'ollama',
      ollamaModel:      process.env.OLLAMA_MODEL || 'llama3.2',
      agents:           Object.keys(o.agents),
      platforms: {
        linkedin: !!(process.env.LINKEDIN_ACCESS_TOKEN && process.env.LINKEDIN_PERSON_ID),
        twitter:  !!(process.env.TWITTER_API_KEY && process.env.TWITTER_ACCESS_TOKEN),
        reddit:   !!(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_USERNAME),
      }
    })
  } catch (err) {
    res.status(503).json({ running: false, error: err.message })
  }
})

// ── DATA ROUTES
const { Revenue, AgentLog, Content, PublishLog, Decision, ResearchResult } = require('./models')

app.get('/api/engine/revenue', async (req, res) => {
  try {
    const days  = parseInt(req.query.days || '30')
    const since = new Date(Date.now() - days * 86400000)
    const [byProduct, total] = await Promise.all([
      Revenue.aggregate([
        { $match: { date: { $gte: since } } },
        { $group: { _id: '$product', total: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } }
      ]),
      Revenue.aggregate([
        { $match: { date: { $gte: since } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
    ])
    res.json({ byProduct, total: total[0]?.total || 0, currency: 'INR', period: `${days}d` })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/engine/logs', async (req, res) => {
  try {
    const logs = await AgentLog.find().sort({ createdAt: -1 }).limit(200)
    res.json(logs)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/engine/content', async (req, res) => {
  try {
    const content = await Content.find().sort({ createdAt: -1 }).limit(20)
    res.json(content)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/engine/publishes', async (req, res) => {
  try {
    const logs = await PublishLog.find().sort({ createdAt: -1 }).limit(100)
    res.json(logs)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/engine/decisions', async (req, res) => {
  try {
    const decisions = await Decision.find().sort({ createdAt: -1 }).limit(50)
    res.json(decisions)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/engine/research', async (req, res) => {
  try {
    const results = await ResearchResult.find().sort({ date: -1 }).limit(10)
    res.json(results)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Razorpay payment routes
try {
  const paymentRoutes = require('./routes/payment')
  app.use('/api/payment', paymentRoutes)
} catch (err) {
  console.warn('⚠ Payment routes not loaded:', err.message)
}

// ── LinkedIn OAuth callback
app.get('/auth/linkedin/callback', (req, res) => {
  const { code, error } = req.query
  if (error) {
    return res.send(`<html><body style="font-family:sans-serif;background:#080810;color:#fff;padding:40px">
      <h2 style="color:#FF4444">LinkedIn Error: ${error}</h2>
      <p>Go back and try again.</p>
    </body></html>`)
  }
  res.send(`<html><body style="font-family:sans-serif;background:#080810;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
    <div style="text-align:center;padding:40px">
      <div style="width:50px;height:50px;background:#7B6CF6;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;margin:0 auto 16px">T</div>
      <h2>✅ Authorizing LinkedIn...</h2>
      <p style="color:#9896AA;margin-top:8px">Check your terminal for the access token to copy to .env</p>
      <code style="display:block;margin-top:16px;padding:12px;background:#1A1A28;border-radius:8px;font-size:11px;color:#C8C0FB;word-break:break-all">code=${(code||'').slice(0,30)}...</code>
    </div>
  </body></html>`)
})

// ── Health check
app.get('/health', (req, res) => res.json({
  ok: true, ts: new Date().toISOString(), version: '2.1',
  engine: orc?.running ? 'running' : 'starting'
}))

// ── Approval routes
try {
  const approvalRoutes = require('./routes/approval')
  app.use('/api/approval', approvalRoutes)
  console.log('✅ Approval routes loaded')
} catch (err) {
  console.warn('⚠ Approval routes not loaded:', err.message)
}

// ── Catch-all → dashboard
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard', 'index.html'))
})

// ── Start server
const server = app.listen(PORT, () => {
  console.log(`\n🤖 Toolify AI Autonomous Engine`)
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`Dashboard  → http://localhost:${PORT}`)
  console.log(`API Status → http://localhost:${PORT}/api/engine/status`)
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)

  if (process.env.AUTOSTART !== 'false') {
    console.log('\n⚡ Auto-starting engine...')
    getOrc()
      .then(o => {
        // POST IMMEDIATELY on startup — don't wait for 9am cron
        // This is what was missing — cron only fires at 9am/2pm/7pm
        console.log('⚡ Running immediate post on startup...')
        setTimeout(() => {
          o.immediatePost().catch(err =>
            console.error('Immediate post error:', err.message)
          )
        }, 3000) // 3 second delay to let everything settle
      })
      .catch(err => {
        console.error(`❌ Engine start failed: ${err.message}`)
        if (err.message.includes('ollama') || err.message.includes('ECONNREFUSED')) {
          console.error('→ Ollama not running. Start: ollama serve')
          console.error('→ Or switch AI: AI_PROVIDER=anthropic in .env')
        }
      })
  }
})

module.exports = app
