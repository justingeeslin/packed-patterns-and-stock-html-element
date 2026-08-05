import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'

const packaideIrregularStockEndpoint =
  process.env.PACKAIDE_IRREGULAR_STOCK_ENDPOINT || ""
const packaideIrregularStockUrl = (() => {
  if (!packaideIrregularStockEndpoint) return null

  try {
    return new URL(packaideIrregularStockEndpoint)
  } catch {
    return null
  }
})()
const packaideIrregularStockProxyPath = packaideIrregularStockUrl
  ? "/__packaide_irregular_stock"
  : ""

export default defineConfig({
  define: {
    __PACKAIDE_IRREGULAR_STOCK_ENDPOINT__: JSON.stringify(
      packaideIrregularStockProxyPath
    ),
  },
  server: {
    proxy: packaideIrregularStockUrl
      ? {
          [packaideIrregularStockProxyPath]: {
            target: packaideIrregularStockUrl.origin,
            changeOrigin: true,
            rewrite: () =>
              `${packaideIrregularStockUrl.pathname}${packaideIrregularStockUrl.search}`,
          },
        }
      : {},
  },
  test: {
    browser: {
      enabled: true,
      provider: playwright(),
      // https://vitest.dev/config/browser/playwright
      instances: [
        {
        
          browser: "firefox"
        
        }
      ],
    },
    coverage: {
      provider: "istanbul",
      reporter: [
        "text",
        "html",
        "lcov"
      ],
      
      reportsDirectory: "./coverage",
      
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 70
      }
    }
  },
})
