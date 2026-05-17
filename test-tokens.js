/**
 * TOKEN TESTER — Run before npm run dev
 * Tests: LinkedIn, Twitter, Razorpay, Ollama, MongoDB
 * Usage: node test-tokens.js
 */

require('dotenv').config()
const https = require('https')
const http  = require('http')

const OK  = '✅'
const ERR = '❌'
const WARN = '⚠️'

function req(opts, body = null) {
  return new Promise((resolve) => {
    const lib = opts.hostname?.includes('localhost') ? http : https
    const r = lib.request(opts, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }) }
        catch { resolve({ status: res.statusCode, body: d }) }
      })
    })
    r.on('error', err => resolve({ status: 0, error: err.message }))
    r.setTimeout(10000, () => { r.destroy(); resolve({ status: 0, error: 'timeout' }) })
    if (body) r.write(body)
    r.end()
  })
}

async function testOllama() {
  process.stdout.write('Ollama .............. ')
  const url = new URL((process.env.OLLAMA_URL || 'http://localhost:11434') + '/api/tags')
  const res = await req({ hostname: url.hostname, port: url.port || 11434, path: url.pathname, method: 'GET' })
  if (res.status === 200) {
    const models = res.body?.models?.map(m => m.name) || []
    const hasModel = models.some(m => m.includes(process.env.OLLAMA_MODEL || 'llama3.2'))
    if (hasModel) console.log(`${OK}  Running · model: ${process.env.OLLAMA_MODEL || 'llama3.2'}`)
    else console.log(`${WARN}  Running but model not found. Run: ollama pull llama3.2\n              Available: ${models.join(', ') || 'none'}`)
  } else {
    console.log(`${ERR}  Not running (status ${res.status || res.error})\n              Fix: ollama serve`)
  }
}

async function testLinkedIn() {
  process.stdout.write('LinkedIn ............ ')
  const token    = process.env.LINKEDIN_ACCESS_TOKEN
  const personId = process.env.LINKEDIN_PERSON_ID

  if (!token || token.includes('your-') || token.length < 50) {
    console.log(`${ERR}  No access token\n              Fix: node linkedin-auth.js`)
    return
  }
  if (!personId || personId.includes('your-')) {
    console.log(`${ERR}  No LINKEDIN_PERSON_ID set\n              Fix: node linkedin-auth.js`)
    return
  }

  const res = await req({
    hostname: 'api.linkedin.com',
    path:     '/v2/userinfo',
    method:   'GET',
    headers:  { Authorization: `Bearer ${token}` }
  })

  if (res.status === 200) {
    const name = res.body?.name || res.body?.localizedFirstName || 'unknown'
    console.log(`${OK}  Token valid · Name: ${name} · Person ID: ${personId}`)
  } else if (res.status === 401) {
    console.log(`${ERR}  Token EXPIRED\n              Fix: node linkedin-auth.js`)
  } else if (res.status === 403) {
    console.log(`${WARN}  Token valid but limited scope (status 403 on userinfo is OK)\n              Person ID: ${personId}`)
  } else {
    console.log(`${ERR}  Error ${res.status}: ${JSON.stringify(res.body).slice(0, 80)}`)
  }
}

async function testTwitter() {
  process.stdout.write('Twitter/X ........... ')
  const key    = process.env.TWITTER_API_KEY
  const secret = process.env.TWITTER_API_SECRET
  const token  = process.env.TWITTER_ACCESS_TOKEN
  const tsecret = process.env.TWITTER_ACCESS_SECRET
  const bearer = process.env.TWITTER_BEARER_TOKEN

  if (!key || !secret || !token || !tsecret) {
    console.log(`${ERR}  Missing keys. Need all 4: TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET`)
    return
  }

  // Check format of access token — should be numeric_id-alphanumeric
  const tokenParts = token.split('-')
  if (tokenParts.length < 2 || isNaN(tokenParts[0])) {
    console.log(`${ERR}  TWITTER_ACCESS_TOKEN has wrong format`)
    console.log(`              Got: ${token.slice(0, 30)}...`)
    console.log(`              Expected format: 1924474369636474112-XXXXXXXXXXXX`)
    console.log(`              Fix: Go to developer.twitter.com → Your App → Keys & Tokens → Regenerate Access Token`)
    return
  }

  // Test with verify credentials via bearer token
  const decodedBearer = decodeURIComponent(bearer || '')
  const res = await req({
    hostname: 'api.twitter.com',
    path:     '/2/users/me',
    method:   'GET',
    headers:  { Authorization: `Bearer ${decodedBearer}` }
  })

  if (res.status === 200) {
    const username = res.body?.data?.username || 'unknown'
    console.log(`${OK}  Bearer token valid · @${username}`)
    console.log(`              OAuth 1.0a keys set — posting should work`)
  } else if (res.status === 401) {
    console.log(`${ERR}  Bearer token invalid or expired`)
    console.log(`              Fix: Regenerate at developer.twitter.com → Your App → Keys & Tokens`)
  } else if (res.status === 403) {
    console.log(`${WARN}  App needs "Read and Write" permissions`)
    console.log(`              Fix: developer.twitter.com → App Settings → User authentication → Read and Write`)
  } else {
    console.log(`${ERR}  Error ${res.status}: ${JSON.stringify(res.body).slice(0, 100)}`)
  }
}

