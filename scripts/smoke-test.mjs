import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'

const host = 'http://127.0.0.1:4173'
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], {
  stdio: 'ignore',
  env: process.env,
})
let ready = false

try {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null) throw new Error('Vite preview server exited before becoming ready.')
    try {
      const response = await fetch(host, { signal: AbortSignal.timeout(1500) })
      if (response.ok) { ready = true; break }
    } catch {
      // Wait for the preview server to bind its local port.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  assert.equal(ready, true, 'Vite preview server did not become ready within 15 seconds.')

  const pageResponse = await fetch(host)
  assert.equal(pageResponse.status, 200, 'Landing page must return HTTP 200.')
  assert.match(pageResponse.headers.get('content-type') || '', /text\/html/i)
  const html = await pageResponse.text()
  assert.match(html, /SOOULL — Your life\. Your legacy\./, 'Page title must be present.')
  assert.match(html, /viewport-fit=cover/, 'The mobile viewport must support safe-area insets.')
  assert.match(html, /apple-mobile-web-app-capable/, 'iOS home-screen app metadata must be present.')

  const assets = [...html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)].map((match) => match[1])
  assert.ok(assets.some((path) => path.endsWith('.js')), 'The built application JavaScript must be linked.')
  assert.ok(assets.some((path) => path.endsWith('.css')), 'The built application stylesheet must be linked.')
  const assetContents = new Map()
  for (const path of assets) {
    const response = await fetch(new URL(path, host))
    assert.equal(response.status, 200, 'Built asset failed to load: ' + path)
    assetContents.set(path, await response.text())
  }
  const javascript = [...assetContents.entries()].filter(([path]) => path.endsWith('.js')).map(([, body]) => body).join('\\n')
  const stylesheet = [...assetContents.entries()].filter(([path]) => path.endsWith('.css')).map(([, body]) => body).join('\\n')
  assert.ok(javascript.includes('Restore backup'), 'Backup restoration control must be in the application bundle.')
  assert.ok(javascript.includes('Phone number (optional)'), 'Phone number must remain optional in account forms.')
  const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.ok(appSource.includes('isValidInternationalPhone(normalizedPhone)') && appSource.includes('If you add a phone number'), 'Provided phone numbers must retain international-format validation.')
  const builtAssetNames = await readdir(new URL('../dist/assets/', import.meta.url))
  const vaultChunkName = builtAssetNames.find((name) => name.startsWith('VaultModule-') && name.endsWith('.js'))
  assert.ok(vaultChunkName, 'The lazy-loaded private assets module must be built.')
  const vaultChunkResponse = await fetch(new URL('/assets/' + vaultChunkName, host))
  assert.equal(vaultChunkResponse.status, 200, 'Private assets module failed to load.')
  const vaultJavascript = await vaultChunkResponse.text()
  assert.ok(vaultJavascript.includes('text/csv') && vaultJavascript.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), 'Bank statement and spreadsheet formats must be supported in the private assets module.')
  assert.ok(javascript.includes('SOOULL needs to reload.'), 'The application error recovery screen must be bundled.')
  assert.ok(stylesheet.includes('--card-dark') && stylesheet.includes('#151a23'), 'High-contrast dark card styling must be bundled.')
  assert.ok(stylesheet.includes('.member-nav button.active') && stylesheet.includes('#090d13'), 'Selected navigation must remain visibly dark.')

  const manifestResponse = await fetch(new URL('/manifest.webmanifest', host))
  assert.equal(manifestResponse.status, 200, 'PWA manifest must be available.')
  const manifest = await manifestResponse.json()
  assert.equal(manifest.short_name, 'SOOULL')
  assert.equal(manifest.display, 'standalone')
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'PWA icon must be configured.')

  const iconResponse = await fetch(new URL(manifest.icons[0].src, host))
  assert.equal(iconResponse.status, 200, 'PWA icon must load.')

  const workerResponse = await fetch(new URL('/sw.js', host))
  assert.equal(workerResponse.status, 200, 'Service worker must be available.')
  const worker = await workerResponse.text()
  assert.match(worker, /sooull-shell-v3/, 'Service worker cache version must be present.')
  assert.match(worker, /\/assets\//, 'Service worker must cache same-origin build assets.')
  assert.ok(worker.includes('Supabase auth, database,') && worker.includes('Storage and all private account responses are deliberately never cached.'), 'Service worker must explicitly avoid caching private data.')

  const robotsResponse = await fetch(new URL('/robots.txt', host))
  assert.equal(robotsResponse.status, 200, 'robots.txt must be available.')
  assert.match(await robotsResponse.text(), /sitemap\.xml/)

  const sitemapResponse = await fetch(new URL('/sitemap.xml', host))
  assert.equal(sitemapResponse.status, 200, 'sitemap.xml must be available.')
  assert.match(await sitemapResponse.text(), /https:\/\/sooull\.vercel\.app\//)

  console.log('SOOULL smoke tests passed: landing page, build assets, PWA manifest, icon, service worker, robots.txt and sitemap.xml.')
} finally {
  server.kill('SIGTERM')
}
