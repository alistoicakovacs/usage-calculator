// End-to-end verification of Phase 4: two independent browser profiles sync a
// dataset through the real worker.
//
// Nothing here is stubbed. The worker runs under `wrangler dev` (workerd, the
// same runtime Cloudflare deploys), the app is the built dist/, and each
// browser context has its own IndexedDB — so this is the first check that the
// real client, real crypto and real server agree with each other.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const projDir = path.dirname(fileURLToPath(import.meta.url)) + '/..'
const dist = path.join(projDir, 'dist')
const shotDir = path.join(projDir, 'verify-shots')
fs.mkdirSync(shotDir, { recursive: true })

const APP_PORT = 4178
const WORKER_PORT = 8787
const BASE = `http://localhost:${APP_PORT}/usage-calculator/`

// Set SYNC_URL to run the same checks against a deployed worker instead of a
// local one. The app is still served locally either way — what changes is
// which server it talks to.
const SYNC_URL = process.env.SYNC_URL ?? `http://localhost:${WORKER_PORT}`
const USE_LOCAL_WORKER = process.env.SYNC_URL === undefined

const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0])
  if (urlPath.startsWith('/usage-calculator')) urlPath = urlPath.slice('/usage-calculator'.length)
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html'
  let filePath = path.join(dist, urlPath)
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(dist, 'index.html')
  }
  res.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream' })
  fs.createReadStream(filePath).pipe(res)
})

const fails = []
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) fails.push(label)
}

