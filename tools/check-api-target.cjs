#!/usr/bin/env node
// Release gate for the API baked into an EAS build profile.
//
// Store profiles (distribution "store") must point at a stable public HTTPS
// host: tunnels (trycloudflare, ngrok, localtunnel), localhost and private
// network addresses are rejected before any network call. The live check then
// requires the crumbs payload AND a 401 from an authenticated core-loop route,
// which proves the backend actually has the core loop deployed (a 404 there
// means the build would ship against a server without it).
//
// Development profiles bake no API URL: the dev client loads its bundle and
// EXPO_PUBLIC_API_URL from Metro, so they are skipped.
const fs = require('node:fs');
const path = require('node:path');

const CORE_LOOP_PROBES = ['/me/trip-goal', '/me/task-attempts/0'];

const TUNNEL_HOSTS = [
  /(^|\.)trycloudflare\.com$/i,
  /(^|\.)ngrok(-free)?\.(io|app|dev)$/i,
  /(^|\.)ngrok\.com$/i,
  /(^|\.)loca\.lt$/i,
  /(^|\.)localtunnel\.me$/i,
  /(^|\.)serveo\.net$/i,
  /(^|\.)exp\.direct$/i,
];

function isPrivateHost(host) {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.test')) return true;
  if (h.includes(':')) return h === '::1' || h === '::' || /^(fc|fd|fe80)/.test(h);
  const ipv4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!ipv4) return false;
  const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
  return a === 127 || a === 10 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

/** Returns a human reason the URL is unsafe for a store build, or null when it is acceptable. */
function storeUrlProblem(apiUrl) {
  if (!apiUrl) return 'missing API_URL';
  let url;
  try { url = new URL(apiUrl); } catch { return `not a URL: ${apiUrl}`; }
  if (url.protocol !== 'https:') return 'API_URL must use HTTPS';
  if (isPrivateHost(url.hostname)) return `${url.hostname} is a local or private address`;
  if (TUNNEL_HOSTS.some(pattern => pattern.test(url.hostname))) return `${url.hostname} is an ephemeral tunnel`;
  if (url.hostname === 'dev-app.themeparkshark.com') return `${url.hostname} is the retired dev host`;
  return null;
}

/** Resolves `extends` chains the way EAS does (child keys win, env and ios merge). */
function resolveProfile(profiles, name, seen = new Set()) {
  const profile = profiles[name];
  if (!profile) throw new Error(`unknown build profile "${name}"`);
  if (seen.has(name)) throw new Error(`circular extends at "${name}"`);
  seen.add(name);
  const parent = profile.extends ? resolveProfile(profiles, profile.extends, seen) : {};
  return {
    ...parent,
    ...profile,
    env: { ...(parent.env || {}), ...(profile.env || {}) },
    ios: { ...(parent.ios || {}), ...(profile.ios || {}) },
  };
}

const isStoreProfile = profile => profile.distribution === 'store' || (!profile.distribution && !profile.ios?.simulator && profile.ios?.buildConfiguration !== 'Debug');

async function verifyLiveTarget(apiUrl, fetchImpl = fetch) {
  const base = apiUrl.replace(/\/$/, '');
  const request = url => fetchImpl(url, {
    signal: AbortSignal.timeout(12000),
    redirect: 'error',
    headers: { Accept: 'application/json' },
  });
  const crumbs = await request(`${base}/crumbs`);
  const contentType = crumbs.headers.get('content-type') || '';
  if (!crumbs.ok || !contentType.includes('application/json')) {
    throw new Error(`${base}/crumbs returned HTTP ${crumbs.status}, content type ${contentType || 'missing'}`);
  }
  const body = await crumbs.json();
  if (!body?.data?.labels || !body?.data?.errors) throw new Error(`${base}/crumbs is not the Theme Park Shark crumbs payload`);
  for (const probe of CORE_LOOP_PROBES) {
    const response = await request(`${base}${probe}`);
    if (response.status !== 401) {
      throw new Error(`${base}${probe} returned HTTP ${response.status}, expected 401 (core-loop route missing or unprotected)`);
    }
  }
}

async function checkProfile(name, { easJson, fetchImpl = fetch, log = console.log } = {}) {
  const profiles = (easJson || JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'eas.json'), 'utf8'))).build;
  const profile = resolveProfile(profiles, name);
  const apiUrl = profile.env?.API_URL;
  if (!isStoreProfile(profile)) {
    if (apiUrl) throw new Error(`${name}: development profiles must not bake API_URL (Metro supplies EXPO_PUBLIC_API_URL)`);
    log(`${name}: development profile, API comes from Metro at runtime; nothing to verify`);
    return;
  }
  const problem = storeUrlProblem(apiUrl);
  if (problem) throw new Error(`${name}: ${problem}`);
  const publicUrl = profile.env?.EXPO_PUBLIC_API_URL;
  if (publicUrl && publicUrl !== apiUrl) throw new Error(`${name}: EXPO_PUBLIC_API_URL disagrees with API_URL`);
  await verifyLiveTarget(apiUrl, fetchImpl);
  log(`${name}: API target verified at ${apiUrl} (crumbs + core-loop routes)`);
}

module.exports = { storeUrlProblem, resolveProfile, isStoreProfile, verifyLiveTarget, checkProfile, CORE_LOOP_PROBES };

if (require.main === module) {
  checkProfile(process.argv[2] || 'production').catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
