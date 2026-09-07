/**
 * Exercises the real socket handlers with connected clients: host authority,
 * relay to peers, non-host rejection, host hand-off on leave, and seek
 * clamping. No mocks — a real socket.io server on an ephemeral port.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setImmediate as tick } from "node:timers/promises";
import { createServer, type Server as HttpServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";

process.env.DEV_SKIP_AUTH = "true";
process.env.BOT_TOKEN = "";
process.env.DB_PATH = join(tmpdir(), `stream-it-${randomUUID()}.db`);
process.env.MEDIA_DIR = join(tmpdir(), `stream-it-media-${randomUUID()}`);

const { Server } = await import("socket.io");
const { io: connect } = await import("socket.io-client");
const { registerAuthMiddleware } = await import("./auth");
const { registerSocketHandlers } = await import("./registerSocketHandlers");

const TIMEOUT = 15_000;
type C = ReturnType<typeof connect>;

let http: HttpServer;
let io: InstanceType<typeof Server>;
let url: string;

before(async () => {
  http = createServer();
  io = new Server(http, { cors: { origin: "*" } });
  registerAuthMiddleware(io as never);
  registerSocketHandlers(io as never);
  await new Promise<void>((r) => http.listen(0, r));
  url = `http://localhost:${(http.address() as AddressInfo).port}`;
});

after(async () => {
  io.disconnectSockets(true);
  await Promise.race([new Promise<void>((r) => io.close(() => r())), tick()]);
  http.closeAllConnections?.();
});

function connectOne(): Promise<C> {
  const c = connect(url, { transports: ["websocket"], forceNew: true, timeout: 5000, reconnection: false });
  return new Promise((resolve, reject) => {
    c.once("connect", () => resolve(c));
    c.once("connect_error", reject);
  });
}

function once<T>(c: C, event: string): Promise<T> {
  return new Promise((resolve) => c.once(event, resolve as never));
}

function joinRoom(c: C, roomId: string): Promise<{ ok: boolean; yourUserId?: number }> {
  return new Promise((resolve) => c.emit("room:join", { roomId }, resolve as never));
}

/** Runs `fn` with `n` freshly-connected clients, always tearing them down. */
async function withClients(n: number, fn: (clients: C[]) => Promise<void>): Promise<void> {
  const clients = await Promise.all(Array.from({ length: n }, connectOne));
  try {
    await fn(clients);
  } finally {
    for (const c of clients) {
      c.removeAllListeners();
      c.disconnect();
    }
    await tick();
  }
}

const roomId = () => `IT${randomUUID().replace(/-/g, "").slice(0, 8)}`.toUpperCase();

test("host's play is relayed to the other participant with a server timestamp", { timeout: TIMEOUT }, () =>
  withClients(2, async ([host, guest]) => {
    const id = roomId();
    const hostJoin = await joinRoom(host, id);
    await joinRoom(guest, id);
    assert.equal(hostJoin.ok, true);

    const relayed = once<{ isPlaying: boolean; positionSeconds: number; updatedAtServerTime: number; originUserId: number }>(
      guest,
      "playback:sync",
    );
    const t0 = Date.now();
    host.emit("playback:play", { atSeconds: 5, clientTimestamp: Date.now() });
    const sync = await relayed;

    assert.equal(sync.isPlaying, true);
    assert.equal(sync.positionSeconds, 5);
    assert.equal(sync.originUserId, hostJoin.yourUserId);
    assert.ok(sync.updatedAtServerTime >= t0 && sync.updatedAtServerTime <= Date.now());
  }),
);

test("a non-host's play/pause is NOT relayed (host stays authoritative)", { timeout: TIMEOUT }, () =>
  withClients(2, async ([host, guest]) => {
    const id = roomId();
    await joinRoom(host, id);
    await joinRoom(guest, id);

    let hostGotSomething = false;
    host.on("playback:sync", () => {
      hostGotSomething = true;
    });
    guest.emit("playback:pause", { atSeconds: 42, clientTimestamp: Date.now() });
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(hostGotSomething, false);
  }),
);

