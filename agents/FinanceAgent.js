/**
 * FINANCE AGENT — Fixed:
 *  1. PIVOT message was [object Object] — now extracts string properly
 *  2. Razorpay pull handles missing keys gracefully
 *  3. killOrDoubleDown runs all 3 products properly
 */

const axios  = require('axios')
const { Revenue, Decision, AgentLog } = require('../models')

class FinanceAgent {
  constructor(orchestrator) {
    this.orchestrator   = orchestrator
    this.name           = 'finance'
    this.razorpayAuth   = null
    this.DAILY_BUDGET   = parseFloat(process.env.DAILY_API_BUDGET  || '4000')
    this.MONTHLY_BUDGET = parseFloat(process.env.MONTHLY_BUDGET     || '8000')
    this.apiSpendToday  = 0
  }

  async initialize() {
    if (process.env.RAZORPAY_KEY_ID &&
        process.env.RAZORPAY_KEY_SECRET &&
        !process.env.RAZORPAY_KEY_ID.includes('your-key')) {
      this.razorpayAuth = 'Basic ' + Buffer.from(
        `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`
      ).toString('base64')
      this.orchestrator.broadcast({ type: 'task', message: '[FINANCE] Razorpay connected', level: 'success' })
    } else {
      this.orchestrator.broadcast({ type: 'task', message: '[FINANCE] No Razorpay keys — revenue tracking offline', level: 'warning' })
    }
    console.log('  ✓ FinanceAgent ready (Razorpay + Ollama = zero AI cost)')
  }

  // ── HOURLY: pull Razorpay payments
  async pullRevenueData() {
    if (!this.razorpayAuth) return { total: 0, count: 0 }
    try {
      const from = Math.floor((Date.now() - 86400000) / 1000)
      const res  = await axios.get(
        `https://api.razorpay.com/v1/payments?count=100&from=${from}`,
        { headers: { Authorization: this.razorpayAuth }, timeout: 10000 }
      )
      const captured = (res.data.items || []).filter(p => p.status === 'captured')
      for (const p of captured) {
        const exists = await Revenue.findOne({ razorpayId: p.id })
        if (!exists) {
          const rec = await Revenue.create({
            amount:     p.amount / 100,
            currency:   'INR',
            product:    p.notes?.product || this.detectProduct(p.description || ''),
            razorpayId: p.id,
            orderId:    p.order_id,
            date:       new Date(p.created_at * 1000),
          })
          this.orchestrator.broadcast({
            type: 'task',
            message: `[FINANCE] 💰 New payment: ₹${rec.amount} — ${rec.product}`,
            level: 'success'
          })
          // Email alert
          try {
            const email = require('../services/EmailService')
            await email.revenueAlert(rec.product, rec.amount)
          } catch {}
        }
      }
      return { total: captured.reduce((s, p) => s + p.amount / 100, 0), count: captured.length }
    } catch (err) {
      this.orchestrator.broadcast({ type: 'task', message: `[FINANCE] Razorpay pull error: ${err.message}`, level: 'warning' })
      return { total: 0, count: 0 }
    }
  }

  // ── DAILY: P&L report
  async dailyReport() {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const week  = new Date(Date.now() - 7  * 86400000)
    const month = new Date(Date.now() - 30 * 86400000)

    const [todayRev, weekRev, monthRev] = await Promise.all([
      Revenue.find({ date: { $gte: today } }),
      Revenue.find({ date: { $gte: week  } }),
      Revenue.find({ date: { $gte: month } }),
    ])

    const sum = arr => arr.reduce((s, r) => s + (r.amount || 0), 0)

    const report = {
      today:  { revenue: sum(todayRev),  count: todayRev.length  },
      week:   { revenue: sum(weekRev),   count: weekRev.length   },
      month:  { revenue: sum(monthRev),  count: monthRev.length  },
      aiCost: 0, // Ollama = FREE
      margin: 1.0,
    }

    this.orchestrator.broadcast({
      type: 'task',
      message: `[FINANCE] P&L — Today: ₹${report.today.revenue.toFixed(0)} | Week: ₹${report.week.revenue.toFixed(0)} | AI cost: ₹0 (Ollama)`,
      level: report.today.revenue > 0 ? 'success' : 'info'
    })
    return report
  }

  // ── DAILY: kill or double-down per product
  async killOrDoubleDown() {
    const products = ['replydraft', 'listinglift', 'policypal']
    for (const prod of products) {
      const last3 = await Revenue.find({
        product: prod,
        date: { $gte: new Date(Date.now() - 3 * 86400000) }
      })
      const total = last3.reduce((s, r) => s + (r.amount || 0), 0)

      if (total === 0) {
        await this.handleZeroRevenue(prod)
      } else if (total > 4000) {
        await this.doubleDown(prod, total)
      }
    }
  }

