import { lookup } from "node:dns/promises";
import { lookup as lookupCallback, type LookupAddress, type LookupAllOptions, type LookupOneOptions } from "node:dns";
import { isIP } from "node:net";

/**
 * The video resolver fetches whatever URL a user pastes into the app. Without
 * this check, that's an SSRF primitive — a user could point it at
 * http://169.254.169.254/... (cloud metadata) or http://localhost:4000/api/...
 * and read back internal responses. Every resolved hostname (including each
 * redirect hop) must pass this before we fetch it.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("invalid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("only http/https URLs are allowed");
  }

  const hostname = url.hostname;
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) as 4 | 6 }]
    : await lookup(hostname, { all: true });

  if (addresses.length === 0) throw new Error("could not resolve host");
  for (const { address } of addresses) {
    if (isPrivateOrReservedIp(address)) throw new Error("refusing to fetch a private/internal address");
  }

  return url;
}

/**
 * A custom `dns.lookup` implementation for `http(s).request`'s `lookup`
 * option — makes the actual TCP connection use the SAME resolution that was
 * just validated, instead of `assertPublicHttpUrl` checking one DNS answer
 * and then the request re-resolving (and potentially getting a different,
 * private answer) microseconds later. A malicious/rebinding DNS server that
 * alternates between a public and a private address per query defeats a
 * "check, then separately fetch" guard; pinning to a single resolution here
 * closes that gap.
 *
 * Must mirror `dns.lookup`'s actual calling convention exactly: Node's own
 * connection logic (Happy Eyeballs / family autoselection) calls this with
 * `options.all` sometimes true and sometimes false/absent, and expects the
 * callback shape to match — `(err, addresses[])` for the former, `(err,
 * address, family)` for the latter. Always responding in the single-address
 * form (regardless of what was actually asked for) reliably confused Node's
 * internal address-selection code into throwing ERR_INVALID_IP_ADDRESS.
 */
export function pinnedPublicLookup(
  hostname: string,
  options: LookupOneOptions | LookupAllOptions | number,
  callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
): void {
  const wantsAll = typeof options === "object" && options !== null && options.all === true;

  lookupCallback(hostname, { all: true }, (err, addresses) => {
    if (err) {
      callback(err, wantsAll ? [] : "");
      return;
    }
    const list = addresses as LookupAddress[];
    const validList = list.filter((entry) => !isPrivateOrReservedIp(entry.address));
    if (validList.length === 0) {
      const refusal = new Error("refusing to fetch a private/internal address") as NodeJS.ErrnoException;
      callback(refusal, wantsAll ? [] : "");
      return;
    }
    if (wantsAll) {
      callback(null, validList);
    } else {
      callback(null, validList[0].address, validList[0].family);
    }
  });
}

function isPrivateOrReservedIp(address: string): boolean {
  if (isIP(address) === 4) return isPrivateIpv4(address);
  if (isIP(address) === 6) return isPrivateIpv6(address);
  return true;
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a >= 224) return true; // multicast/reserved
  return false;
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === "::1") return true;
  if (normalized.startsWith("::ffff:")) return isPrivateIpv4(normalized.slice(7));
  if (normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  return false;
}
