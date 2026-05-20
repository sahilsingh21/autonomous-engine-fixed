/**
 * IMAGE AGENT — Toolify AI
 * Generates social media images for posts using Canvas/PIL via child process
 * No external API needed — generates locally using Node canvas or sharp
 * Falls back to text-only if image generation fails
 */

const { execSync } = require('child_process')
const fs   = require('fs')
const path = require('path')
const os   = require('os')

class ImageAgent {
  constructor(orchestrator) {
    this.orchestrator = orchestrator
    this.name         = 'imageAgent'
    this.outputDir    = path.join(__dirname, '../generated-images')
    this.canGenerate  = false
  }

  async initialize() {
    // Create output dir
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true })
    }

    // Check if Python PIL is available
    try {
      execSync('python3 -c "from PIL import Image, ImageDraw, ImageFont; print(\'ok\')"', { timeout: 5000 })
      this.canGenerate = true
      console.log('  ✓ ImageAgent ready (PIL/Pillow available)')
    } catch {
      this.canGenerate = false
      console.log('  ✓ ImageAgent ready (PIL not available — text-only posts)')
    }
  }

  // ── Generate a social media post image
  async generatePostImage({ text, platform, product, date }) {
    if (!this.canGenerate) return null

    try {
      const filename = `post_${platform}_${Date.now()}.png`
      const outPath  = path.join(this.outputDir, filename)
      const safeText = (text || '').slice(0, 200).replace(/'/g, "\\'").replace(/\n/g, '\\n')

      const configs = {
        linkedin: { w: 1200, h: 627 },   // LinkedIn recommended
        twitter:  { w: 1200, h: 675 },   // Twitter card
        reddit:   { w: 1200, h: 628 },   // Reddit
      }
      const cfg = configs[platform] || configs.linkedin

      // Product colors
      const colors = {
        replydraft:  { bg: '(14, 12, 26)',      accent: '(123, 108, 246)', name: 'ReplyDraft AI',  emoji: '✍️' },
        listinglift: { bg: '(10, 20, 18)',       accent: '(45, 203, 143)',  name: 'ListingLift AI', emoji: '🛒' },
        policypal:   { bg: '(20, 16, 10)',       accent: '(244, 166, 35)',  name: 'PolicyPal AI',   emoji: '🔍' },
        default:     { bg: '(14, 12, 26)',       accent: '(123, 108, 246)', name: 'Toolify AI',     emoji: '🤖' },
      }
      const c = colors[product] || colors.default

      const py = `
from PIL import Image, ImageDraw, ImageFont
import os, textwrap

W, H = ${cfg.w}, ${cfg.h}
BG     = ${c.bg}
ACCENT = ${c.accent}
WHITE  = (255, 255, 255)
MUTED  = (160, 155, 185)
DARK2  = (22, 18, 40)

img  = Image.new('RGB', (W, H), BG)
draw = ImageDraw.Draw(img)

# Background gradient strips
for i in range(0, W, 3):
    alpha = int(8 * (1 - i/W))
    c = tuple(min(255, BG[j] + alpha) for j in range(3))
    draw.line([(i, 0), (i, H)], fill=c)

# Accent glow top-left
for r in range(200, 0, -8):
    a = int(20 * (1 - r/200))
    col = tuple(min(255, int(ACCENT[j]*0.4 + BG[j]*0.6) + a) for j in range(3))
    draw.ellipse([-r, -r, r, r], fill=col)

# Bottom right accent
for r in range(150, 0, -6):
    a = int(15 * (1 - r/150))
    col = tuple(min(255, int(ACCENT[j]*0.3 + BG[j]*0.7) + a) for j in range(3))
    draw.ellipse([W-r, H-r, W+r, H+r], fill=col)

# Logo mark (T in purple square)
mx, my, ms = 60, 60, 52
draw.rounded_rectangle([mx-ms//2, my-ms//2, mx+ms//2, my+ms//2], radius=10, fill=ACCENT)
draw.rounded_rectangle([mx-ms//2+6, my-ms//2+6, mx+ms//2-6, my-ms//2+17], radius=3, fill=WHITE)
sw = 10
draw.rounded_rectangle([mx-sw//2, my-ms//2+17+2, mx+sw//2, my+ms//2-6], radius=3, fill=WHITE)
draw.rounded_rectangle([mx+ms//2-14, my-ms//2-8, mx+ms//2+4, my-ms//2+4], radius=6, fill=(45,203,143))

def get_font(size):
    for p in ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
              '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
              '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf']:
        if os.path.exists(p):
            try: return ImageFont.truetype(p, size)
            except: pass
    return ImageFont.load_default()

def get_font_reg(size):
    for p in ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
              '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf']:
        if os.path.exists(p):
            try: return ImageFont.truetype(p, size)
            except: pass
    return ImageFont.load_default()

def tw(draw, text, font):
    bb = draw.textbbox((0,0), text, font=font)
    return bb[2]-bb[0], bb[3]-bb[1]

# Brand name
fn = get_font(22)
draw.text((mx+35, my-12), 'Toolify AI', fill=WHITE, font=fn)
draw.text((mx+35, my+8),  '${c.name}', fill=ACCENT, font=get_font_reg(16))

# Divider line
draw.rectangle([48, 100, W-48, 101], fill=tuple(min(255,c+15) for c in BG))

# Main text — wrapped
text  = '${safeText}'
lines = []
for para in text.split('\\\\n'):
    if para.strip():
        wrapped = textwrap.wrap(para.strip(), width=42)
        lines.extend(wrapped[:3])
        if len(lines) >= 8: break

font_main = get_font(${cfg.h > 640 ? 42 : 38})
font_body = get_font_reg(28)

# First line is headline — bigger
y = 130
if lines:
    draw.text((60, y), lines[0], fill=WHITE, font=font_main)
    y += 60

for line in lines[1:6]:
    draw.text((60, y), line, fill=MUTED, font=font_body)
    y += 42

# Bottom bar
draw.rectangle([0, H-64, W, H], fill=DARK2)

# Product pill
product_text = '${c.name}  ·  sahilsingh.co.in'
fp = get_font_reg(20)
draw.text((60, H-42), product_text, fill=MUTED, font=fp)

# Platform tag right
date_str = '${date || new Date().toLocaleDateString("en-IN")}'
dt_w, _ = tw(draw, date_str, fp)
draw.text((W-dt_w-60, H-42), date_str, fill=MUTED, font=fp)

# Accent dot cluster bottom right
for dx, dy, dr in [(W-40, H-90, 7), (W-24, H-100, 5), (W-32, H-112, 4)]:
    draw.ellipse([dx-dr, dy-dr, dx+dr, dy+dr], fill=(45,203,143))

img.save('${outPath.replace(/\\/g, '/')}', 'PNG', quality=97)
print('ok')
`

      const result = execSync(`python3 -c "${py.replace(/"/g, '\\"')}"`, {
        timeout: 15000,
        encoding: 'utf8'
      }).trim()

      if (result === 'ok' && fs.existsSync(outPath)) {
        this.orchestrator.broadcast({
          type: 'task',
          message: `[IMAGE] ✅ Generated ${platform} image → ${filename}`,
          level: 'success'
        })
        return outPath
      }
      return null

    } catch (err) {
      // Non-fatal — just skip image
      this.orchestrator.broadcast({
        type: 'task',
        message: `[IMAGE] Image generation skipped: ${err.message.slice(0, 60)}`,
        level: 'info'
      })
      return null
    }
  }

  // ── Generate images for a full content batch
  async generateBatchImages(content) {
    if (!this.canGenerate || !content) return {}

    this.orchestrator.broadcast({ type: 'task', message: '[IMAGE] Generating social media images...', level: 'info' })

    const images = {}
    const product = content.product || 'default'
    const date    = new Date().toLocaleDateString('en-IN')

    // LinkedIn image
    if (content.linkedin?.text) {
      images.linkedin = await this.generatePostImage({
        text:     content.linkedin.text,
        platform: 'linkedin',
        product,
        date,
      })
    }

    // Twitter image (use first tweet as text)
    if (content.twitter && Array.isArray(content.twitter) && content.twitter[0]) {
      images.twitter = await this.generatePostImage({
        text:     content.twitter[0],
        platform: 'twitter',
        product,
        date,
      })
    }

    const generated = Object.values(images).filter(Boolean).length
    if (generated > 0) {
      this.orchestrator.broadcast({
        type: 'task',
        message: `[IMAGE] ✅ Generated ${generated} post image(s)`,
        level: 'success'
      })
    }

    return images
  }

  // ── Clean up old images (keep last 30)
  async cleanup() {
    try {
      const files = fs.readdirSync(this.outputDir)
        .filter(f => f.endsWith('.png'))
        .map(f => ({ name: f, time: fs.statSync(path.join(this.outputDir, f)).mtimeMs }))
        .sort((a, b) => b.time - a.time)

      files.slice(30).forEach(f => {
        fs.unlinkSync(path.join(this.outputDir, f.name))
      })
    } catch {}
  }
}

module.exports = ImageAgent