  async handleZeroRevenue(product) {
    const prompt = `Product "${product}" has zero revenue for 3+ days in Toolify AI (India).
Options: kill | pivot | boost
Budget remaining: ₹${this.MONTHLY_BUDGET}/mo total

Return JSON only:
{"kill":false,"reason":"short reason","pivot":"one specific action to try"}`

    try {
      const res      = await this.orchestrator.callAI(prompt)
      const decision = this.orchestrator.parseJSON(res)

      // Fix [object Object] bug — extract string values properly
      const pivotMsg = typeof decision.pivot === 'string'
        ? decision.pivot
        : typeof decision.reason === 'string'
        ? decision.reason
        : 'try different content angle'

      const killMsg = typeof decision.reason === 'string'
        ? decision.reason
        : 'zero revenue for 3 days'

      if (decision.kill === true) {
        await this.killProduct(product, killMsg)
      } else {
        this.orchestrator.broadcast({
          type: 'task',
          message: `[FINANCE] 🟡 PIVOT ${product}: ${pivotMsg.slice(0, 120)}`,
          level: 'warning'
        })
        await Decision.create({
          action:    `pivot_${product}`,
          reasoning: pivotMsg,
          outcome:   'pending',
          context:   { product }
        }).catch(() => {})
      }
    } catch {
      this.orchestrator.broadcast({
        type: 'task',
        message: `[FINANCE] 🟡 ${product}: zero revenue — continuing with current strategy`,
        level: 'warning'
      })
    }
  }

  async killProduct(product, reason) {
    this.orchestrator.broadcast({
      type: 'error',
      message: `[FINANCE] 🔴 KILL ${product}: ${reason}`,
      level: 'error'
    })
    await Decision.create({ action: `kill_${product}`, reasoning: reason, outcome: 'executed', context: { product } }).catch(() => {})
    try { await require('../services/EmailService').killAlert(product, reason) } catch {}
  }

  async doubleDown(product, revenue) {
    this.orchestrator.broadcast({
      type: 'decision',
      message: `[FINANCE] 🟢 DOUBLE DOWN on ${product} — ₹${revenue} in 3 days`,
      level: 'success'
    })
    await Decision.create({
      action: `double_down_${product}`, reasoning: `₹${revenue} in 3 days`, outcome: 'executed', context: { product, revenue }
    }).catch(() => {})
  }

  // ── WEEKLY: portfolio evaluation
  async weeklyEvaluation() {
    const [week, month] = await Promise.all([
      Revenue.find({ date: { $gte: new Date(Date.now() - 7  * 86400000) } }),
      Revenue.find({ date: { $gte: new Date(Date.now() - 30 * 86400000) } }),
    ])
    const weekMRR  = week.reduce((s, r) => s + (r.amount || 0), 0)
    const monthMRR = month.reduce((s, r) => s + (r.amount || 0), 0)

    this.orchestrator.broadcast({
      type: 'task',
      message: `[FINANCE] Weekly: ₹${weekMRR}/wk | ₹${monthMRR}/mo | Launch threshold: ₹15,000`,
      level: 'info'
    })
    return { shouldLaunch: weekMRR > 15000, weekMRR, monthMRR }
  }

  // ── Cull bottom performers
  async cullBottomPerformers() {
    const month = await Revenue.aggregate([
      { $match: { date: { $gte: new Date(Date.now() - 30 * 86400000) } } },
      { $group: { _id: '$product', total: { $sum: '$amount' } } },
      { $sort: { total: 1 } }
    ])
    if (month.length >= 3 && month[0].total < 1000) {
      this.orchestrator.broadcast({
        type: 'task',
        message: `[FINANCE] Culling bottom performer: ${month[0]._id} (₹${month[0].total}/mo)`,
        level: 'warning'
      })
    }
  }

  // ── Budget check
  async checkBudget({ silent = false } = {}) {
    // Ollama = zero cost — this is basically always fine
    // Only relevant if using Anthropic
    if (process.env.AI_PROVIDER === 'anthropic' && this.apiSpendToday > this.DAILY_BUDGET) {
      this.orchestrator.broadcast({
        type: 'error',
        message: `[FINANCE] 🛑 Daily API budget exceeded — switch back to Ollama in .env`,
        level: 'error'
      })
      return { success: false, message: 'Budget exceeded' }
    }
    return { success: true, monthlySpend: 31, apiSpendToday: this.apiSpendToday }
  }

  detectProduct(text) {
    const t = (text || '').toLowerCase()
    if (t.includes('reply') || t.includes('email'))     return 'replydraft'
    if (t.includes('listing') || t.includes('marketplace')) return 'listinglift'
    if (t.includes('policy') || t.includes('terms'))    return 'policypal'
    return 'unknown'
  }
}

module.exports = FinanceAgent