async function waitForWorker(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      // Any answer at all means workerd is listening; 401 is the expected
      // reply to an unauthenticated pull.
      const res = await fetch(`${SYNC_URL}/vault/probe/pull?since=0`)
      if (res.status === 401) return true
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

const worker = USE_LOCAL_WORKER
  ? spawn('npx', ['wrangler', 'dev', '--port', String(WORKER_PORT), '--local'], {
      cwd: path.join(projDir, 'worker'),
      stdio: ['ignore', 'pipe', 'pipe'],
      // Node refuses to spawn a .cmd shim directly on Windows.
      shell: process.platform === 'win32',
    })
  : undefined
worker?.stdout.on('data', (d) => process.env.VERBOSE && console.log('[worker]', String(d).trim()))
worker?.stderr.on('data', (d) => process.env.VERBOSE && console.log('[worker!]', String(d).trim()))

server.listen(APP_PORT)

let browser
try {
  console.log(`Sync server: ${SYNC_URL}${USE_LOCAL_WORKER ? ' (wrangler dev)' : ' (deployed)'}`)
  check(await waitForWorker(), 'the sync worker answers')
  if (fails.length) throw new Error('worker not reachable')

  browser = await chromium.launch()

  // Each context is a separate device: its own IndexedDB, its own vault key.
  const deviceA = await browser.newContext()
  const deviceB = await browser.newContext()
  const a = await deviceA.newPage()
  const b = await deviceB.newPage()

  const errors = []
  for (const [name, page] of [
    ['A', a],
    ['B', b],
  ]) {
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
    page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`))
  }
  const shot = (page, name) => page.screenshot({ path: path.join(shotDir, `sync-${name}.png`) })

  // ---- Device A: create a vault and put something in it ----
  console.log('\nDevice A: create vault')
  await a.goto(BASE, { waitUntil: 'networkidle' })
  await a.getByRole('button', { name: /neuen tresor anlegen/i }).click()
  await a.getByRole('button', { name: /ich habe den schlüssel gesichert/i }).click()
  await a.waitForSelector('.app-header')
  check(/Zählerstand/.test(await a.textContent('.app-header')), 'A reached the app')

  console.log('Device A: point at the sync server')
  await a.goto(`${BASE}#/sync`, { waitUntil: 'networkidle' })
  await a.getByLabel(/sync-server/i).fill(SYNC_URL)
  await a.getByRole('button', { name: /speichern/i }).click()
  await a.waitForTimeout(300)

  console.log('Device A: add a property')
  await a.goto(BASE, { waitUntil: 'networkidle' })
  await a.getByRole('link', { name: /immobilie hinzufügen/i }).click()
  await a.getByLabel(/bezeichnung/i).fill('Haus Mühlhausen')
  await a.getByLabel(/postleitzahl/i).fill('99974')
  await a.getByRole('button', { name: /speichern/i }).click()
  await a.waitForTimeout(400)
  check(/Haus Mühlhausen/.test(await a.textContent('.app-shell')), 'A shows the new property')

  console.log('Device A: sync')
  await a.goto(`${BASE}#/sync`, { waitUntil: 'networkidle' })
  await a.getByRole('button', { name: /jetzt synchronisieren/i }).click()
  await a.waitForTimeout(1500)
  const statusA = await a.textContent('.sync-status')
  check(/Aktuell/.test(statusA), `A reports itself in sync (got: ${statusA.trim()})`)
  await shot(a, 'a-synced')

  console.log('Device A: read the pairing details')
  await a.getByRole('button', { name: /gerät koppeln/i }).click()
  await a.waitForSelector('.pairing-qr')
  const monoBlocks = await a.$$eval('.mono-block', (els) => els.map((e) => e.textContent.trim()))
  const [vaultId, recoveryKey] = monoBlocks
  check(Boolean(vaultId && recoveryKey), 'A shows a vault id and a recovery key')
  check((await a.$('.pairing-qr')) !== null, 'A renders a scannable pairing code')
  await shot(a, 'a-pairing')

  // ---- Device B: join by the pairing link, then pull ----
  console.log('\nDevice B: follow the pairing link')
  // The same payload the QR encodes: vault, key, and the server to reach it on.
  const pairUrl =
    `${BASE}#/pair?id=${encodeURIComponent(vaultId)}` +
    `&k=${encodeURIComponent(recoveryKey)}&s=${encodeURIComponent(SYNC_URL)}`
  await b.goto(pairUrl, { waitUntil: 'networkidle' })
  await b.waitForTimeout(600)
  const headerB = await b.textContent('.app-header')
  check(!/Willkommen/.test(await b.textContent('.app-shell')), 'B skipped the first-run screen')
  check(/Zählerstand/.test(headerB), 'B joined the vault from the link')
  check(!/k=/.test(b.url()), 'B wiped the key out of its address bar')

  console.log('Device B: sync without being configured by hand')
  await b.goto(`${BASE}#/sync`, { waitUntil: 'networkidle' })
  await b.waitForTimeout(300)
  const serverOnB = await b.getByLabel(/sync-server/i).inputValue()
  check(serverOnB === SYNC_URL, `B took the server from the pairing link (got: ${serverOnB})`)
  await b.getByRole('button', { name: /jetzt synchronisieren/i }).click()
  await b.waitForTimeout(2000)

  await b.goto(BASE, { waitUntil: 'networkidle' })
  await b.waitForTimeout(500)
  const homeB = await b.textContent('.app-shell')
  check(/Haus Mühlhausen/.test(homeB), "B received A's property")
  await shot(b, 'b-received')

  // ---- The server must hold ciphertext only ----
  console.log('\nServer: check what it actually stores')
  const token = await a.evaluate(async (id) => {
    // Recompute the bearer the app uses, so we can read the vault as it does.
    const raw = await new Promise((resolve, reject) => {
      const req = indexedDB.open('usage-calculator')
      req.onerror = () => reject(req.error)
      req.onsuccess = () => {
        const tx = req.result.transaction('localState', 'readonly')
        const get = tx.objectStore('localState').get('vaultRawKey')
        get.onsuccess = () => resolve(get.result?.value)
        get.onerror = () => reject(get.error)
      }
    })
    const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0))
    const key = await crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`sync-token:${id}`))
    return btoa(String.fromCharCode(...new Uint8Array(sig)))
  }, vaultId)

  const stored = await (
    await fetch(`${SYNC_URL}/vault/${encodeURIComponent(vaultId)}/pull?since=0`, {
      headers: { authorization: `Bearer ${token}` },
    })
  ).json()
  const raw = JSON.stringify(stored)
  check(stored.records.length > 0, `server holds ${stored.records.length} record(s)`)
  check(!/Mühlhausen/.test(raw), 'server never sees the property label')
  check(!/99974/.test(raw), 'server never sees the postal code')

  // ---- A second round must be a no-op, not a ping-pong ----
  console.log('\nBoth devices: a quiet second round')
  const versionBefore = stored.version
  await a.goto(`${BASE}#/sync`, { waitUntil: 'networkidle' })
  await a.getByRole('button', { name: /jetzt synchronisieren/i }).click()
  await a.waitForTimeout(1200)
  await b.goto(`${BASE}#/sync`, { waitUntil: 'networkidle' })
  await b.getByRole('button', { name: /jetzt synchronisieren/i }).click()
  await b.waitForTimeout(1200)
  const after = await (
    await fetch(`${SYNC_URL}/vault/${encodeURIComponent(vaultId)}/pull?since=0`, {
      headers: { authorization: `Bearer ${token}` },
    })
  ).json()
  check(
    after.version === versionBefore,
    `settled devices stop pushing (version ${versionBefore} -> ${after.version})`,
  )

  check(errors.length === 0, `no console/page errors (${JSON.stringify(errors).slice(0, 300)})`)
} catch (e) {
  console.log('EXCEPTION: ' + e.message)
  fails.push('exception: ' + e.message)
} finally {
  if (browser) await browser.close()
  server.close()
  worker?.kill()
}

console.log('\n' + (fails.length === 0 ? 'ALL PASS' : 'FAILURES: ' + fails.length))
process.exit(fails.length === 0 ? 0 : 1)
