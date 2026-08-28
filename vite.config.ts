/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/tuffcomp/' : '/',
  plugins: [react(), tailwindcss()],
  test: {
    // players.json is ~4.6MB; its first cold import can blow the default
    // 5s hook timeout and flake the suite. Give data loading real room.
    testTimeout: 20000,
    hookTimeout: 30000,
  },
})
