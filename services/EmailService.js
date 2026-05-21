/**
 * EMAIL SERVICE — Resend.com
 * Sends alerts for revenue, kill decisions, budget warnings
 */
const https = require('https')

class EmailService {
  constructor() {
    this.apiKey = process.env.RESEND_API_KEY
    this.to     = process.env.ALERT_EMAIL || 'sahilsingh2597@gmail.com'
    this.from   = process.env.ALERT_FROM_EMAIL || 'noreply@sahilsingh.co.in'
    this.enabled = !!(this.apiKey && !this.apiKey.includes('your-'))
  }

  async send(subject, html) {
    if (!this.enabled) {
      console.log(`📧 [EMAIL SIMULATED] To: ${this.to} | Subject: ${subject}`)
      return
    }
    const body = JSON.stringify({ from: this.from, to: this.to, subject, html })
    return new Promise((resolve) => {
      const req = https.request({
        hostname: 'api.resend.com',
        path:     '/emails',
        method:   'POST',
        headers:  {
          Authorization:  `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        }
      }, res => { res.resume(); resolve(res.statusCode) })
      req.on('error', () => resolve(null))
      req.write(body)
      req.end()
    })
  }

  async revenueAlert(product, amount) {
    await this.send(
      `💰 New payment: ₹${amount} from ${product} — Toolify AI`,
      `<h2>New Payment!</h2><p><b>Product:</b> ${product}</p><p><b>Amount:</b> ₹${amount}</p><p>${new Date().toLocaleString('en-IN')}</p>`
    )
  }

  async killAlert(product, reason) {
    await this.send(
      `🔴 Product killed: ${product} — Toolify AI Engine`,
      `<h2>Kill Decision</h2><p><b>Product:</b> ${product}</p><p><b>Reason:</b> ${reason}</p>`
    )
  }

  async budgetWarning(percent, remaining) {
    await this.send(
      `⚠️ Budget at ${percent}% — Toolify AI Engine`,
      `<h2>Budget Warning</h2><p>Monthly budget: <b>${percent}%</b> used</p><p>Remaining: <b>₹${remaining}</b></p>`
    )
  }
}

module.exports = new EmailService()
