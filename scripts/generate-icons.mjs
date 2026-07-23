// One-off script: generates the PWA gauge icons (pwa-192.png, pwa-512.png) into public/.
// Rerun with: node scripts/generate-icons.mjs
import zlib from 'node:zlib'
import fs from 'node:fs'

function crc32(buf) {
  const t = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  let c = 0xffffffff
  for (const x of buf) c = t[(c ^ x) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const l = Buffer.alloc(4)
  l.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const cr = Buffer.alloc(4)
  cr.writeUInt32BE(crc32(td))
  return Buffer.concat([l, td, cr])
}

function png(s) {
  const px = Buffer.alloc(s * s * 4)
  const cx = s / 2
  const cy = s / 2
  const rR = s * 0.34
  const rw = s * 0.055
  const bg = [15, 23, 42]
  const ring = [51, 65, 85]
  const arc = [56, 189, 248]
  const nc = [226, 232, 240]
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const dx = x - cx
      const dy = y - cy
      const d = Math.sqrt(dx * dx + dy * dy)
      let c = bg
      if (Math.abs(d - rR) < rw) {
        const deg = (Math.atan2(dy, dx) * 180) / Math.PI
        if (!(deg > 55 && deg < 125)) c = deg > 90 || deg < -35 ? arc : ring
      }
      const na = (-125 * Math.PI) / 180
      const nx = Math.cos(na)
      const ny = Math.sin(na)
      const proj = dx * nx + dy * ny
      const perp = Math.abs(dx * -ny + dy * nx)
      if (proj > 0 && proj < rR * 0.85 && perp < s * 0.03) c = nc
      if (d < s * 0.045) c = nc
      const i = (y * s + x) * 4
      px[i] = c[0]
      px[i + 1] = c[1]
      px[i + 2] = c[2]
      px[i + 3] = 255
    }
  }
  const raw = Buffer.alloc(s * (s * 4 + 1))
  for (let y = 0; y < s; y++) {
    raw[y * (s * 4 + 1)] = 0
    px.copy(raw, y * (s * 4 + 1) + 1, y * s * 4, (y + 1) * s * 4)
  }
  const ih = Buffer.alloc(13)
  ih.writeUInt32BE(s, 0)
  ih.writeUInt32BE(s, 4)
  ih[8] = 8
  ih[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ih),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

fs.writeFileSync('public/pwa-192.png', png(192))
fs.writeFileSync('public/pwa-512.png', png(512))
console.log('icons written')
