/**
 * LINKEDIN TOKEN GENERATOR — run once to get tokens
 * Usage: node linkedin-auth.js
 * Then copy tokens to .env
 */
require('dotenv').config()
const http  = require('http')
const https = require('https')
const url   = require('url')

const CLIENT_ID     = process.env.LINKEDIN_CLIENT_ID     || '86vnJl00nc6n9q'
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET || ''
const REDIRECT_URI  = process.env.LINKEDIN_REDIRECT_URI  || 'http://toolify.sahilsingh.co.in/auth/linkedin/callback'
const PORT          = 4000

if (!CLIENT_SECRET || CLIENT_SECRET === 'your-client-secret-from-auth-tab') {
  console.error('\n❌ Set LINKEDIN_CLIENT_SECRET in your .env first')
  console.error('   Get it from: linkedin.com/developers → Your App → Auth tab\n')
  process.exit(1)
}

const authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent('openid profile email w_member_social')}&state=toolify_${Date.now()}`

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('  Toolify AI — LinkedIn Setup')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('\n1. Make sure this is in your LinkedIn app redirect URLs:')
console.log(`   ${REDIRECT_URI}`)
console.log('\n2. Open this URL in your browser:\n')
console.log(`   ${authUrl}\n`)
console.log('3. Sign in → authorize → come back here\n')

const server = http.createServer(async (req, res) => {
  const p = url.parse(req.url, true)
  if (!p.pathname.includes('callback')) { res.writeHead(200); res.end('Waiting...'); return }

  const code  = p.query.code
  const error = p.query.error
  if (error || !code) { console.error('\n❌ Error:', error || 'no code'); res.end('Error'); server.close(); return }

  console.log('✓ Got authorization code — exchanging for token...')

  try {
    const tokenData = await exchangeCode(code)
    const profile   = await getProfile(tokenData.access_token)
    const personId  = profile.sub || ''

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('  ✅ Copy these to your .env:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    console.log(`LINKEDIN_ACCESS_TOKEN=${tokenData.access_token}`)
    console.log(`LINKEDIN_PERSON_ID=${personId}`)
    if (tokenData.refresh_token) console.log(`LINKEDIN_REFRESH_TOKEN=${tokenData.refresh_token}`)
    console.log(`\n# Expires in ${Math.round(tokenData.expires_in / 86400)} days`)
    console.log(`# Name: ${profile.name || 'unknown'}\n`)

    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(`<html><body style="font-family:sans-serif;background:#080810;color:#F0EEF8;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
      <div style="text-align:center;padding:40px">
        <div style="width:50px;height:50px;background:#7B6CF6;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;margin:0 auto 16px">T</div>
        <h2>✅ LinkedIn Connected!</h2>
        <p style="color:#9896AA;margin-top:8px">Tokens printed in terminal. Copy to .env and restart engine.</p>
        <p style="color:#5A5878;margin-top:16px;font-size:13px">You can close this window.</p>
      </div></body></html>`)

    setTimeout(() => { server.close(); process.exit(0) }, 2000)
  } catch (err) {
    console.error('\n❌ Token exchange failed:', err.message)
    res.end(`<html><body style="font-family:sans-serif;padding:40px;background:#080810;color:#fff"><h2 style="color:red">Error: ${err.message}</h2></body></html>`)
    server.close()
  }
})

server.listen(PORT, () => console.log(`Listening on :${PORT} for LinkedIn redirect...`))

function exchangeCode(code) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({ grant_type:'authorization_code', code, redirect_uri:REDIRECT_URI, client_id:CLIENT_ID, client_secret:CLIENT_SECRET }).toString()
    const req  = https.request({ hostname:'www.linkedin.com', path:'/oauth/v2/accessToken', method:'POST',
      headers:{ 'Content-Type':'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
    }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ try{const j=JSON.parse(d); j.error?reject(new Error(j.error_description)):resolve(j)}catch{reject(new Error('Parse error'))} }) })
    req.on('error', reject); req.write(body); req.end()
  })
}

function getProfile(token) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname:'api.linkedin.com', path:'/v2/userinfo', method:'GET',
      headers:{ Authorization:`Bearer ${token}` }
    }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ try{resolve(JSON.parse(d))}catch{reject(new Error('Profile parse error'))} }) })
    req.on('error', reject); req.end()
  })
}
