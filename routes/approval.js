/**
 * APPROVAL ROUTES
 * GET /api/approval/approve/:token  → approve and publish
 * GET /api/approval/reject/:token   → reject and discard
 * GET /api/approval/pending         → list all pending approvals
 * GET /api/approval/history         → all decisions
 */

const express  = require('express')
const router   = express.Router()
const { Approval, PublishLog } = require('../models')

// ── APPROVE — clicked from email link
router.get('/approve/:token', async (req, res) => {
  try {
    const approval = await Approval.findOne({
      approveToken: req.params.token,
      status: 'pending'
    })

    if (!approval) {
      return res.send(page('Already processed', '⚠️ This approval link has already been used or expired.', '#FFB800'))
    }

    await Approval.findByIdAndUpdate(approval._id, {
      status:     'approved',
      reviewedAt: new Date()
    })

    // Signal the waiting PublisherAgent via the orchestrator
    // The publisher is polling the DB every 30s — it will pick this up
    res.send(page(
      '✅ Approved!',
      `Your <strong>${approval.platform}</strong> post has been approved and will be published shortly.`,
      '#2DCB8F',
      approval.content,
      approval.platform
    ))

  } catch (err) {
    res.status(500).send(page('Error', err.message, '#E85D5D'))
  }
})

// ── REJECT — clicked from email link
router.get('/reject/:token', async (req, res) => {
  try {
    const approval = await Approval.findOne({
      rejectToken: req.params.token,
      status: 'pending'
    })

    if (!approval) {
      return res.send(page('Already processed', '⚠️ This link has already been used or expired.', '#FFB800'))
    }

    await Approval.findByIdAndUpdate(approval._id, {
      status:     'rejected',
      reviewedAt: new Date()
    })

    res.send(page(
      '❌ Rejected',
      `The <strong>${approval.platform}</strong> post has been rejected and will not be published. The engine will generate new content at the next scheduled time.`,
      '#E85D5D'
    ))

  } catch (err) {
    res.status(500).send(page('Error', err.message, '#E85D5D'))
  }
})

// ── PENDING — dashboard view of all pending approvals
router.get('/pending', async (req, res) => {
  try {
    const pending = await Approval.find({ status: 'pending' })
      .sort({ createdAt: -1 })
      .limit(20)
    res.json({ count: pending.length, approvals: pending })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── HISTORY — all past approvals
router.get('/history', async (req, res) => {
  try {
    const history = await Approval.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .select('-approveToken -rejectToken') // hide tokens in list view
    res.json(history)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── APPROVE via API (for dashboard button)
router.post('/approve-api', async (req, res) => {
  try {
    const { id } = req.body
    const approval = await Approval.findByIdAndUpdate(id,
      { status: 'approved', reviewedAt: new Date() },
      { new: true }
    )
    if (!approval) return res.status(404).json({ error: 'Not found' })
    res.json({ ok: true, approval })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── REJECT via API (for dashboard button)
router.post('/reject-api', async (req, res) => {
  try {
    const { id } = req.body
    const approval = await Approval.findByIdAndUpdate(id,
      { status: 'rejected', reviewedAt: new Date() },
      { new: true }
    )
    if (!approval) return res.status(404).json({ error: 'Not found' })
    res.json({ ok: true, approval })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── HTML page for approve/reject responses
function page(title, message, color, content = null, platform = null) {
  const preview = content && platform ? buildPreview(content, platform) : ''
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Toolify AI — ${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, 'Segoe UI', sans-serif; background: #080810; color: #E8EDF5; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .card { background: #0D1117; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 36px 32px; max-width: 520px; width: 100%; text-align: center; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 10px; color: ${color}; }
    p { font-size: 14px; color: #7B8699; line-height: 1.6; margin-bottom: 20px; }
    p strong { color: #E8EDF5; }
    .preview { background: #131924; border-left: 3px solid ${color}; border-radius: 0 8px 8px 0; padding: 14px 18px; margin: 16px 0; font-size: 13px; color: #9896AA; text-align: left; line-height: 1.6; white-space: pre-wrap; word-break: break-word; max-height: 300px; overflow-y: auto; }
    .back { display: inline-block; margin-top: 16px; padding: 10px 20px; background: rgba(123,108,246,0.15); border: 1px solid rgba(123,108,246,0.3); border-radius: 8px; color: #A99DF9; font-size: 13px; text-decoration: none; }
    .logo { font-size: 13px; color: #3D4555; margin-bottom: 24px; font-weight: 600; letter-spacing: 0.05em; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">TOOLIFY AI ENGINE</div>
    <div class="icon">${color === '#2DCB8F' ? '✅' : color === '#E85D5D' ? '❌' : '⚠️'}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    ${preview ? `<div class="preview">${preview}</div>` : ''}
    <a href="javascript:window.close()" class="back">Close this window</a>
  </div>
</body>
</html>`
}

function buildPreview(content, platform) {
  try {
    if (platform === 'twitter' && Array.isArray(content)) {
      return content.slice(0, 3).map((t, i) =>
        `<strong style="color:#4D9EFF">Tweet ${i+1}:</strong>\n${esc(t)}`
      ).join('\n\n')
    }
    if (platform === 'linkedin') {
      const text = typeof content === 'string' ? content : content?.text || ''
      return esc(text.slice(0, 400)) + (text.length > 400 ? '...' : '')
    }
    if (platform === 'reddit') {
      return `<strong style="color:#FF4500">r/${content?.subreddit}</strong>\n${esc(content?.title || '')}\n\n${esc((content?.body || '').slice(0, 300))}`
    }
    return esc(JSON.stringify(content).slice(0, 300))
  } catch { return '' }
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

module.exports = router
