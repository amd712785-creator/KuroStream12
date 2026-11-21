import { getBackendApiOrigin } from '@/src/config/env';
import { auth } from '@/src/lib/firebase';

export const SESSION_EXPIRED_EVENT = 'kurostream:session-expired';

let lastExpiredDispatchAt = 0;

export function notifySessionExpired(
  message = 'Your session has expired. Please sign in again.'
): void {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  if (now - lastExpiredDispatchAt < 1500) return;
  lastExpiredDispatchAt = now;
  window.dispatchEvent(
    new CustomEvent(SESSION_EXPIRED_EVENT, {
      detail: { message },
    })
  );
}

export function isBackendApiUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('/api/')) return true;
  const backendOrigin = getBackendApiOrigin();
  if (backendOrigin && url.startsWith(`${backendOrigin}/api/`)) return true;
  if (typeof window !== 'undefined' && window.location?.origin) {
    if (url.startsWith(`${window.location.origin}/api/`)) return true;
  }
  return false;
}

export async function getFreshFirebaseIdToken(forceRefresh = false): Promise<string | null> {
  const currentUser = auth?.currentUser;
  if (!currentUser) return null;

  try {
    let token = await currentUser.getIdToken(forceRefresh);
    if (typeof token !== 'string' || token.split('.').length !== 3) {
      if (!forceRefresh) {
        token = await currentUser.getIdToken(true);
      }
    }
    return typeof token === 'string' && token.split('.').length === 3 ? token : null;
  } catch (err) {
    const code = (err as { code?: string } | null)?.code || '';
    if (
      code === 'auth/user-token-expired' ||
      code === 'auth/invalid-user-token' ||
      code === 'auth/user-disabled' ||
      code === 'auth/user-not-found' ||
      code === 'auth/requires-recent-login'
    ) {
      notifySessionExpired('Your session has expired. Please sign in again.');
      return null;
    }

    if (!forceRefresh) {
      try {
        const retried = await currentUser.getIdToken(true);
        return typeof retried === 'string' && retried.split('.').length === 3 ? retried : null;
      } catch (retryErr) {
        const retryCode = (retryErr as { code?: string } | null)?.code || '';
        if (
          retryCode === 'auth/user-token-expired' ||
          retryCode === 'auth/invalid-user-token' ||
          retryCode === 'auth/user-disabled' ||
          retryCode === 'auth/user-not-found'
        ) {
          notifySessionExpired('Your session has expired. Please sign in again.');
        }
        return null;
      }
    }
    return null;
  }
}

export async function authorizedApiFetch(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = 15000, headers: callerHeaders, ...restInit } = options;

  const token = await getFreshFirebaseIdToken(false);
  if (!token) {
    notifySessionExpired('Please sign in to continue.');
    return new Response(
      JSON.stringify({
        error: 'Authentication required. Please sign in to access video content.',
        code: 'MISSING_TOKEN',
      }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const execute = async (bearerToken: string): Promise<Response> => {
    const headers = new Headers(callerHeaders || {});
    headers.set('Authorization', `Bearer ${bearerToken}`);
    if (!headers.has('Accept')) {
      headers.set('Accept', 'application/json');
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        ...restInit,
        headers,
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timer);
    }
  };

  let res = await execute(token);

  if (res.status === 401) {
    const refreshedToken = await getFreshFirebaseIdToken(true);
    if (refreshedToken) {
      res = await execute(refreshedToken);
    }
    if (res.status === 401) {
      notifySessionExpired('Your session has expired. Please sign in again.');
    }
  }

  return res;
}
