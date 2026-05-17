/**
 * TOOLIFY AI — ENGINE SERVER v2.2
 * Added: /api/approval routes for human review system
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

let orc    = null
let orErr  = null
let orInit = false

async function getOrc() {
  if (orc)    return orc
  if (orErr)  throw orErr
  if (orInit) {
    await new Promise(r => setTimeout(r, 1000))
    if (orc) return orc
    if (orErr) throw orErr
  }
  orInit = true
  try {
    orc = require('./orchestrator')
    await orc.initialize()
    return orc
  } catch (err) { orErr = err; throw err }
}

// ── SSE STREAM
app.get('/api/engine/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const ka = setInterval(() => { try { res.write(': keepalive\n\n') } catch { clearInterval(ka) } }, 20000)
  res.write(`data: ${JSON.stringify({ type:'system', message:'Dashboard connected', level:'success', ts:new Date().toISOString() })}\n\n`)

  try {
    const o = await getOrc()
    o.dashboardClients.push(res)
    req.on('close', () => {
      clearInterval(ka)
      const i = o.dashboardClients.indexOf(res)
      if (i > -1) o.dashboardClients.splice(i, 1)
    })
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type:'error', message:`Engine error: ${err.message}`, level:'error', ts:new Date().toISOString() })}\n\n`)
    clearInterval(ka)
    res.end()
  }
})

// ── TRIGGER
app.post('/api/engine/trigger', async (req, res) => {
  const { agent, task, params = {} } = req.body
  if (!agent || !task) return res.status(400).json({ error: 'agent and task required' })
  try {
    const o = await getOrc()
    if (agent === 'engine' && task === 'immediatePost') {
      o.immediatePost().catch(err => o.broadcast({ type:'error', message:`immediatePost: ${err.message}`, level:'error' }))
      return res.json({ ok: true, message: 'Immediate post triggered — check email for approval request' })
    }
    if (agent === 'engine' && task === 'dailyLoop') {
      o.dailyLoop().catch(err => o.broadcast({ type:'error', message:`dailyLoop: ${err.message}`, level:'error' }))
      return res.json({ ok: true, message: 'Daily loop triggered' })
    }
    o.triggerManual(agent, task, params).catch(err =>
      o.broadcast({ type:'error', message:`Trigger failed: ${err.message}`, level:'error' })
    )
    res.json({ ok: true, message: `Triggered ${agent}.${task}` })
  } catch (err) { res.status(500).json({ error: err.message }) }
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
      requireApproval:  process.env.REQUIRE_APPROVAL === 'true',
      autoApproveHours: process.env.AUTO_APPROVE_HOURS || '0',
      alertEmail:       process.env.ALERT_EMAIL || 'not set',
      agents:           Object.keys(o.agents),
      platforms: {
        linkedin: !!(process.env.LINKEDIN_ACCESS_TOKEN && process.env.LINKEDIN_PERSON_ID),
        twitter:  !!(process.env.TWITTER_API_KEY && process.env.TWITTER_ACCESS_TOKEN),
        reddit:   !!(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_USERNAME),
      }
    })
  } catch (err) { res.status(503).json({ running: false, error: err.message }) }
})

// ── DATA ROUTES
const { Revenue, AgentLog, Content, PublishLog, Decision, ResearchResult, Approval } = require('./models')

app.get('/api/engine/revenue', async (req, res) => {
  try {
    const days  = parseInt(req.query.days || '30')
    const since = new Date(Date.now() - days * 86400000)
    const [byProduct, total] = await Promise.all([
      Revenue.aggregate([{ $match:{ date:{ $gte:since } } },{ $group:{ _id:'$product', total:{ $sum:'$amount' }, count:{ $sum:1 } } },{ $sort:{ total:-1 } }]),
      Revenue.aggregate([{ $match:{ date:{ $gte:since } } },{ $group:{ _id:null, total:{ $sum:'$amount' } } }]),
    ])
    res.json({ byProduct, total: total[0]?.total || 0, currency:'INR', period:`${days}d` })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/engine/logs',      async (req, res) => { try { res.json(await AgentLog.find().sort({ createdAt:-1 }).limit(200)) } catch (e) { res.status(500).json({ error: e.message }) } })
app.get('/api/engine/content',   async (req, res) => { try { res.json(await Content.find().sort({ createdAt:-1 }).limit(20)) } catch (e) { res.status(500).json({ error: e.message }) } })
app.get('/api/engine/publishes', async (req, res) => { try { res.json(await PublishLog.find().sort({ createdAt:-1 }).limit(100)) } catch (e) { res.status(500).json({ error: e.message }) } })
app.get('/api/engine/decisions', async (req, res) => { try { res.json(await Decision.find().sort({ createdAt:-1 }).limit(50)) } catch (e) { res.status(500).json({ error: e.message }) } })
app.get('/api/engine/research',  async (req, res) => { try { res.json(await ResearchResult.find().sort({ date:-1 }).limit(10)) } catch (e) { res.status(500).json({ error: e.message }) } })

// ── PLATFORM TOGGLE ROUTES
try {
  const { router: platformRoutes } = require('./routes/platforms')
  app.use('/api/platforms', platformRoutes)
} catch (err) { console.warn('⚠ Platform routes:', err.message) }

// ── APPROVAL ROUTES
try {
  const approvalRoutes = require('./routes/approval')
  app.use('/api/approval', approvalRoutes)
} catch (err) { console.warn('⚠ Approval routes:', err.message) }

// ── PAYMENT ROUTES
try {
  const paymentRoutes = require('./routes/payment')
  app.use('/api/payment', paymentRoutes)
} catch (err) { console.warn('⚠ Payment routes:', err.message) }

// ── LinkedIn OAuth callback
app.get('/auth/linkedin/callback', (req, res) => {
  const { code, error } = req.query
  if (error) return res.send(`<html><body style="font-family:sans-serif;background:#080810;color:#fff;padding:40px"><h2 style="color:#FF4444">Error: ${error}</h2></body></html>`)
  res.send(`<html><body style="font-family:sans-serif;background:#080810;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
    <div style="text-align:center;padding:40px">
      <div style="width:50px;height:50px;background:#7B6CF6;border-radius:12px;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800">T</div>
      <h2>✅ Authorizing...</h2>
      <p style="color:#9896AA;margin-top:8px">Check your terminal for the access token</p>
    </div></body></html>`)
})

// ── Health
app.get('/health', (req, res) => res.json({ ok:true, ts:new Date().toISOString(), version:'2.2', engine:orc?.running?'running':'starting' }))

// ── Catch-all → dashboard
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dashboard', 'index.html')))

// ── Start
app.listen(PORT, () => {
  console.log(`\n🤖 Toolify AI Autonomous Engine v2.2`)
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`Dashboard   → http://localhost:${PORT}`)
  console.log(`Approvals   → http://localhost:${PORT}/api/approval/pending`)
  console.log(`Status      → http://localhost:${PORT}/api/engine/status`)
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)

  const requireApproval  = process.env.REQUIRE_APPROVAL === 'true'
  const autoApproveHours = parseInt(process.env.AUTO_APPROVE_HOURS || '0')

  if (requireApproval) {
    console.log(`\n📧 APPROVAL MODE: Review emails will be sent to ${process.env.ALERT_EMAIL}`)
    if (autoApproveHours > 0) console.log(`   Auto-approves after ${autoApproveHours} hour(s) if no response`)
    else console.log(`   Posts will NOT publish until you approve — no auto-approve`)
  } else {
    console.log(`\n⚡ AUTO-PUBLISH MODE: Set REQUIRE_APPROVAL=true in .env to enable review`)
  }

  if (process.env.AUTOSTART !== 'false') {
    getOrc()
      .then(o => {
        setTimeout(() => {
          o.immediatePost().catch(err => console.error('Startup post error:', err.message))
        }, 3000)
      })
      .catch(err => {
        console.error(`\n❌ Engine start failed: ${err.message}`)
        if (err.message.includes('ECONNREFUSED')) console.error('→ Ollama not running: ollama serve')
      })
  }
})

module.exports = app
