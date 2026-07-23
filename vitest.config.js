import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'

export default defineConfig({
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
