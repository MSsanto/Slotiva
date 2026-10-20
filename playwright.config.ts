import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir:'./e2e',fullyParallel:false,workers:1,retries:0,
  use:{baseURL:'http://localhost:5173',trace:'retain-on-failure'},
  webServer:{command:'npm run dev -- --host 127.0.0.1',url:'http://localhost:5173',reuseExistingServer:!process.env.CI},
})
