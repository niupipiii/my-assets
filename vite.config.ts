import { execSync } from 'node:child_process'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const gitSha = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'nogit'
  }
})()

const BUILD_ID = `${gitSha}-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 12)}`

function localOcrApi(mode: string): Plugin {
  return {
    name: 'local-ocr-api',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv(mode, process.cwd(), '')
      for (const [key, value] of Object.entries(env)) {
        if (key.startsWith('OCR_') && process.env[key] === undefined) process.env[key] = value
      }
      server.middlewares.use('/api/ocr', async (req, res) => {
        try {
          const { default: handler } = await server.ssrLoadModule('/api/ocr.ts')
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(Buffer.from(chunk))
          const raw = Buffer.concat(chunks).toString('utf8')
          let body: unknown
          if (raw) {
            try {
              body = JSON.parse(raw)
            } catch {
              body = raw
            }
          }
          const url = new URL(req.url ?? '/', 'http://127.0.0.1')
          const query: Record<string, string> = {}
          url.searchParams.forEach((value, key) => {
            query[key] = value
          })
          const vReq = Object.assign(req, { body, query })
          const vRes = Object.assign(res, {
            status(code: number) {
              res.statusCode = code
              return vRes
            },
            json(data: unknown) {
              res.setHeader('content-type', 'application/json; charset=utf-8')
              res.end(JSON.stringify(data))
              return vRes
            },
          })
          await handler(vReq as never, vRes as never)
        } catch (error) {
          res.statusCode = 500
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ ok: false, error: { code: 'dev_api_failed', message: String(error) } }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => ({
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [
    react(),
    localOcrApi(mode),
    tailwindcss(),
    {
      name: 'asset-build-id',
      transformIndexHtml(html) {
        return html.replace('%BUILD_ID%', BUILD_ID)
      },
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ buildId: BUILD_ID, builtAt: new Date().toISOString() }),
        })
      },
    },
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.svg', 'legacy-export.html'],
      manifest: {
        id: '/',
        name: '资产全景',
        short_name: '资产全景',
        description: '每月资产余额、工资与净开销推导',
        lang: 'zh-CN',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F2F2F7',
        theme_color: '#F2F2F7',
        categories: ['finance', 'productivity'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/legacy-export/],
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        skipWaiting: false,
        runtimeCaching: [
          {
            urlPattern: /\/api\/ocr/,
            handler: 'NetworkOnly',
            method: 'POST',
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    target: ['safari16'],
    sourcemap: true,
  },
}))
