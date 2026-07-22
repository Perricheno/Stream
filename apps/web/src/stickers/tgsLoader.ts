import { inflate } from "pako";

const decodedCache = new Map<string, Promise<object>>();

/** Fetches a `.tgs` file (gzip-compressed Lottie JSON) and decodes it, caching by URL. */
export function loadTgsAnimation(url: string): Promise<object> {
  let cached = decodedCache.get(url);
  if (cached) return cached;

  cached = fetch(url)
    .then((res) => res.arrayBuffer())
    .then((buffer) => {
      const json = inflate(new Uint8Array(buffer), { to: "string" });
      return JSON.parse(json) as object;
    });

  decodedCache.set(url, cached);
  return cached;
}
