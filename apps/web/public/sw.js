// Blocks known ad/tracker domains for requests made from this app's own
// origin (its own subresource requests, and the YouTube/Vimeo *iframe API
// script loads*, which run same-origin). Kept in sync by hand with
// apps/server/src/video/adDomains.ts.
//
// What this can't do: block ads rendered *inside* a cross-origin iframe
// (YouTube/Vimeo's own player, or the generic third-party embed fallback).
// A service worker only intercepts fetches made by documents within its own
// registration scope — a third-party iframe is a separate origin with its
// own (nonexistent) worker, invisible to this one. That's a browser
// same-origin boundary, not something any in-page script can work around.
const AD_DOMAINS = [
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
];

function isAdHost(hostname) {
  return AD_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  let url;
  try {
    url = new URL(event.request.url);
  } catch {
    return;
  }
  if (isAdHost(url.hostname)) {
    event.respondWith(new Response(null, { status: 204, statusText: "Blocked by Stream adblock" }));
  }
});