test("when the host leaves, the guest is promoted and their play is authoritative", { timeout: TIMEOUT }, () =>
  withClients(3, async ([host, guest, late]) => {
    const id = roomId();
    await joinRoom(host, id);
    await joinRoom(guest, id);

    const promoted = once<Array<{ isHost: boolean }>>(guest, "room:participants");
    host.emit("room:leave");
    const participants = await promoted;
    assert.equal(participants.length, 1);
    assert.equal(participants[0].isHost, true);

    await joinRoom(late, id);
    const relayed = once<{ isPlaying: boolean; positionSeconds: number }>(late, "playback:sync");
    guest.emit("playback:play", { atSeconds: 12, clientTimestamp: Date.now() });
    const sync = await relayed;
    assert.equal(sync.isPlaying, true);
    assert.equal(sync.positionSeconds, 12);
  }),
);

test("ANY participant may pause the room, and the position comes from the server clock", { timeout: TIMEOUT }, () =>
  withClients(2, async ([host, guest]) => {
    const id = roomId();
    await joinRoom(host, id);
    const guestJoin = await joinRoom(guest, id);

    // Host starts playback at 0, then ~600ms passes.
    host.emit("playback:play", { atSeconds: 0, clientTimestamp: Date.now() });
    await new Promise((r) => setTimeout(r, 600));

    // The guest (NOT the host) asks for a pause — this is the "I backgrounded
    // the app" path, and it must be honoured even though play/seek aren't.
    const onHost = once<{ isPlaying: boolean; positionSeconds: number }>(host, "playback:sync");
    const reasonSeen = once<{ userId: number; userName: string; reason: string }>(host, "playback:paused-by");
    guest.emit("playback:request-pause", { reason: "away" });

    const sync = await onHost;
    const pausedBy = await reasonSeen;
    assert.equal(sync.isPlaying, false, "room is paused");
    // Server used its own elapsed time, not a client-supplied position.
    assert.ok(sync.positionSeconds >= 0.4, `position advanced with the clock (got ${sync.positionSeconds})`);
    assert.ok(sync.positionSeconds < 5, `position is the real elapsed time (got ${sync.positionSeconds})`);
    assert.equal(pausedBy.userId, guestJoin.yourUserId);
    assert.equal(pausedBy.reason, "away");
  }),
);

test("a participant leaving while playing pauses the room for whoever is left", { timeout: TIMEOUT }, () =>
  withClients(2, async ([host, guest]) => {
    const id = roomId();
    await joinRoom(host, id);
    await joinRoom(guest, id);

    host.emit("playback:play", { atSeconds: 0, clientTimestamp: Date.now() });
    await new Promise((r) => setTimeout(r, 300));

    const paused = once<{ isPlaying: boolean }>(host, "playback:sync");
    const why = once<{ reason: string }>(host, "playback:paused-by");
    guest.emit("room:leave");

    assert.equal((await paused).isPlaying, false);
    assert.equal((await why).reason, "left");
  }),
);

test("request-pause on an already-paused room is a no-op (no event storm)", { timeout: TIMEOUT }, () =>
  withClients(2, async ([host, guest]) => {
    const id = roomId();
    await joinRoom(host, id);
    await joinRoom(guest, id);

    let syncs = 0;
    host.on("playback:sync", () => {
      syncs += 1;
    });
    guest.emit("playback:request-pause", { reason: "away" });
    guest.emit("playback:request-pause", { reason: "away" });
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(syncs, 0, "room was never playing, so nothing to pause");
  }),
);

test("negative seek positions are clamped to 0 server-side", { timeout: TIMEOUT }, () =>
  withClients(2, async ([host, guest]) => {
    const id = roomId();
    await joinRoom(host, id);
    await joinRoom(guest, id);

    const relayed = once<{ positionSeconds: number }>(guest, "playback:sync");
    host.emit("playback:seek", { atSeconds: -999, clientTimestamp: Date.now() });
    const sync = await relayed;
    assert.equal(sync.positionSeconds, 0);
  }),
);
