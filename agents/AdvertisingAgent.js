const { AdCampaign } = require('../models')

class AdvertisingAgent {
  constructor(orchestrator) { this.orchestrator = orchestrator; this.name = 'advertising' }

  async initialize() { console.log('  ✓ AdvertisingAgent ready (campaigns start after first revenue)') }

  async checkAdPerformance() {
    const campaigns = await AdCampaign.find({ status: 'active' })
    if (!campaigns.length) return
    // Future: fetch metrics from Reddit Ads API
    this.orchestrator.broadcast({ type: 'task', message: `[ADS] Checked ${campaigns.length} campaigns`, level: 'info' })
  }

  async refreshCreatives() {
    this.orchestrator.broadcast({ type: 'task', message: '[ADS] Refreshing ad creatives with AI...', level: 'info' })
    const products = ['replydraft', 'listinglift', 'policypal']
    for (const prod of products) {
      const copy = await this.orchestrator.agents.content?.generateAdCopy({ id: prod, name: prod, pain: '', price: '', target: '' }, 'reddit').catch(() => null)
      if (copy) await AdCampaign.findOneAndUpdate({ product: prod }, { adCopy: copy, refreshedAt: new Date() }).catch(() => null)
    }
    this.orchestrator.broadcast({ type: 'task', message: '[ADS] ✓ Creatives refreshed', level: 'success' })
  }
}

module.exports = AdvertisingAgent
