import axios, { type AxiosError, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import * as Device from 'expo-device';
import config from '../config';
import { classifyCoreLoopRequest } from '../services/telemetry/coreLoopEvents';
import { addBreadcrumb, captureMessage } from '../services/telemetry';
import { reportReachable, reportUnreachable } from '../services/connectivity';
import { nextGetRetryDelay } from './getRetry';

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

type RetryableConfig = AxiosRequestConfig & { tpsRetryCount?: number; tpsNoRetry?: boolean };

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

client.interceptors.response.use(
  (response: AxiosResponse) => {
    reportReachable();
    recordCoreLoopResponse(response.config?.method, response.config?.url, response.status);
    return response;
  },
  async (error: AxiosError) => {
    if (axios.isCancel(error)) return Promise.reject(error);
    if (error.response) reportReachable();
    const config = error.config as RetryableConfig | undefined;
    const delay = nextGetRetryDelay(config, error);
    if (config && delay !== null) {
      config.tpsRetryCount = (config.tpsRetryCount ?? 0) + 1;
      await wait(delay);
      return client.request(config);
    }
    if (!error.response) reportUnreachable();
    recordCoreLoopResponse(config?.method, config?.url, error.response?.status);
    return Promise.reject(error);
  },
);

export default client;
