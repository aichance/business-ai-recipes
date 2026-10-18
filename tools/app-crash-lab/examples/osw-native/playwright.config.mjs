import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'stale-thumbnail.spec.mjs',timeout:120000,workers:1,reporter:'list',outputDir:process.env.CRASHLAB_OUTPUT,use:{baseURL:process.env.APP_URL,locale:'en-US',serviceWorkers:'block',storageState:{cookies:[],origins:[]},trace:'retain-on-failure'}});
