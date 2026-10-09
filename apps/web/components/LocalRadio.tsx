"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import {
  ExternalLink,
  Music2,
  Pause,
  Play,
  Radio,
  Volume2,
  X,
} from "lucide-react";
import styles from "./LocalRadio.module.css";

const stations = [
  {
    id: "antena1",
    name: "Antena 1",
    description: "News, culture & Portugal",
    stream:
      "https://streaming-live.rtp.pt/liveradio/antena180a/playlist.m3u8?DVR",
    page: "https://www.rtp.pt/play/direto/antena1",
  },
  {
    id: "antena2",
    name: "Antena 2",
    description: "Classical music & arts",
    stream:
      "https://streaming-live.rtp.pt/liveradio/antena280a/playlist.m3u8?DVR",
    page: "https://www.rtp.pt/play/direto/antena2",
  },
  {
    id: "antena3",
    name: "Antena 3",
    description: "New music & culture",
    stream:
      "https://streaming-live.rtp.pt/liveradio/antena380a/playlist.m3u8?DVR",
    page: "https://www.rtp.pt/play/direto/antena3",
  },
] as const;

type RadioStatus = "stopped" | "loading" | "playing" | "error";

export default function LocalRadio({ openRequest }: { openRequest: number }) {
  const audio = useRef<HTMLAudioElement>(null);
  const hls = useRef<Hls | null>(null);
  const generation = useRef(0);
  const [expanded, setExpanded] = useState(false);
  const [stationId, setStationId] =
    useState<(typeof stations)[number]["id"]>("antena1");
  const [status, setStatus] = useState<RadioStatus>("stopped");
  const [volume, setVolume] = useState(50);
  const [error, setError] = useState<string | null>(null);
  const station = stations.find((item) => item.id === stationId) || stations[0];

  function stop() {
    generation.current += 1;
    audio.current?.pause();
    hls.current?.destroy();
    hls.current = null;
    if (audio.current) {
      audio.current.removeAttribute("src");
      audio.current.load();
    }
    setStatus("stopped");
    setError(null);
  }

  function play(nextStation = station) {
    const media = audio.current;
    if (!media) return;
    stop();
    const token = generation.current;
    window.dispatchEvent(
      new CustomEvent("roam:audio-start", { detail: "radio" }),
    );
    setStatus("loading");
    try {
      media.volume = volume / 100;
      if (media.canPlayType("application/vnd.apple.mpegurl")) {
        media.src = nextStation.stream;
      } else if (Hls.isSupported()) {
        const player = new Hls({ enableWorker: true, lowLatencyMode: false });
        hls.current = player;
        player.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal || generation.current !== token) return;
          setStatus("error");
          setError(
            "The live stream is unavailable. Try again or listen on RTP Play.",
          );
          media.pause();
          player.destroy();
          if (hls.current === player) hls.current = null;
        });
        player.attachMedia(media);
        player.loadSource(nextStation.stream);
      } else {
        throw new Error("This browser cannot play the live stream.");
      }
      void media
        .play()
        .then(() => {
          if (generation.current === token) setStatus("playing");
        })
        .catch(() => {
          if (generation.current !== token) return;
          setStatus("error");
          setError(
            "Playback could not start. Tap Play again or listen on RTP Play.",
          );
        });
    } catch (cause) {
      setStatus("error");
      setError(
        cause instanceof Error
          ? cause.message
          : "The live stream is unavailable.",
      );
    }
  }

  function selectStation(id: (typeof stations)[number]["id"]) {
    const nextStation = stations.find((item) => item.id === id) || stations[0];
    const wasActive = status === "playing" || status === "loading";
    setStationId(id);
    if (wasActive) play(nextStation);
    else {
      stop();
      setStatus("stopped");
    }
  }

  useEffect(() => {
    if (openRequest > 0) setExpanded(true);
  }, [openRequest]);

  useEffect(() => {
    const onOtherAudio = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== "radio") stop();
    };
    window.addEventListener("roam:audio-start", onOtherAudio);
    return () => {
      window.removeEventListener("roam:audio-start", onOtherAudio);
      generation.current += 1;
      audio.current?.pause();
      hls.current?.destroy();
    };
  }, []);

  return (
    <div className={styles.root} data-local-radio>
      <audio
        ref={audio}
        preload="none"
        onError={() => {
          if (status === "loading" || status === "playing") {
            setStatus("error");
            setError(
              "The live stream is unavailable. Try again or listen on RTP Play.",
            );
          }
        }}
      />
      {expanded ? (
        <section className={styles.panel} aria-label="Local radio">
          <div className={styles.heading}>
            <span>
              <Radio size={17} aria-hidden="true" /> Local radio
            </span>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              aria-label="Minimize radio"
            >
              <X size={17} />
            </button>
          </div>
          <p className={styles.subheading}>Live from Portugal · RTP Play</p>
          <label className={styles.stationLabel} htmlFor="local-radio-station">
            Station
          </label>
          <select
            id="local-radio-station"
            value={stationId}
            onChange={(event) =>
              selectStation(
                event.target.value as (typeof stations)[number]["id"],
              )
            }
          >
            {stations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <p className={styles.description}>{station.description}</p>
          <div className={styles.controls}>
            <button
              type="button"
              className={styles.play}
              onClick={
                status === "playing" || status === "loading"
                  ? stop
                  : () => play()
              }
              aria-label={
                status === "playing" || status === "loading"
                  ? "Stop radio"
                  : "Play radio"
              }
            >
              {status === "playing" || status === "loading" ? (
                <Pause size={16} aria-hidden="true" />
              ) : (
                <Play size={16} aria-hidden="true" />
              )}
              {status === "loading"
                ? "Connecting…"
                : status === "playing"
                  ? "Stop"
                  : "Play live"}
            </button>
            <label className={styles.volume} htmlFor="local-radio-volume">
              <Volume2 size={16} aria-hidden="true" />
              <span className={styles.srOnly}>Volume</span>
            </label>
            <input
              id="local-radio-volume"
              className={styles.slider}
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={(event) => {
                const value = Number(event.target.value);
                setVolume(value);
                if (audio.current) audio.current.volume = value / 100;
              }}
              aria-label="Radio volume"
            />
          </div>
          <p className={styles.status} role="status">
            {error ||
              (status === "playing"
                ? `${station.name} is live`
                : status === "loading"
                  ? "Connecting to live radio…"
                  : "Choose a station and press Play.")}
          </p>
          <a
            className={styles.source}
            href={station.page}
            target="_blank"
            rel="noopener noreferrer"
          >
            Listen on RTP Play <ExternalLink size={12} aria-hidden="true" />
          </a>
        </section>
      ) : (
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setExpanded(true)}
          aria-label={`Open local radio${status === "playing" ? `, ${station.name} playing` : ""}`}
        >
          <span className="app-emoji action-emoji" aria-hidden="true">
            🎧
          </span>
          <span>Radio</span>
          {status === "playing" && <span className={styles.live}>LIVE</span>}
        </button>
      )}
    </div>
  );
}
