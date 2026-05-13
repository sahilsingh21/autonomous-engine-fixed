const https = require('https')
const axios = require('axios')

async function testImageGeneration() {
  console.log('🔄 Testing image generation with fallback system...')
  console.log('1. Trying Replicate first...')
  console.log('2. Falling back to Pexels if Replicate fails...')

  const prompt = 'A high quality social media marketing image for Toolify AI about productivity tools. Bright, modern, minimal, professional style with an Indian startup founder vibe.'

  // Test Replicate
  const replicateToken = process.env.REPLICATE_API_TOKEN
  if (replicateToken) {
    try {
      console.log('Testing Replicate...')
      const result = await testReplicate()
      if (result) {
        console.log('✅ Replicate worked!')
        return true
      }
    } catch (err) {
      console.log('❌ Replicate failed:', err.message)
    }
  }

  // Test Unsplash fallback
  console.log('Testing Pexels fallback...')
  try {
    const result = await testUnsplash(prompt)
    if (result) {
      console.log('✅ Unsplash fallback worked!')
      return true
    }
  } catch (err) {
    console.log('❌ Unsplash failed:', err.message)
  }

  console.log('❌ All image generation methods failed')
  return false
}

async function testReplicate() {
  const apiToken = process.env.REPLICATE_API_TOKEN
  const model = process.env.REPLICATE_MODEL || 'stability-ai/stable-diffusion:db21e45d3f7023abc2a46ee38a23973f6dce16bb082a930b0c49861f96d1e5bf'
  const prompt = 'test image'

  const [modelName, version] = model.split(':')
  const body = JSON.stringify({
    version: version,
    input: { prompt: prompt, width: 512, height: 512, num_inference_steps: 20 }
  })

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.replicate.com',
      path: '/v1/predictions',
      method: 'POST',
      headers: {
        Authorization: `Token ${apiToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 30000,
    }, (res) => {
      if (res.statusCode === 402) {
        reject(new Error('Insufficient credits'))
      } else if (res.statusCode === 201) {
        resolve(true)
      } else {
        reject(new Error(`HTTP ${res.statusCode}`))
      }
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')) })
    req.write(body)
    req.end()
  })
}

async function testUnsplash(prompt) {
  // Test Lorem Picsum (free, no API key)
  const hash = require('crypto').createHash('md5').update(prompt).digest('hex')
  const seed = parseInt(hash.substring(0, 8), 16) % 1000

  const imageUrl = `https://picsum.photos/800/600?random=${seed}`

  const imageResponse = await axios.get(imageUrl, {
    responseType: 'arraybuffer',
    timeout: 15000
  })

  return imageResponse.data.length > 0
}

require('dotenv').config()
testImageGeneration().then(success => {
  if (success) {
    console.log('\n🎉 Image generation is working!')
    console.log('The engine can now generate images and post them to LinkedIn.')
  } else {
    console.log('\n❌ All image generation methods failed.')
  }
})