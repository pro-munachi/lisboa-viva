"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { AuthUser } from "./auth";

export type MultiplayerPeer = {
  id: string;
  handle: string;
  userType: "tourist" | "local";
  latitude: number;
  longitude: number;
  area: string;
  distanceMetres: number;
  lastSeenAt: string;
};

type PresenceLocation = {
  latitude: number;
  longitude: number;
  area: string;
};

type MultiplayerState = {
  peers: MultiplayerPeer[];
  status: "connecting" | "online" | "reconnecting" | "hidden";
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  setLocation: (location: PresenceLocation) => void;
};

const MultiplayerContext = createContext<MultiplayerState | null>(null);

export function MultiplayerProvider({
  user,
  children,
}: {
  user: AuthUser;
  children: ReactNode;
}) {
  const [location, setLocationState] = useState<PresenceLocation>({
    latitude: 38.7061,
    longitude: -9.1459,
    area: "Cais do Sodré",
  });
  const [peers, setPeers] = useState<MultiplayerPeer[]>([]);
  const [status, setStatus] =
    useState<MultiplayerState["status"]>("connecting");
  const [enabled, setEnabled] = useState(true);

  const setLocation = useCallback((next: PresenceLocation) => {
    setLocationState((current) =>
      current.latitude === next.latitude &&
      current.longitude === next.longitude &&
      current.area === next.area
        ? current
        : next,
    );
  }, []);

  useEffect(() => {
    let active = true;
    if (!enabled) {
      setStatus("hidden");
      setPeers([]);
      fetch("/api/multiplayer/presence", { method: "DELETE" }).catch(
        () => null,
      );
      return () => {
        active = false;
      };
    }

    async function sync() {
      try {
        const presence = await fetch("/api/multiplayer/presence", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(location),
        });
        if (!presence.ok) throw new Error("presence");
        const query = new URLSearchParams({
          latitude: String(location.latitude),
          longitude: String(location.longitude),
          radius: "25000",
        });
        const response = await fetch(`/api/multiplayer/nearby?${query}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("nearby");
        const body = (await response.json()) as { players?: MultiplayerPeer[] };
        if (active) {
          setPeers(Array.isArray(body.players) ? body.players : []);
          setStatus("online");
        }
      } catch {
        if (active) setStatus("reconnecting");
      }
    }

    setStatus("connecting");
    void sync();
    const interval = window.setInterval(sync, 10_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void sync();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, location, user.id]);

  const value = useMemo(
    () => ({ peers, status, enabled, setEnabled, setLocation }),
    [peers, status, enabled, setLocation],
  );
  return (
    <MultiplayerContext.Provider value={value}>
      {children}
    </MultiplayerContext.Provider>
  );
}

export function useMultiplayer() {
  const value = useContext(MultiplayerContext);
  if (!value) throw new Error("useMultiplayer requires MultiplayerProvider");
  return value;
}
