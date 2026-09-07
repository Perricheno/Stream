/**
 * Common ad/tracker domains. Used two places: the resolver skips candidate
 * video URLs served from these hosts (so a page's ad creative never gets
 * mistaken for "the video"), and the client's blocklist mirrors this list
 * (see apps/web/public/sw.js) to stop the app's own requests from reaching them.
 */
export const AD_DOMAINS = [
  "doubleclick.net",
  "googlesyndication.com",
  "googleadservices.com",
  "google-analytics.com",
  "googletagmanager.com",
  "googletagservices.com",
  "adservice.google.com",
  "adnxs.com",
  "adsrvr.org",
  "taboola.com",
  "outbrain.com",
  "criteo.com",
  "criteo.net",
  "amazon-adsystem.com",
  "media.net",
  "pubmatic.com",
  "rubiconproject.com",
  "openx.net",
  "casalemedia.com",
  "scorecardresearch.com",
  "moatads.com",
  "adform.net",
  "bidswitch.net",
  "smartadserver.com",
  "yieldmo.com",
  "advertising.com",
  "adroll.com",
  "revcontent.com",
  "mgid.com",
  "propellerads.com",
  "popads.net",
  "exoclick.com",
  "juicyads.com",
  "trafficjunky.net",
  "adcolony.com",
  "applovin.com",
  "unityads.unity3d.com",
  "chartboost.com",
] as const;

export function isAdUrl(rawUrl: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  return AD_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}
