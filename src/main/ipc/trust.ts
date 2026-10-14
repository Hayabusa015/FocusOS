import type { TrustCheck } from './handle';

/** True when `url` belongs to the app's own renderer (the built file, or the dev server). */
export function isAppUrl(url: string, devServerUrl: string | undefined): boolean {
  if (devServerUrl && url.startsWith(devServerUrl)) return true;
  return url.startsWith('file://') && /\/renderer\/index\.html(?:[?#].*)?$/.test(url);
}

export function makeTrustCheck(devServerUrl: string | undefined): TrustCheck {
  return (event) => {
    const url = event.senderFrame?.url;
    return typeof url === 'string' && isAppUrl(url, devServerUrl);
  };
}