async function testRazorpay() {
  process.stdout.write('Razorpay ............ ')
  const keyId  = process.env.RAZORPAY_KEY_ID
  const secret = process.env.RAZORPAY_KEY_SECRET

  if (!keyId || keyId.includes('your-')) {
    console.log(`${WARN}  Not configured — add to .env for India payments`)
    return
  }

  const auth = 'Basic ' + Buffer.from(`${keyId}:${secret}`).toString('base64')
  const res  = await req({
    hostname: 'api.razorpay.com',
    path:     '/v1/payments?count=1',
    method:   'GET',
    headers:  { Authorization: auth }
  })

  if (res.status === 200) {
    const mode = keyId.startsWith('rzp_live_') ? 'LIVE 🔴' : 'TEST 🟡'
    console.log(`${OK}  Connected · Mode: ${mode}`)
    if (keyId.startsWith('rzp_test_')) {
      console.log(`              Using TEST mode — switch to rzp_live_ for real payments`)
    }
  } else if (res.status === 401) {
    console.log(`${ERR}  Invalid credentials — check RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET`)
  } else {
    console.log(`${ERR}  Error ${res.status}: ${JSON.stringify(res.body).slice(0, 80)}`)
  }
}

async function testMongoDB() {
  process.stdout.write('MongoDB ............. ')
  const uri = process.env.MONGODB_URI
  if (!uri || uri.includes('your-')) {
    console.log(`${ERR}  MONGODB_URI not set`)
    return
  }
  try {
    const mongoose = require('mongoose')
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 })
    const dbName = mongoose.connection.db?.databaseName || 'connected'
    console.log(`${OK}  Atlas connected · DB: ${dbName}`)
    await mongoose.disconnect()
  } catch (err) {
    console.log(`${ERR}  Connection failed: ${err.message.slice(0, 80)}`)
  }
}

async function testPostHog() {
  process.stdout.write('PostHog ............. ')
  const key       = process.env.POSTHOG_API_KEY
  const projectId = process.env.POSTHOG_PROJECT_ID

  if (!key || !projectId) {
    console.log(`${WARN}  Not configured — optional, skip for now`)
    return
  }

  // PostHog personal API key for management starts with phx_
  // Project key phc_ is for frontend tracking only, not API queries
  if (key.startsWith('phc_')) {
    console.log(`${WARN}  phc_ key is frontend-only, not for API queries`)
    console.log(`              OptimizerAgent has been updated to skip API calls with phc_ key`)
    console.log(`              To use PostHog API: get a Personal API Key from posthog.com → Settings → Personal API Keys`)
    return
  }

  const res = await req({
    hostname: 'app.posthog.com',
    path:     `/api/projects/${projectId}/`,
    method:   'GET',
    headers:  { Authorization: `Bearer ${key}` }
  })

  if (res.status === 200) {
    console.log(`${OK}  Connected · Project: ${res.body?.name || projectId}`)
  } else {
    console.log(`${WARN}  Error ${res.status} — skipped in engine (non-fatal)`)
  }
}

async function testSerpAPI() {
  process.stdout.write('SerpAPI ............. ')
  const key = process.env.SERPAPI_KEY
  if (!key || key.includes('your-')) {
    console.log(`${WARN}  Not configured — research still works via Reddit + HN`)
    return
  }
  const res = await req({
    hostname: 'serpapi.com',
    path:     `/account?api_key=${key}`,
    method:   'GET',
  })
  if (res.status === 200) {
    const remaining = res.body?.plan_searches_left || '?'
    console.log(`${OK}  Connected · Searches remaining: ${remaining}`)
  } else {
    console.log(`${WARN}  Error ${res.status} — research fallback will be used`)
  }
}

async function main() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  TOOLIFY AI — Token & Credential Test')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  await testOllama()
  await testMongoDB()
  await testLinkedIn()
  await testTwitter()
  await testRazorpay()
  await testPostHog()
  await testSerpAPI()

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  Quick commands:')
  console.log('  npm run post-now    → post to LinkedIn + Twitter RIGHT NOW')
  console.log('  npm run test-daily  → run full daily loop once')
  console.log('  npm run dev         → start engine (posts on startup + runs 24/7)')
  console.log('  npm run get-linkedin → refresh LinkedIn token')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  process.exit(0)
}

main().catch(err => {
  console.error('Test error:', err.message)
  process.exit(1)
})
