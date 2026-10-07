"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AuthUser } from "./auth";
import type { CharacterAppearance } from "./appearance";
import {
  createPresenceClient,
  validPresenceLocation,
  type MultiplayerPeer,
  type PresenceLocation,
} from "./presence-client";
export type { MultiplayerPeer } from "./presence-client";

type MultiplayerState = {
  peers: MultiplayerPeer[];
  status: "connecting" | "online" | "reconnecting" | "hidden";
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  setLocation: (location: PresenceLocation) => void;
  appearance: CharacterAppearance;
  location: PresenceLocation;
};

const MultiplayerContext = createContext<MultiplayerState | null>(null);

export function MultiplayerProvider({
  user,
  children,
}: {
  user: AuthUser;
  children: ReactNode;
}) {
  const location = useRef<PresenceLocation>({
    latitude: 38.7061,
    longitude: -9.1459,
    area: "Cais do Sodré",
  });
  const [visibleLocation, setVisibleLocation] = useState<PresenceLocation>({
    ...location.current,
  });
  const [peers, setPeers] = useState<MultiplayerPeer[]>([]);
  const [status, setStatus] =
    useState<MultiplayerState["status"]>("connecting");
  const [enabled, setEnabledState] = useState(true);
  const joined = useRef(true);
  const client = useRef<ReturnType<typeof createPresenceClient> | null>(null);

  const setLocation = useCallback((next: PresenceLocation) => {
    if (!validPresenceLocation(next)) return;
    location.current = next;
    setVisibleLocation((current) =>
      current.latitude === next.latitude &&
      current.longitude === next.longitude &&
      current.area === next.area
        ? current
        : { ...next },
    );
    client.current?.setLocation(next);
  }, []);
  const setEnabled = useCallback((next: boolean) => {
    joined.current = next;
    setEnabledState(next);
    client.current?.setEnabled(next);
  }, []);

  useEffect(() => {
    const session = createPresenceClient({
      location: location.current,
      enabled: joined.current,
      onUpdate(next) {
        setPeers(next.peers);
        setStatus(next.status);
      },
    });
    client.current = session;
    setPeers([]);
    setStatus(joined.current ? "connecting" : "hidden");
    void session.sync();
    const interval = window.setInterval(() => {
      void session.sync();
    }, 10_000);
    const expiry = window.setInterval(() => session.expire(), 1000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        session.expire();
        void session.sync();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      session.dispose();
      if (client.current === session) client.current = null;
      window.clearInterval(interval);
      window.clearInterval(expiry);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [user.id]);

  const value = useMemo(
    () => ({
      peers,
      status,
      enabled,
      setEnabled,
      setLocation,
      appearance: user.appearance,
      location: visibleLocation,
    }),
    [peers, status, enabled, setLocation, user.appearance, visibleLocation],
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
