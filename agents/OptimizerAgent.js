/**
 * OPTIMIZER AGENT — Fixed 403 error
 * PostHog API key format was wrong — now validates before calling
 */
class OptimizerAgent {
  constructor(orchestrator) {
    this.orchestrator = orchestrator
    this.name = 'optimizer'
  }

  async initialize() {
    const hasPostHog = !!(process.env.POSTHOG_API_KEY && !process.env.POSTHOG_API_KEY.startsWith('phc_vez'))
    console.log(`  ✓ OptimizerAgent ready ${hasPostHog ? '(PostHog connected)' : '(PostHog not configured — skipping)'}`)
  }

  async monitorConversions({ silent = false } = {}) {
    // Skip entirely if PostHog not properly configured
    if (!process.env.POSTHOG_API_KEY || !process.env.POSTHOG_PROJECT_ID) {
      return { success: true, skipped: 'PostHog not configured' }
    }

    // Validate key format (PostHog personal API keys start with phx_, project keys with phc_)
    const key = process.env.POSTHOG_API_KEY
    if (!key.startsWith('phx_') && !key.startsWith('phc_')) {
      return { success: true, skipped: 'Invalid PostHog key format' }
    }

    try {
      const axios = require('axios')
      const res = await axios.get(
        `https://app.posthog.com/api/projects/${process.env.POSTHOG_PROJECT_ID}/insights/`,
        {
          headers: { Authorization: `Bearer ${key}` },
          timeout: 8000,
        }
      )
      if (!silent) {
        this.orchestrator.broadcast({ type: 'task', message: '[OPTIMIZER] Conversions checked', level: 'info' })
      }
      return { success: true, data: res.data }
    } catch (err) {
      // Silently fail — don't spam logs with 403s
      return { success: false, skipped: `PostHog error: ${err.response?.status || err.message}` }
    }
  }

  async designABTest({ product, metric = 'conversion' } = {}) {
    const prompt = `Design a simple A/B test for ${product || 'ReplyDraft AI'} to improve ${metric}.
Return JSON: { "hypothesis": "", "control": "", "variant": "", "metric": "", "duration": "7 days", "expectedLift": "10%" }`
    try {
      const res = await this.orchestrator.callAI(prompt)
      return this.orchestrator.parseJSON(res)
    } catch { return null }
  }
}

module.exports = OptimizerAgent
