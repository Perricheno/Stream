import { useCallback, useEffect, useState } from "react";
import { socket } from "../socket/socketClient";

export type ServiceState = "checking" | "ok" | "slow" | "down";

export interface ServiceStatus {
  state: ServiceState;
  latencyMs: number | null;
  lastCheckedAt: number | null;
  activeRooms: number | null;
  connectedSockets: number | null;
  uptimeSeconds: number | null;
  networkEffectiveType: string | null;
  networkDownlinkMbps: number | null;
  socketConnected: boolean;
  recheck: () => void;
}

const CHECK_INTERVAL_MS = 60_000;
const FETCH_TIMEOUT_MS = 5_000;
const SLOW_THRESHOLD_MS = 800;

interface StatusResponse {
  ok: boolean;
  uptimeSeconds: number;
  connectedSockets: number;
  activeRooms: number;
}

/** Polls the backend's /status endpoint once a minute for a lightweight service-health readout. */
export function useServiceStatus(): ServiceStatus {
  const [status, setStatus] = useState<Omit<ServiceStatus, "recheck">>({
    state: "checking",
    latencyMs: null,
    lastCheckedAt: null,
    activeRooms: null,
    connectedSockets: null,
    uptimeSeconds: null,
    networkEffectiveType: null,
    networkDownlinkMbps: null,
    socketConnected: socket.connected,
  });

  const check = useCallback(async () => {
    const started = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch("/status", { signal: controller.signal });
      const latencyMs = Math.round(performance.now() - started);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as StatusResponse;

      setStatus({
        state: latencyMs > SLOW_THRESHOLD_MS ? "slow" : "ok",
        latencyMs,
        lastCheckedAt: Date.now(),
        activeRooms: data.activeRooms,
        connectedSockets: data.connectedSockets,
        uptimeSeconds: data.uptimeSeconds,
        networkEffectiveType: navigator.connection?.effectiveType ?? null,
        networkDownlinkMbps: navigator.connection?.downlink ?? null,
        socketConnected: socket.connected,
      });
    } catch {
      setStatus((prev) => ({
        ...prev,
        state: "down",
        latencyMs: null,
        lastCheckedAt: Date.now(),
        socketConnected: socket.connected,
      }));
    } finally {
      clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    void check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [check]);

  return { ...status, recheck: check };
}
