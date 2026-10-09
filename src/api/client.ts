import axios, { type AxiosAdapter, type AxiosError, type AxiosResponse } from 'axios';
import * as Device from 'expo-device';
import config from '../config';
import { classifyCoreLoopRequest } from '../services/telemetry/coreLoopEvents';
import { addBreadcrumb, captureMessage } from '../services/telemetry';
import { reportReachable, reportUnreachable } from '../services/connectivity';
import { httpStatus, isNetworkFailure, isTimeout, withGetRetry } from './getRetry';
import { withInflightDedupe } from './dedupeGet';
import { withOwnStack } from '../utils/hermesSafeError';
import { isNonJsonBody, NON_JSON_BEFORE_OFFLINE, nonJsonError, withNonJsonRetry } from './jsonGuard';

const client = axios.create({
  baseURL: config.apiUrl,
  // Park connectivity can be poor; callers need a bounded failure so retry
  // and offline states appear instead of an indefinite loading screen.
  timeout: 12000,
});

// Device-Name is deliberately not sent: on iOS it is the owner's chosen
// device name (often their real name), which the API does not need.
client.defaults.headers.common['Is-Device'] = Device.isDevice ?? false;
client.defaults.headers.common['Manufacturer'] = Device.manufacturer ?? 'unknown';
client.defaults.headers.common['Model-Name'] = Device.modelName ?? 'unknown';
client.defaults.headers.common['OS-Version'] = Device.osVersion ?? 'unknown';

/**
 * Core-loop telemetry: a breadcrumb for every core-loop call, and one error
 * report when a core-loop call fails on the server or network. Only the
 * event name and status are recorded.
 */
export function recordCoreLoopResponse(
  method: string | undefined,
  url: string | undefined,
  status: number | undefined,
): void {
  const event = classifyCoreLoopRequest(method, url);
  if (!event) return;
  const ok = status !== undefined && status < 400;
  addBreadcrumb('core', event, { status: status ?? 0 }, ok ? 'info' : 'error');
  if (status === undefined || status >= 500) {
    captureMessage(`${event} failed`, 'error', { core_event: event, status: String(status ?? 'network') });
  }
}

// GET retry lives in the transport, below the interceptors, so every
// interceptor (here and in useAxiosSetup) runs once per logical request.
// Identical GETs already in flight share one request (dedupeGet.ts).
if (client.defaults.adapter) {
  client.defaults.adapter = withInflightDedupe(withGetRetry(withNonJsonRetry(client.defaults.adapter as AxiosAdapter))) as AxiosAdapter;
}

/**
 * Timeouts only count as offline when two land in a row with no response in
 * between: one slow endpoint on a working connection is not an outage.
 */
const TIMEOUTS_BEFORE_OFFLINE = 2;
let consecutiveTimeouts = 0;
let consecutiveNonJson = 0;

client.interceptors.response.use(
  (response: AxiosResponse) => {
    // A captive-portal page (hotel or park Wi-Fi sign-in) is not the server:
    // reject it like a dropped connection so no caller ever reads HTML as data.
    if (isNonJsonBody(response)) {
      // Scoped to this request: one odd reply never takes the whole app
      // offline. A GET gets one more try after a short pause; only a run of
      // them (a real captive portal answers everything) marks the app offline.
      // (The transport already gave a GET one more try: withNonJsonRetry.)
      consecutiveNonJson += 1;
      if (consecutiveNonJson >= NON_JSON_BEFORE_OFFLINE) reportUnreachable();
      recordCoreLoopResponse(response.config?.method, response.config?.url, undefined);
      return Promise.reject(withOwnStack(nonJsonError(response)));
    }
    consecutiveNonJson = 0;
    consecutiveTimeouts = 0;
    reportReachable();
    recordCoreLoopResponse(response.config?.method, response.config?.url, response.status);
    return response;
  },
  (error: AxiosError) => {
    // axios errors are not real Hermes errors: reading .stack throws. Give
    // every rejection its own stack before any handler or tracker reads it.
    withOwnStack(error);
    if (axios.isCancel(error)) return Promise.reject(error);
    // A status of 0 is React Native's "no response" (refused, dropped, offline).
    const status = httpStatus(error);
    if (status !== undefined) {
      consecutiveTimeouts = 0;
      consecutiveNonJson = 0;
      reportReachable();
    } else if (isNetworkFailure(error)) {
      reportUnreachable();
    } else if (isTimeout(error)) {
      consecutiveTimeouts += 1;
      if (consecutiveTimeouts >= TIMEOUTS_BEFORE_OFFLINE) reportUnreachable();
    }
    const config = error.config;
    recordCoreLoopResponse(config?.method, config?.url, status);
    return Promise.reject(error);
  },
);

// The default axios instance (the News feed) gets the same Hermes-safe stack.
// It also gets the non-JSON guard: a portal page is never a news feed.
axios.interceptors.response.use(
  (response: AxiosResponse) => (isNonJsonBody(response)
    ? Promise.reject(withOwnStack(nonJsonError(response)))
    : response),
  (error: unknown) => Promise.reject(withOwnStack(error)),
);

export default client;
