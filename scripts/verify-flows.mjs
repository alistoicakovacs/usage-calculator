// End-to-end verification of flows 2-7 against the built dist/.
// Serves dist statically, drives it with Playwright, exercises the full flow,
// and asserts computed usage/cost/forecast appear. Saves screenshots.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const projDir = path.dirname(fileURLToPath(import.meta.url)) + '/..'
const dist = path.join(projDir, 'dist')
const shotDir = path.join(projDir, 'verify-shots')
fs.mkdirSync(shotDir, { recursive: true })

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
  try {
    let urlPath = decodeURIComponent(req.url.split('?')[0])
    if (urlPath.startsWith('/usage-calculator')) urlPath = urlPath.slice('/usage-calculator'.length)
    if (urlPath === '/' || urlPath === '') urlPath = '/index.html'
    let filePath = path.join(dist, urlPath)
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(dist, 'index.html')
    }
    res.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream' })
    fs.createReadStream(filePath).pipe(res)
  } catch (e) {
    res.writeHead(500)
    res.end(String(e))
  }
})

const BASE = 'http://127.0.0.1:4173/usage-calculator/'
const fails = []
function check(cond, msg) {
  if (cond) console.log('  PASS: ' + msg)
  else {
    console.log('  FAIL: ' + msg)
    fails.push(msg)
  }
}

await new Promise((r) => server.listen(4173, '127.0.0.1', r))

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message))

async function shot(name) {
  await page.screenshot({ path: path.join(shotDir, name + '.png') })
}

try {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)

  // Fresh state: clear any prior IndexedDB from earlier runs.
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases?.()
    if (dbs) for (const d of dbs) if (d.name) indexedDB.deleteDatabase(d.name)
    localStorage.clear()
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(300)

  console.log('Flow: empty home')
  check((await page.textContent('h1')) === 'Zählerstand', 'home title shows Zählerstand')
  check(await page.getByText('Immobilie hinzufügen').first().isVisible(), 'add-property CTA visible')
  await shot('01-empty-home')

  console.log('Flow 2: add property')
  await page.getByText('Immobilie hinzufügen').first().click()
  await page.waitForTimeout(200)
  await page.fill('input[placeholder*="Haus"]', 'Haus Mühlhausen')
  await page.fill('input[placeholder="99974"]', '99974')
  await page.getByRole('button', { name: 'Speichern' }).click()
  await page.waitForTimeout(300)
  check((await page.textContent('h1')) === 'Haus Mühlhausen', 'navigated to property screen')
  await shot('02-property')

  console.log('Flow 3: add electricity meter')
  await page.getByRole('button', { name: /Zähler hinzufügen/ }).click()
  await page.waitForTimeout(150)
  await page.selectOption('select', 'electricity')
  await page.fill('input[placeholder*="Hauptzähler"]', 'Strom Haupt')
  await page.getByRole('button', { name: 'Anlegen' }).click()
  await page.waitForTimeout(300)
  check(await page.getByText('Strom Haupt').first().isVisible(), 'meter appears on property')
  await shot('03-meter-added')

  console.log('Flow 5+6: baseline + second reading')
  await page.getByRole('button', { name: 'Stand eintragen' }).first().click()
  await page.waitForTimeout(250)
  check((await page.textContent('h1')) === 'Stand eintragen', 'on reading form')
  await page.fill('input[type="date"]', '2026-01-01')
  await page.fill('input[inputmode="decimal"]', '1000')
  await page.getByRole('button', { name: 'Speichern' }).click()
  await page.waitForTimeout(300)
  // now on meter screen; add second reading
  await page.getByRole('button', { name: 'Stand eintragen' }).first().click()
  await page.waitForTimeout(250)
  await page.fill('input[type="date"]', '2026-01-31')
  await page.fill('input[inputmode="decimal"]', '1150,5')
  await page.getByRole('button', { name: 'Speichern' }).click()
  await page.waitForTimeout(400)

  console.log('Flow 6: interval usage visible on meter screen')
  const meterText = await page.textContent('.app-shell')
  check(/150,5\s*kWh/.test(meterText), 'interval usage 150,5 kWh shown')
  check(/30 Tage/.test(meterText), '30-day interval shown')
  await shot('04-usage')

  console.log('Flow 4: tariff config')
  await page.getByRole('button', { name: /Tarif ab Datum/ }).click()
  await page.waitForTimeout(150)
  await page.fill('input[type="date"]', '2025-01-01')
  const dec = page.locator('input[inputmode="decimal"]')
  await dec.nth(0).fill('0,30')
  await dec.nth(1).fill('120')
  await page.getByRole('button', { name: 'Speichern' }).click()
  await page.waitForTimeout(400)
  const afterTariff = await page.textContent('.app-shell')
  check(/€\/kWh/.test(afterTariff), 'tariff price shown')
  // interval cost: usage 150.5 * 0.30 = 45.15 + base 120/yr * 30/365 = 9.86 → 55.01 EUR
  check(/55,01\s*€/.test(afterTariff), 'interval total cost 55,01 EUR (usage + base) shown')
  await shot('05-tariff-cost')

  console.log('Flow 4b: billing period + Flow 7 forecast')
  await page.getByRole('button', { name: /Zeitraum anlegen/ }).click()
  await page.waitForTimeout(150)
  const dates = page.locator('input[type="date"]')
  await dates.nth(0).fill('2026-01-01')
  await dates.nth(1).fill('2026-12-31')
  await page.locator('input[inputmode="decimal"]').last().fill('80')
  await page.getByRole('button', { name: 'Speichern' }).click()
  await page.waitForTimeout(500)
  const withForecast = await page.textContent('.app-shell')
  check(/Prognose Abrechnungsjahr/.test(withForecast), 'forecast card appears')
  check(/Nachzahlung|Guthaben/.test(withForecast), 'Guthaben/Nachzahlung shown')
  await shot('06-forecast')

  console.log('Flow 7: forecast on home')
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  const home = await page.textContent('.app-shell')
  check(/Prognose:/.test(home), 'home shows property forecast')
  check(/Haus Mühlhausen/.test(home), 'home shows property name')
  await shot('07-home-forecast')

  console.log('Persistence: reload keeps data')
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  check(/Haus Mühlhausen/.test(await page.textContent('.app-shell')), 'data persists across reload')

  check(errors.length === 0, 'no console/page errors (' + JSON.stringify(errors).slice(0, 300) + ')')
} catch (e) {
  console.log('EXCEPTION: ' + e.message)
  fails.push('exception: ' + e.message)
  await shot('99-exception')
} finally {
  await browser.close()
  server.close()
}

console.log('\n' + (fails.length === 0 ? 'ALL PASS' : 'FAILURES: ' + fails.length))
process.exit(fails.length === 0 ? 0 : 1)
