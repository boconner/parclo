// Generates square PWA icons from the wide landscape logo (2560x991).
// Run once: node scripts/gen-icons.mjs
import sharp from 'sharp'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(__dirname, '../public/contento.png')
const OUT = path.join(__dirname, '../public')

const ASPECT = 2560 / 991   // source logo aspect ratio

// White background for regular icons; accent (#724fac) for maskable.
const WHITE  = { r: 255, g: 255, b: 255, alpha: 1 }
const ACCENT = { r: 114, g: 79,  b: 172, alpha: 1 }

async function make(size, filename, bg, logoWidthPct) {
  const logoW = Math.round(size * logoWidthPct)
  const logoH = Math.round(logoW / ASPECT)
  const left  = Math.round((size - logoW) / 2)
  const top   = Math.round((size - logoH) / 2)

  const logo = await sharp(SRC).resize(logoW, logoH, { fit: 'fill' }).toBuffer()

  await sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: logo, left, top }])
    .png()
    .toFile(path.join(OUT, filename))

  console.log(`✓  ${filename}  (${size}×${size}, logo ${logoW}×${logoH})`)
}

// Regular icons: logo fills ~70% of width, white background.
await make(192, 'icon-192.png',          WHITE, 0.70)
await make(512, 'icon-512.png',          WHITE, 0.70)
// Maskable icon: logo in safe zone (≈ 60% width), accent background.
// Safe zone = centre 80% circle → inscribed square ≈ 57% of icon width.
await make(512, 'icon-512-maskable.png', ACCENT, 0.55)
