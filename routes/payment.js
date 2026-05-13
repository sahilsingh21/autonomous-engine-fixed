/**
 * RAZORPAY PAYMENT ROUTES — TOOLIFY AI
 * POST /api/payment/order   → create Razorpay order
 * POST /api/payment/verify  → verify after payment
 * POST /api/payment/webhook → Razorpay events
 * GET  /api/payment/revenue → pull payments for finance agent
 */
const express  = require('express')
const crypto   = require('crypto')
const axios    = require('axios')
const router   = express.Router()

const PRODUCTS = {
  replydraft_monthly:  { amount: 75000,   name: 'ReplyDraft AI — Monthly'  },
  replydraft_lifetime: { amount: 1200000, name: 'ReplyDraft AI — Lifetime' },
  listinglift_batch:   { amount: 24900,   name: 'ListingLift AI — Batch'   },
  policypal_doc:       { amount: 39900,   name: 'PolicyPal AI — Document'  },
}

function rzpAuth() {
  return 'Basic ' + Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')
}

// ── Create order
router.post('/order', async (req, res) => {
  const { product, userId } = req.body
  const prod = PRODUCTS[product]
  if (!prod) return res.status(400).json({ error: 'Unknown product' })
  if (!process.env.RAZORPAY_KEY_ID) return res.status(503).json({ error: 'Razorpay not configured' })

  try {
    const r = await axios.post('https://api.razorpay.com/v1/orders', {
      amount:   prod.amount,
      currency: 'INR',
      receipt:  `${product}_${Date.now()}`,
      notes:    { product, userId: userId || 'guest' },
    }, { headers: { Authorization: rzpAuth() }, timeout: 10000 })

    res.json({ orderId: r.data.id, amount: r.data.amount, currency: 'INR', keyId: process.env.RAZORPAY_KEY_ID, product: prod.name })
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error?.description || err.message })
  }
})

// ── Verify payment
router.post('/verify', (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
    .update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex')

  if (expected !== razorpay_signature) return res.status(400).json({ error: 'Invalid signature' })
  res.json({ success: true, paymentId: razorpay_payment_id })
})

// ── Webhook
router.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig      = req.headers['x-razorpay-signature']
  const secret   = process.env.RAZORPAY_WEBHOOK_SECRET
  if (secret) {
    const expected = crypto.createHmac('sha256', secret).update(req.body).digest('hex')
    if (expected !== sig) return res.status(400).json({ error: 'Invalid signature' })
  }

  const event = JSON.parse(req.body)
  if (event.event === 'payment.captured') {
    const p = event.payload.payment.entity
    console.log(`[RAZORPAY] 💰 Payment captured: ₹${p.amount / 100} — ${p.notes?.product}`)
  }
  res.json({ received: true })
})

// ── Pull revenue for finance agent
router.get('/revenue', async (req, res) => {
  if (!process.env.RAZORPAY_KEY_ID) return res.json({ payments: [], total: 0, currency: 'INR' })
  try {
    const from = Math.floor((Date.now() - 30 * 86400000) / 1000)
    const r    = await axios.get(`https://api.razorpay.com/v1/payments?count=100&from=${from}`,
      { headers: { Authorization: rzpAuth() }, timeout: 10000 })
    const captured = (r.data.items || []).filter(p => p.status === 'captured')
      .map(p => ({ id: p.id, amount: p.amount / 100, product: p.notes?.product || 'unknown', date: new Date(p.created_at * 1000) }))
    res.json({ payments: captured, total: captured.reduce((s, p) => s + p.amount, 0), currency: 'INR' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
