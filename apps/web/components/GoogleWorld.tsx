"use client";

import { useEffect, useRef, useState } from "react";
import {
  isGoogleMapsConfigured,
  loadGoogleMaps,
  validCoordinates,
  type GoogleCameraFocus,
  type GoogleHotspot,
  type GoogleMapElement,
  type GoogleMaps3DLibrary,
} from "../lib/google-maps";

type Props = {
  focus: GoogleCameraFocus;
  hotspots?: GoogleHotspot[];
  onSelect?: (hotspot: GoogleHotspot) => void;
  onStatus?: (status: string) => void;
};
const NO_HOTSPOTS: GoogleHotspot[] = [];

export default function GoogleWorld({
  focus,
  hotspots = NO_HOTSPOTS,
  onSelect,
  onStatus,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<GoogleMapElement | null>(null);
  const library = useRef<GoogleMaps3DLibrary | null>(null);
  const callbacks = useRef({ onSelect, onStatus });
  const currentFocus = useRef(focus);
  callbacks.current = { onSelect, onStatus };
  currentFocus.current = focus;
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState(
    isGoogleMapsConfigured
      ? "Loading Google’s 3D imagery…"
      : "Google 3D needs a Maps API key. Explore the city preview while it is connected.",
  );

  useEffect(() => {
    callbacks.current.onStatus?.(status);
  }, [status]);

  useEffect(() => {
    if (!isGoogleMapsConfigured || !host.current) return;
    let cancelled = false;
    let element: GoogleMapElement | undefined;
    const reportError = () => {
      if (cancelled) return;
      setReady(false);
      setStatus(
        "Google 3D could not initialize. Check API access or return to the city preview.",
      );
    };
    loadGoogleMaps()
      .then((runtime) => runtime.importLibrary("maps3d"))
      .then((maps3d) => {
        if (cancelled || !host.current) return;
        const target = currentFocus.current;
        if (!validCoordinates(target)) throw new Error("Invalid map position.");
        library.current = maps3d;
        element = new maps3d.Map3DElement({
          center: {
            lat: target.lat,
            lng: target.lng,
            altitude: target.altitude ?? 0,
          },
          range: target.range ?? 1800,
          tilt: 65,
          heading: 20,
          mode: "HYBRID",
          gestureHandling: "GREEDY",
          description:
            "Interactive Google 3D map of Lisbon and Sintra. Drag to move; use map controls to rotate, tilt and zoom.",
        });
        element.style.width = "100%";
        element.style.height = "100%";
        element.style.display = "block";
        element.tabIndex = 0;
        element.addEventListener("gmp-error", reportError);
        host.current.replaceChildren(element);
        map.current = element;
        setReady(true);
        setStatus("");
      })
      .catch(() => {
        if (!cancelled) reportError();
      });
    return () => {
      cancelled = true;
      element?.removeEventListener("gmp-error", reportError);
      element?.stopCameraAnimation();
      element?.remove();
      map.current = null;
      library.current = null;
    };
  }, []);

  useEffect(() => {
    const element = map.current;
    if (!ready || !element || !validCoordinates(focus)) return;
    const camera = {
      center: { lat: focus.lat, lng: focus.lng, altitude: focus.altitude ?? 0 },
      range: focus.range ?? 1800,
      tilt: 65,
      heading: element.heading ?? 20,
    };
    element.stopCameraAnimation();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      Object.assign(element, camera);
    else element.flyCameraTo({ endCamera: camera, durationMillis: 1300 });
  }, [focus.lat, focus.lng, focus.altitude, focus.range, ready]);

  useEffect(() => {
    const element = map.current;
    const maps3d = library.current;
    if (!ready || !element || !maps3d) return;
    const markers = hotspots.filter(validCoordinates).map((hotspot) => {
      const marker = new maps3d.Marker3DInteractiveElement({
        position: { lat: hotspot.lat, lng: hotspot.lng },
        altitudeMode: "CLAMP_TO_GROUND",
        label: hotspot.name,
        title: hotspot.name,
        drawsWhenOccluded: false,
        sizePreserved: true,
      });
      const select = () => callbacks.current.onSelect?.(hotspot);
      marker.addEventListener("gmp-click", select);
      element.append(marker);
      return { marker, select };
    });
    return () => {
      markers.forEach(({ marker, select }) => {
        marker.removeEventListener("gmp-click", select);
        marker.remove();
      });
    };
  }, [hotspots, ready]);

  return (
    <div className="world google-world" aria-label="Real-world Google 3D map">
      <div ref={host} className="world-canvas" />
      {status && (
        <p className="world-loading" role="status">
          {status}
        </p>
      )}
    </div>
  );
}
