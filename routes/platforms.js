/**
 * PLATFORM TOGGLE ROUTES
 * GET  /api/platforms          → get current on/off state
 * POST /api/platforms/:name    → toggle on or off
 */

const express = require('express')
const router  = express.Router()
const fs      = require('fs')
const path    = require('path')

const STATE_FILE = path.join(__dirname, '../.platform-state.json')

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
    }
  } catch {}
  // Defaults — read from .env to set initial state
  return {
    linkedin: !!(process.env.LINKEDIN_ACCESS_TOKEN && process.env.LINKEDIN_PERSON_ID),
    twitter:  !!(process.env.TWITTER_API_KEY && process.env.TWITTER_ACCESS_TOKEN),
    reddit:   !!(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_USERNAME),
    linkedinReply:   false, // LinkedIn comment auto-reply — off by default
    imageGeneration: true,  // Generate images for posts — on by default
  }
}

function saveState(state) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)) } catch {}
}

// GET all platform states
router.get('/', (req, res) => {
  const state = loadState()
  res.json({
    platforms: state,
    configured: {
      linkedin: !!(process.env.LINKEDIN_ACCESS_TOKEN && process.env.LINKEDIN_PERSON_ID),
      twitter:  !!(process.env.TWITTER_API_KEY && process.env.TWITTER_ACCESS_TOKEN),
      reddit:   !!(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_USERNAME),
    }
  })
})

// POST toggle a platform
router.post('/:name', (req, res) => {
  const { name }    = req.params
  const { enabled } = req.body
  const valid = ['linkedin', 'twitter', 'reddit', 'linkedinReply', 'imageGeneration']

  if (!valid.includes(name)) {
    return res.status(400).json({ error: `Unknown platform: ${name}. Valid: ${valid.join(', ')}` })
  }

  const state     = loadState()
  state[name]     = !!enabled
  saveState(state)

  console.log(`[PLATFORMS] ${name} → ${enabled ? 'ON' : 'OFF'}`)
  res.json({ ok: true, platform: name, enabled: !!enabled, state })
})

// GET single platform state
router.get('/:name', (req, res) => {
  const state = loadState()
  const { name } = req.params
  res.json({ platform: name, enabled: !!state[name] })
})

module.exports = { router, loadState }
