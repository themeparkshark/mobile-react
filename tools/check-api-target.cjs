#!/usr/bin/env node
// Read-only check for the API baked into an EAS build profile.
const fs = require('node:fs');
const path = require('node:path');

const profile = process.argv[2] || 'production';
const profiles = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'eas.json'), 'utf8')).build;
const apiUrl = profiles[profile]?.env?.API_URL;

if (!apiUrl || !/^https:\/\//.test(apiUrl)) {
  console.error(`${profile}: missing HTTPS API_URL`);
  process.exitCode = 1;
} else {
  const endpoint = `${apiUrl.replace(/\/$/, '')}/crumbs`;
  (async () => {
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(12000), redirect: 'error' });
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok || !contentType.includes('application/json')) {
        throw new Error(`HTTP ${response.status}, content type ${contentType || 'missing'}`);
      }
      const body = await response.json();
      if (!body?.data?.labels || !body?.data?.errors) {
        throw new Error('response is not the Theme Park Shark crumbs payload');
      }
      console.log(`${profile}: API target verified at ${endpoint}`);
    } catch (error) {
      console.error(`${profile}: API target failed at ${endpoint}: ${error.message}`);
      process.exitCode = 1;
    }
  })();
}
