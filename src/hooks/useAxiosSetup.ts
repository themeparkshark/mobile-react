import { AxiosError, AxiosResponse } from 'axios';
import { isStandalonePreviewMode } from '../utils/standalonePreview';
import { useContext, useEffect, useRef } from 'react';
import client from '../api/client';
import { QUIET_COIN_BROADCAST, visibleBroadcasts } from '../api/broadcastFilter';

/** Reward banners fold into the header pills' +N (core loop, guide-map lane). */
export const REWARD_BANNERS_FOLDED = true;
import { AuthContext } from '../context/AuthProvider';
import { BroadcastContext } from '../context/BroadcastProvider';
import { showToast } from '../utils/toast';

/** Consecutive server-error counter: only toast after 3 in a row. */
let signingOut = false;
let consecutive500Count = 0;

/** True when the failed request carried a sign-in token (axios headers or a plain object). */
export function requestHadToken(error: Pick<AxiosError, 'config'> | null | undefined): boolean {
  const headers = error?.config?.headers as unknown as
    { get?: (name: string) => unknown; Authorization?: unknown; authorization?: unknown } | undefined;
  if (!headers) return false;
  const value = typeof headers.get === 'function' ? headers.get('Authorization') : headers.Authorization ?? headers.authorization;
  return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
}

export const SERVER_TROUBLE_TOAST = 'The Shark servers are busy. Hang tight and try again in a moment.';

/**
 * Global response handling: broadcasts, sign-out on 401 and a single
 * server-trouble toast. Being offline is shown by OfflineBanner, not a toast.
 *
 * The interceptor is registered once. The latest enqueue/logout are read
 * through refs so a re-created context callback is never stale.
 */
export const useAxiosSetup = () => {
  const { enqueue } = useContext(BroadcastContext);
  const { logout } = useContext(AuthContext);
  const enqueueRef = useRef(enqueue);
  const logoutRef = useRef(logout);
  enqueueRef.current = enqueue;
  logoutRef.current = logout;

  useEffect(() => {
    const interceptorId = client.interceptors.response.use(
      (response: AxiosResponse) => {
        consecutive500Count = 0;
        // A screen that shows the result itself (the stamp claim cascade and level-up plate) opts out of
        // every broadcast (skipBroadcasts), so the player never gets the same news twice. Watch opts out of
        // coin broadcasts only (QUIET_COIN_BROADCAST); its own reward moment shows the coins.
        const cfg = response.config as Record<string, unknown> | undefined;
        const skipAll = cfg?.skipBroadcasts === true;
        if (!skipAll && response.data && Array.isArray(response.data.broadcasts)) {
          // Core loop (BLUEPRINT row 329): every coin and Ticket reward flies into its header pill with +N, so the
          // server's "You earned N coins!" and "You earned N Tickets!" banners never show; server news still does.
          const shown = visibleBroadcasts<string>(response.data.broadcasts, REWARD_BANNERS_FOLDED || Boolean(cfg?.[QUIET_COIN_BROADCAST]));
          if (shown.length > 0) enqueueRef.current(shown);
        }
        return response;
      },
      (error: AxiosError) => {
        const status = error?.response?.status;
        // Dev previews render fixture players over the live API without a token: keep them on screen.
        // Only a request sent with a token can mean "your sign-in ran out". A guest
        // has nothing to sign out of: their 401 just means "sign in for this",
        // so they keep playing instead of being thrown back to the Login screen.
        if (status === 401 && requestHadToken(error) && !isStandalonePreviewMode()) {
          // Sign-out clears storage; a failure there must not become an
          // unhandled rejection on every 401.
          // Parallel requests with an expired token sign out once, not once each.
          if (!signingOut) {
            signingOut = true;
            Promise.resolve(logoutRef.current()).catch(() => undefined)
              .finally(() => { signingOut = false; });
          }
        }
        if (status && status >= 500) {
          consecutive500Count += 1;
          if (consecutive500Count === 3) {
            showToast(SERVER_TROUBLE_TOAST, 'warning');
          }
        } else if (status) {
          consecutive500Count = 0;
        }
        return Promise.reject(error);
      }
    );

    return () => {
      client.interceptors.response.eject(interceptorId);
    };
  }, []);
};
