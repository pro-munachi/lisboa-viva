"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Grid2X2,
  MapPin,
  Signal,
  Smartphone,
  X,
  type LucideIcon,
} from "lucide-react";
import styles from "./Phone.module.css";

export type PhoneApp = {
  id: string;
  label: string;
  detail?: string;
  icon: LucideIcon;
  badge?: number | string;
  content?: ReactNode;
  onOpen?: () => void;
  layout?: "fill";
};

type PhoneProps = {
  open: boolean;
  onClose: () => void;
  apps: PhoneApp[];
  city: string;
  time: string;
  date: string;
  initialApp?: string;
};

export default function Phone({
  open,
  onClose,
  apps,
  city,
  time,
  date,
  initialApp,
}: PhoneProps) {
  const [appId, setAppId] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const close = useRef(onClose);
  const titleId = useId();
  const descriptionId = useId();
  close.current = onClose;
  const activeApp = open
    ? apps.find((app) => app.id === appId && app.content != null)
    : undefined;

  function closeModal() {
    const modal = dialog.current;
    if (!modal?.open) return;
    modal.close();
    if (previousFocus.current?.isConnected) previousFocus.current.focus();
  }

  function dismiss() {
    closeModal();
    close.current();
  }

  useEffect(() => {
    const modal = dialog.current;
    if (!open) {
      closeModal();
      return;
    }
    previousFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    modal?.showModal();
    closeButton.current?.focus();
    return closeModal;
  }, [open]);

  useEffect(() => {
    setAppId(open ? (initialApp ?? null) : null);
  }, [open, initialApp]);

  useEffect(() => {
    if (!open) return;
    scrollArea.current?.scrollTo({ top: 0 });
    if (activeApp) backButton.current?.focus();
  }, [appId, open, Boolean(activeApp)]);

  function openApp(app: PhoneApp) {
    if (app.content != null) {
      setAppId(app.id);
      return;
    }
    if (app.onOpen) {
      // Release the native focus trap before opening another feature's dialog.
      dismiss();
      app.onOpen();
    }
  }

  function home() {
    const returningApp = appId;
    setAppId(null);
    requestAnimationFrame(() => {
      if (!dialog.current?.open) return;
      const button = dialog.current?.querySelector<HTMLButtonElement>(
        `[data-phone-app="${CSS.escape(returningApp ?? "")}"]`,
      );
      button?.focus();
    });
  }

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <div className={styles.toolbar}>
        <span className={styles.phoneLabel}>
          <Smartphone size={15} aria-hidden="true" /> ROAM PHONE
        </span>
        <button
          ref={closeButton}
          type="button"
          className={styles.close}
          onClick={dismiss}
          aria-label="Close phone"
        >
          <X size={18} aria-hidden="true" />
          <span>Close</span>
        </button>
      </div>
      <div className={styles.handset}>
        <div
          className={`${styles.screen}${activeApp ? ` ${styles.appScreen}` : ""}`}
        >
          <div className={styles.status} aria-hidden="true">
            <span>{time}</span>
            <span className={styles.notch} />
            <span className={styles.statusMark}>
              <Signal size={14} />
              <span>ROAM</span>
            </span>
          </div>
          {activeApp && (
            <header className={styles.appHeader}>
              <button
                ref={backButton}
                type="button"
                className={styles.back}
                onClick={home}
                aria-label="Back to phone home"
              >
                <ArrowLeft size={20} aria-hidden="true" />
              </button>
              <div>
                <h2 id={titleId}>{activeApp.label}</h2>
                <p id={descriptionId}>
                  {activeApp.detail ||
                    `Your ${activeApp.label.toLowerCase()}, together in one place.`}
                </p>
              </div>
            </header>
          )}
          <div
            ref={scrollArea}
            className={`${styles.scrollArea}${activeApp?.layout === "fill" ? ` ${styles.fillScroll}` : ""}`}
          >
            {activeApp ? (
              <div
                className={`${styles.appContent}${activeApp.layout === "fill" ? ` ${styles.fillContent}` : ""}`}
              >
                {activeApp.content}
              </div>
            ) : (
              <div className={styles.launcher}>
                <header className={styles.launcherHeader}>
                  <span className={styles.location}>
                    <MapPin size={14} aria-hidden="true" />
                    {city}
                  </span>
                  <p className={styles.clock} aria-hidden="true">
                    {time}
                  </p>
                  <p className={styles.date}>{date}</p>
                  <h2 id={titleId}>Your phone</h2>
                  <p id={descriptionId}>Your people. Your plans. Your city.</p>
                </header>
                <nav className={styles.apps} aria-label="Phone apps">
                  {apps.map((app, index) => {
                    const Icon = app.icon;
                    const badge =
                      typeof app.badge === "number"
                        ? app.badge > 99
                          ? "99+"
                          : app.badge
                        : app.badge;
                    return (
                      <button
                        type="button"
                        key={app.id}
                        data-phone-app={app.id}
                        className={styles.app}
                        disabled={app.content == null && !app.onOpen}
                        onClick={() => openApp(app)}
                        aria-label={`${app.label}${app.detail ? `: ${app.detail}` : ""}${badge ? `, ${badge} unread` : ""}`}
                      >
                        <span className={styles.appIcon} data-tone={index % 6}>
                          <Icon
                            size={27}
                            strokeWidth={1.8}
                            aria-hidden="true"
                          />
                          {Boolean(badge) && (
                            <span className={styles.badge} aria-hidden="true">
                              {badge}
                            </span>
                          )}
                        </span>
                        <span className={styles.appName}>{app.label}</span>
                      </button>
                    );
                  })}
                </nav>
              </div>
            )}
          </div>
          <footer className={styles.footer}>
            <button
              type="button"
              className={styles.home}
              onClick={activeApp ? home : dismiss}
            >
              {activeApp ? (
                <Grid2X2 size={16} aria-hidden="true" />
              ) : (
                <ArrowLeft size={16} aria-hidden="true" />
              )}
              {activeApp ? "Phone home" : "Back to city"}
              <span className={styles.homeIndicator} aria-hidden="true" />
            </button>
          </footer>
        </div>
      </div>
    </dialog>
  );
}
