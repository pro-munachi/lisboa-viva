"use client";
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  FormEvent,
  ReactNode,
} from "react";
import {
  Map as MapIcon,
  Compass,
  Home,
  Briefcase,
  Wallet,
  MessageCircle,
  Heart,
  Sun,
  Moon,
  CloudSun,
  MapPin,
  ArrowUpRight,
  ArrowRight,
  ChevronRight,
  X,
  Plus,
  Minus,
  TrainFront,
  Footprints,
  Ship,
  Clock,
  Users,
  ShieldCheck,
  GraduationCap,
  Coffee,
  ShoppingBasket,
  Dumbbell,
  Music,
  Waves,
  Landmark,
  Check,
  Settings,
  LogOut,
  Send,
  LoaderCircle,
  Backpack,
  List,
  Scale,
  Leaf,
  Menu,
  Star,
} from "lucide-react";
import CityMap, { VenueScene } from "./CityMap";
import type { World, Snapshot, Activity, Venue, Route } from "./types";
import {
  pt,
  euro,
  time,
  statNames,
  skillNames,
  modes,
  kinds,
  setI18nLocale,
  createDomTranslationState,
  translateDom,
  type Locale,
} from "./i18n";
import type { components } from "./api.generated";
type Cmd = components["schemas"]["Command"];
const iconFor = (t: string) =>
  ({
    home: Home,
    cafe: Coffee,
    market: ShoppingBasket,
    school: GraduationCap,
    bank: Landmark,
    work: Briefcase,
    square: Users,
    park: Leaf,
    music: Music,
    police: ShieldCheck,
    court: Scale,
    club: Music,
    station: TrainFront,
    stadium: Star,
    gym: Dumbbell,
    beach: Waves,
    surf: Waves,
    community: Heart,
  })[t] || MapPin;
function Modal({
  children,
  onClose,
  label,
  wide = false,
}: {
  children: ReactNode;
  onClose: () => void;
  label: string;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement;
    ref.current?.focus();
    return () => prior?.focus();
  }, []);
  return (
    <div
      className="scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={"modal " + (wide ? "wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Tab") {
            const nodes = ref.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled),input,select,textarea,[tabindex="0"]',
            );
            if (!nodes?.length) return;
            const first = nodes[0],
              last = nodes[nodes.length - 1];
            if (
              e.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === ref.current)
            ) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <button className="icon close" onClick={onClose} aria-label="Fechar">
          <X size={20} />
        </button>
        {children}
      </div>
    </div>
  );
}

function LanguageToggle({
  locale,
  onChange,
}: {
  locale: Locale;
  onChange: (locale: Locale) => void;
}) {
  return (
    <div
      className="language-toggle"
      role="group"
      aria-label="Idioma / Language"
    >
      <button
        type="button"
        className={locale === "pt" ? "active" : ""}
        aria-pressed={locale === "pt"}
        onClick={() => onChange("pt")}
      >
        PT
      </button>
      <button
        type="button"
        className={locale === "en" ? "active" : ""}
        aria-pressed={locale === "en"}
        onClick={() => onChange("en")}
      >
        EN
      </button>
    </div>
  );
}

export default function Game() {
  const [world, setWorld] = useState<World | null>(null),
    [state, setState] = useState<Snapshot | null>(null),
    [loading, setLoading] = useState(true),
    [connection, setConnection] = useState("connecting"),
    [toast, setToast] = useState(""),
    [auth, setAuth] = useState<"login" | "register" | null>(null),
    [phone, setPhone] = useState(""),
    [selected, setSelected] = useState("arroios"),
    [venueId, setVenueId] = useState("home"),
    [view, setView] = useState("map"),
    [zoom, setZoom] = useState(1),
    [busy, setBusy] = useState(false),
    [challenge, setChallenge] = useState<Activity | null>(null),
    [tick, setTick] = useState(Date.now()),
    [filter, setFilter] = useState("all"),
    [routePreference, setRoutePreference] = useState("fast"),
    [mobilePanel, setMobilePanel] = useState(false),
    [locale, setLocale] = useState<Locale>("pt"),
    [localeReady, setLocaleReady] = useState(false);
  const pending = useRef<Record<string, string>>({});
  const booted = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const translationState = useRef(createDomTranslationState());
  setI18nLocale(locale);

  useEffect(() => {
    const saved = localStorage.getItem("lv-locale");
    if (saved === "en" || saved === "pt") setLocale(saved);
    setLocaleReady(true);
  }, []);
  useEffect(() => {
    if (!localeReady) return;
    localStorage.setItem("lv-locale", locale);
    document.documentElement.lang = locale === "en" ? "en-GB" : "pt-PT";
    document.title =
      locale === "en"
        ? "Lisboa Viva — the city is yours"
        : "Lisboa Viva — a cidade é tua";
    const apply = (node: Node = document.body) =>
      translateDom(node, locale, translationState.current);
    apply();
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") apply(mutation.target);
        else {
          if (mutation.type === "attributes") apply(mutation.target);
          mutation.addedNodes.forEach((node) => apply(node));
        }
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["aria-label", "placeholder", "title"],
    });
    return () => observer.disconnect();
  }, [locale, localeReady]);

  function changeLocale(next: Locale) {
    setI18nLocale(next);
    setLocale(next);
  }
  const notify = useCallback((s: string) => {
    setToast(s);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 6500);
  }, []);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/v1/state");
      if (r.status === 401) {
        setState(null);
        setConnection("guest");
        return;
      }
      if (!r.ok) throw Error();
      const s: Snapshot = await r.json();
      setState(s);
      setConnection("online");
      if (!booted.current) {
        booted.current = true;
        setVenueId(s.player.venue);
      }
    } catch {
      setConnection("offline");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    fetch("/v1/world")
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then(setWorld)
      .catch(() => {
        setConnection("offline");
        setLoading(false);
      });
    refresh();
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [refresh]);
  useEffect(() => {
    if (!state?.player.id) return;
    const poll = setInterval(refresh, 8000);
    let ws: WebSocket;
    let stopped = false;
    let retry: ReturnType<typeof setTimeout>;
    function connect() {
      if (stopped) return;
      ws = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/v1/ws`,
      );
      ws.onmessage = () => refresh();
      ws.onclose = () => {
        if (!stopped) retry = setTimeout(connect, 4000);
      };
      ws.onerror = () => ws.close();
    }
    connect();
    return () => {
      stopped = true;
      clearInterval(poll);
      clearTimeout(retry);
      ws?.close();
    };
  }, [state?.player.id, refresh]);
  useEffect(() => {
    if (!state || !world) return;
    const h = world.venues.find((v) => v.id === venueId)?.hub;
    if (h) setSelected(h);
  }, [venueId, world, state?.player.id]);
  async function command(data: Omit<Cmd, "key">) {
    if (busy) return false;
    const signature = JSON.stringify(data);
    const storageKey = `lv-pending:${state?.player.id}:${signature}`;
    let key = pending.current[storageKey];
    try {
      key = key || sessionStorage.getItem(storageKey) || "";
    } catch {}
    key = key || crypto.randomUUID();
    pending.current[storageKey] = key;
    try {
      sessionStorage.setItem(storageKey, key);
    } catch {}
    const clearPending = () => {
      delete pending.current[storageKey];
      try {
        sessionStorage.removeItem(storageKey);
      } catch {}
    };
    setBusy(true);
    try {
      const r = await fetch("/v1/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, key }),
      });
      const result = await r.json();
      if (!r.ok) {
        if (r.status < 500) clearPending();
        notify(pt[result.error as keyof typeof pt] || pt.server);
        return false;
      }
      clearPending();
      await refresh();
      notify(
        data.kind === "message"
          ? "Mensagem enviada."
          : data.kind === "transfer"
            ? "Transferência concluída. O comprovativo está no teu histórico."
            : data.kind === "activity" || data.kind === "travel"
              ? "Tudo pronto. A tua atividade começou."
              : "Feito. O teu progresso foi guardado.",
      );
      return true;
    } catch {
      notify(pt.network);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const p = state?.player,
    venue = world?.venues.find((v) => v.id === venueId),
    current = world?.venues.find((v) => v.id === p?.venue),
    active = state?.actions.find((a) => a.status === "running"),
    remaining = active
      ? Math.max(0, Math.ceil((Date.parse(active.due_at) - tick) / 1000))
      : 0;
  const acting =
    !!active ||
    !!state?.encounters.some((e) => e.status === "pending") ||
    !!(p && Date.parse(p.state.detainedUntil) > tick);
  const hub = world?.hubs.find((h) => h.id === selected),
    activities = world?.activities.filter((a) => a.venue === venueId) || [];
  const path =
    world && current && venue
      ? findPath(world, current.hub, venue.hub, routePreference)
      : [];
  const nextRoute = path[0];
  const nextHub =
    nextRoute && current
      ? nextRoute.fromHub === current.hub
        ? nextRoute.toHub
        : nextRoute.fromHub
      : venue?.hub;
  const travelTarget =
    path.length > 1 ? world?.venues.find((v) => v.hub === nextHub) : venue;
  function chooseHub(id: string) {
    setSelected(id);
    const v = world?.venues.find((v) => v.hub === id);
    if (v) setVenueId(v.id);
    setMobilePanel(true);
  }
  function openPhone(tab: string) {
    if (!p) {
      setAuth("register");
      return;
    }
    setPhone(tab);
    if (tab === "messages") command({ kind: "read" });
  }
  function startActivity(a: Activity) {
    if (!p) {
      setAuth("register");
      return;
    }
    if (a.question) setChallenge(a);
    else command({ kind: "activity", target: a.id });
  }
  function go(v: Venue) {
    setVenueId(v.id);
    setSelected(v.hub);
    setPhone("");
    setMobilePanel(true);
  }
  if (!world)
    return (
      <main className="loading">
        <div className="brand-mark">
          L<span>v</span>
        </div>
        <h1>Lisboa está à tua espera.</h1>
        <p>
          {connection === "offline"
            ? "Não foi possível ligar à cidade. Verifica se o servidor está disponível."
            : "A abrir as portas do bairro…"}
        </p>
        {connection === "offline" ? (
          <button className="primary" onClick={() => location.reload()}>
            Tentar novamente
          </button>
        ) : (
          <LoaderCircle className="spin" />
        )}
      </main>
    );
  return (
    <main className="game-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Lisboa Viva, início">
          <div className="brand-mark">
            L<span>v</span>
          </div>
          <div>
            lisboa<span>viva</span>
            <small>A CIDADE É TUA.</small>
          </div>
        </a>
        <nav className="main-nav" aria-label="Navegação principal">
          <button
            className="active"
            onClick={() => {
              setPhone("");
              setView("map");
            }}
          >
            <Compass size={17} />
            Explorar
          </button>
          <button onClick={() => openPhone("jobs")}>
            <Briefcase size={17} />
            Trabalho
          </button>
          <button onClick={() => openPhone("life")}>
            <Heart size={17} />A minha vida
          </button>
        </nav>
        <div className="top-right">
          <LanguageToggle locale={locale} onChange={changeLocale} />
          <span
            className={"connection " + (connection === "offline" ? "bad" : "")}
          >
            <i />
            {connection === "offline"
              ? "A restabelecer ligação"
              : p
                ? "Ligado à cidade"
                : "Primeira edição"}
          </span>
          {p ? (
            <button
              className="profile-button"
              onClick={() => openPhone("settings")}
            >
              <span className={"avatar " + p.state.color}>
                {p.name.slice(0, 1)}
              </span>
              <span>
                {p.name}
                <small>@{p.handle}</small>
              </span>
            </button>
          ) : (
            <button className="outline" onClick={() => setAuth("login")}>
              Iniciar sessão <ArrowUpRight size={16} />
            </button>
          )}
        </div>
      </header>
      <div className="world-layout">
        <aside className="left-panel">
          <div className="eyebrow">
            <span className="little-sun">✳</span> A TUA PRÓXIMA HISTÓRIA
          </div>
          <h1>
            {p ? (
              <>
                Olá, {p.name.split(" ")[0]}.<br />
                <em>Onde vamos hoje?</em>
              </>
            ) : (
              <>
                Uma cidade.
                <br />
                Mil maneiras
                <br />
                <em>de a viver.</em>
              </>
            )}
          </h1>
          <p className="intro">
            {p
              ? "Há sempre uma rua por descobrir, alguém por conhecer e um novo começo."
              : "Encontra o teu bairro. Conhece as tuas pessoas. Constrói uma vida em Lisboa, ao teu ritmo."}
          </p>
          {!p ? (
            <button
              className="primary start-button"
              onClick={() => setAuth("register")}
            >
              Começar a minha história <ArrowRight size={18} />
            </button>
          ) : (
            <div className="wallet-mini">
              <button onClick={() => openPhone("bank")}>
                <span>No bolso</span>
                <strong>{euro(p.cash)}</strong>
              </button>
              <button onClick={() => openPhone("bank")}>
                <span>No banco</span>
                <strong>{euro(p.bank)}</strong>
              </button>
            </div>
          )}
          <div className="section-label">
            {p ? "O TEU DIA" : "ESCOLHE O TEU RITMO"}
            <span>01 / LISBOA</span>
          </div>
          {p ? (
            <>
              <div className="needs">
                {Object.entries(p.state.stats)
                  .slice(0, 6)
                  .map(([key, value]) => (
                    <div key={key}>
                      <div>
                        <span>{statNames[key]}</span>
                        <span>{value}%</span>
                      </div>
                      <meter
                        min="0"
                        max="100"
                        value={value}
                        aria-label={statNames[key]}
                      />
                    </div>
                  ))}
              </div>
              <button className="quest-card" onClick={() => openPhone("life")}>
                <span className="quest-icon">
                  <Star size={18} />
                </span>
                <span>
                  <small>PEQUENAS HISTÓRIAS</small>
                  <strong>
                    {p.state.quest === 3
                      ? "Já fazes parte do bairro"
                      : "Os primeiros vizinhos"}
                  </strong>
                  <span>{p.state.quest}/3 passos concluídos</span>
                </span>
                <ChevronRight size={17} />
              </button>
            </>
          ) : (
            <div className="intro-features">
              <div>
                <Coffee size={19} />
                <span>Uma bica. Uma conversa. Um começo.</span>
              </div>
              <div>
                <Briefcase size={19} />
                <span>O teu primeiro turno, a tua ambição.</span>
              </div>
              <div>
                <Ship size={19} />
                <span>Da outra margem até ao Atlântico.</span>
              </div>
            </div>
          )}
          <div className="left-bottom">
            <div className="tile-pattern" />
            <p>
              <ShieldCheck size={15} />
              {p
                ? "O teu progresso fica guardado."
                : "Uma vida virtual. Uma cidade partilhada."}
            </p>
            <small>Lisboa e arredores · Portugal</small>
          </div>
        </aside>
        <section className="map-section" aria-label="Explorar a cidade">
          <div className="map-top">
            <div className="map-title">
              <span className="eyebrow">O MUNDO LÁ FORA</span>
              <h2>
                Lisboa e arredores <span>10 bairros</span>
              </h2>
            </div>
            <div className="weather">
              <CloudSun size={22} />
              <span>
                {String(state?.hour ?? 18).padStart(2, "0")}:00
                <small>Tempo simulado · céu limpo</small>
              </span>
            </div>
          </div>
          <div className="map-toolbar">
            <div className="segmented">
              <button
                className={view === "map" ? "chosen" : ""}
                onClick={() => setView("map")}
              >
                <MapIcon size={15} />
                Mapa
              </button>
              <button
                className={view === "list" ? "chosen" : ""}
                onClick={() => setView("list")}
              >
                <List size={15} />
                Lista
              </button>
            </div>
            <div className="map-filters">
              {[
                ["all", "Tudo"],
                ["work", "Trabalho"],
                ["leisure", "Tempo livre"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={filter === id ? "chosen" : ""}
                  onClick={() => {
                    setFilter(id);
                    if (id !== "all") setView("list");
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {view === "map" ? (
            <div className="map-viewport">
              <div className="map-canvas" style={{ width: `${zoom * 100}%` }}>
                <CityMap
                  world={world}
                  selected={selected}
                  onSelect={chooseHub}
                  player={p}
                  night={!!state && (state.hour >= 21 || state.hour < 6)}
                />
              </div>
              <div className="map-caption">
                <span className="map-dot" />O teu mundo, à distância de um
                passeio.
              </div>
              <div className="zoom-controls">
                <button
                  aria-label="Ampliar mapa"
                  onClick={() => setZoom(Math.min(1.6, zoom + 0.2))}
                >
                  <Plus size={18} />
                </button>
                <button
                  aria-label="Reduzir mapa"
                  onClick={() => setZoom(Math.max(1, zoom - 0.2))}
                >
                  <Minus size={18} />
                </button>
              </div>
            </div>
          ) : (
            <div className="venue-list">
              {world.hubs.map((h) => {
                const vs = world.venues.filter(
                  (v) =>
                    v.hub === h.id &&
                    (filter === "all" ||
                      (filter === "work" &&
                        world.activities.some(
                          (a) => a.venue === v.id && a.reward > 0,
                        )) ||
                      (filter === "leisure" &&
                        [
                          "park",
                          "club",
                          "beach",
                          "surf",
                          "gym",
                          "stadium",
                          "music",
                        ].includes(v.type))),
                );
                return vs.length ? (
                  <section key={h.id}>
                    <h3>{h.name}</h3>
                    {vs.map((v) => {
                      const I = iconFor(v.type);
                      return (
                        <button key={v.id} onClick={() => go(v)}>
                          <I size={18} />
                          <span>
                            <strong>{v.name}</strong>
                            <small>{v.description}</small>
                          </span>
                          <ChevronRight size={16} />
                        </button>
                      );
                    })}
                  </section>
                ) : null;
              })}
            </div>
          )}
          {p && (
            <div className="location-pill">
              <span className="pulse-dot" />
              <span>
                {active?.kind === "travel"
                  ? "A caminho de " +
                    world.venues.find((v) => v.id === active.target)?.name
                  : current?.name}
              </span>
              <button
                onClick={() => {
                  if (current) go(current);
                }}
                aria-label="Ver a minha localização"
              >
                <MapPin size={15} />
              </button>
            </div>
          )}
          <div className="phone-dock">
            <button
              onClick={() => openPhone("life")}
              aria-label="Abrir casa e inventário"
            >
              <Home size={20} />
              <span>A minha vida</span>
            </button>
            <button
              onClick={() => openPhone("jobs")}
              aria-label="Procurar trabalho"
            >
              <Briefcase size={20} />
              <span>Trabalho</span>
            </button>
            <button onClick={() => openPhone("bank")} aria-label="Abrir banco">
              <Wallet size={20} />
              <span>Carteira</span>
            </button>
            <button
              onClick={() => openPhone("messages")}
              aria-label="Abrir mensagens"
            >
              <MessageCircle size={20} />
              <span>Mensagens</span>
              {state &&
                state.messages.some(
                  (m) =>
                    m.recipient === p?.id &&
                    Date.parse(m.created_at) >
                      Date.parse(p?.state.lastRead || "0"),
                ) && <i className="unread" />}
            </button>
            <button
              onClick={() => openPhone("justice")}
              aria-label="Abrir processos"
            >
              <Scale size={20} />
              <span>Cidadania</span>
            </button>
          </div>
        </section>
        {venue && (
          <aside
            className={"right-panel " + (mobilePanel ? "mobile-open" : "")}
          >
            <button
              className="mobile-close icon"
              aria-label="Fechar local"
              onClick={() => setMobilePanel(false)}
            >
              <X size={20} />
            </button>
            <div className="venue-kicker">
              <MapPin size={13} />
              {hub?.name}
              <span>
                {venue.safe ? "Zona tranquila" : "Encontros de risco opcionais"}
              </span>
            </div>
            <label className="venue-picker">
              Espaços do bairro
              <select
                aria-label="Espaços do bairro"
                value={venueId}
                onChange={(e) => setVenueId(e.target.value)}
              >
                {world.venues
                  .filter((v) => v.hub === selected)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
              </select>
            </label>
            <h2>{venue.name}</h2>
            <p className="venue-desc">{venue.description}</p>
            <VenueScene type={venue.type} />
            <div className="venue-meta">
              <span>
                <Clock size={13} />
                {venue.opens === 0 && venue.closes === 24
                  ? "Sempre aberto"
                  : `${venue.opens}h – ${venue.closes}h`}
              </span>
              <span>
                <Users size={13} />
                {p?.venue === venueId
                  ? `${state?.nearby.length} por perto`
                  : "Presença ao chegar"}
              </span>
            </div>
            {p?.venue !== venueId ? (
              <div className="travel-card">
                <span className="eyebrow">
                  {p ? "COMO CHEGAR" : "O TEU PONTO DE PARTIDA"}
                </span>
                <h3>
                  {p
                    ? path.length > 1
                      ? "Uma viagem, passo a passo"
                      : nextRoute
                        ? modes[nextRoute.mode]
                        : "Uma pequena caminhada"
                    : "Um quarto. Um novo capítulo."}
                </h3>
                <p>
                  {p
                    ? path.length
                      ? path.map((r) => modes[r.mode]).join(" → ")
                      : "Explora os espaços deste bairro a pé."
                    : "Começas numa casa partilhada em Arroios, com dinheiro para os primeiros dias."}
                </p>
                {p && (
                  <>
                    <div
                      className="route-options"
                      role="group"
                      aria-label="Preferência de viagem"
                    >
                      <button
                        className={routePreference === "fast" ? "chosen" : ""}
                        onClick={() => setRoutePreference("fast")}
                      >
                        Mais rápido
                      </button>
                      <button
                        className={routePreference === "cheap" ? "chosen" : ""}
                        onClick={() => setRoutePreference("cheap")}
                      >
                        Mais económico
                      </button>
                    </div>
                    <div className="travel-summary">
                      <span>
                        <Clock size={14} />
                        {path.reduce((n, r) => n + r.seconds, 0) || 3} s
                      </span>
                      <span>{euro(path.reduce((n, r) => n + r.fare, 0))}</span>
                    </div>
                  </>
                )}
                <button
                  className="primary"
                  disabled={busy || acting}
                  onClick={() =>
                    p
                      ? command({
                          kind: "travel",
                          target: travelTarget?.id,
                          choice: nextRoute?.id || "",
                        })
                      : setAuth("register")
                  }
                >
                  {p
                    ? path.length > 1
                      ? `Viajar até ${world.hubs.find((h) => h.id === nextHub)?.name}`
                      : "Ir para aqui"
                    : "Criar a minha personagem"}
                  <ArrowRight size={16} />
                </button>
                {path.length > 1 && (
                  <small>
                    Destino final: {venue.name}. Escolhe a próxima ligação
                    quando chegares.
                  </small>
                )}
              </div>
            ) : (
              <>
                <div className="section-label">O QUE TE APETECE FAZER?</div>
                <div className="activities">
                  {activities.map((a) => {
                    const I = iconFor(venue.type);
                    const done =
                      !!a.qualification &&
                      state?.qualifications.some(
                        (q) => q.qualification === a.qualification,
                      );
                    return (
                      <button
                        key={a.id}
                        disabled={busy || acting || done}
                        onClick={() => startActivity(a)}
                      >
                        <span className="activity-icon">
                          <I size={19} />
                        </span>
                        <span>
                          <strong>{a.name}</strong>
                          <small>
                            {a.seconds} s ·{" "}
                            {done
                              ? "Qualificação obtida"
                              : a.reward
                                ? `Recebes ${euro(a.reward)}`
                                : a.cost
                                  ? euro(a.cost)
                                  : "Gratuito"}
                            {a.requires ? " · requer curso" : ""}
                          </small>
                        </span>
                        {done ? (
                          <Check size={16} />
                        ) : (
                          <ChevronRight size={16} />
                        )}
                      </button>
                    );
                  })}
                </div>
                {venue.type === "bank" && (
                  <button
                    className="outline full"
                    onClick={() => openPhone("bank")}
                  >
                    Depositar ou levantar <Wallet size={16} />
                  </button>
                )}
                {["court", "police"].includes(venue.type) && (
                  <button
                    className="outline full"
                    onClick={() => openPhone("justice")}
                  >
                    Consultar os meus processos
                  </button>
                )}
                {venue.npc && (
                  <div className="npc-card">
                    <span className="avatar npc">{venue.npc[0]}</span>
                    <div>
                      <strong>{venue.npc}</strong>
                      <small>Personagem da cidade · NPC</small>
                    </div>
                  </div>
                )}
                {((p.state.quest === 0 && venue.id === "home") ||
                  (p.state.quest === 1 && venue.id === "cafe") ||
                  (p.state.quest === 2 && venue.id === "home")) && (
                  <button
                    className="quest-talk"
                    disabled={busy || acting}
                    onClick={() => command({ kind: "quest" })}
                  >
                    <MessageCircle size={16} />
                    {p.state.quest === 0
                      ? "Conhecer a Amélia"
                      : p.state.quest === 1
                        ? "Conversar com a Rita"
                        : "Contar as novidades à Amélia"}
                  </button>
                )}
              </>
            )}
            <div className="nearby-section">
              <div className="section-label">VIDA NO BAIRRO</div>
              {p?.venue === venueId && state?.nearby.length ? (
                state.nearby.map((n) => (
                  <div className="person-row" key={n.id}>
                    <span className={"avatar " + n.color}>{n.name[0]}</span>
                    <span>
                      <strong>{n.name}</strong>
                      <small>@{n.handle}</small>
                    </span>
                    {n.risk === "true" && p.state.risk && !venue.safe ? (
                      <button
                        className="tiny"
                        disabled={busy || acting}
                        onClick={() =>
                          command({ kind: "rob", target: n.handle })
                        }
                      >
                        Encontro de risco
                      </button>
                    ) : (
                      <span className="online-dot" />
                    )}
                  </div>
                ))
              ) : (
                <p className="muted small">
                  {p?.venue === venueId
                    ? "És a primeira pessoa por aqui. Os NPCs mantêm o bairro a funcionar."
                    : "Visita este espaço para conhecer quem está por perto."}
                </p>
              )}
              <button
                className="text-button"
                onClick={() => openPhone("messages")}
              >
                Abrir a conversa local <ArrowUpRight size={15} />
              </button>
            </div>
            <div className="postcard">
              <span>DEVAGAR TAMBÉM SE CHEGA LONGE.</span>
              <p>
                Há sempre tempo
                <br />
                para mais uma volta.
              </p>
              <span>✳ LISBOA VIVA</span>
            </div>
          </aside>
        )}
      </div>
      {active && (
        <div className="action-banner" role="status">
          <LoaderCircle size={20} className="spin" />
          <div>
            <strong>
              {active.kind === "travel"
                ? "A viajar"
                : world.activities.find((a) => a.id === active.target)?.name ||
                  "Serviço comunitário"}
            </strong>
            <small>
              {remaining ? `Faltam ${remaining} s` : "A confirmar a conclusão…"}{" "}
              · podes fechar o navegador
            </small>
          </div>
          {active.kind === "travel" && (
            <button
              onClick={() => command({ kind: "cancel", target: active.id })}
              disabled={busy}
            >
              Cancelar sem reembolso
            </button>
          )}
          <progress
            value={Math.max(0, tick - Date.parse(active.started_at))}
            max={Date.parse(active.due_at) - Date.parse(active.started_at)}
          />
        </div>
      )}
      {state?.encounters
        .filter((e) => e.status === "pending")
        .map((e) => (
          <div className="encounter-banner" key={e.id}>
            <ShieldCheck />
            <div>
              <strong>Encontro de risco em curso</strong>
              <p>
                {e.victim === p?.id
                  ? "Protege o teu dinheiro ou chama ajuda."
                  : "A outra pessoa pode defender-se. O resultado é calculado pelo servidor."}
              </p>
            </div>
            {e.victim === p?.id && (
              <>
                <button
                  disabled={busy}
                  onClick={() =>
                    command({ kind: "defend", target: e.id, choice: "protect" })
                  }
                >
                  Proteger o dinheiro
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    command({ kind: "defend", target: e.id, choice: "call" })
                  }
                >
                  Chamar ajuda NPC
                </button>
              </>
            )}
          </div>
        ))}
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button onClick={() => setToast("")} aria-label="Fechar aviso">
            <X size={16} />
          </button>
        </div>
      )}
      {auth && (
        <Auth
          mode={auth}
          setMode={setAuth}
          close={() => setAuth(null)}
          done={async () => {
            booted.current = false;
            setAuth(null);
            await refresh();
          }}
          notify={notify}
        />
      )}
      {challenge && (
        <Modal label={challenge.name} onClose={() => setChallenge(null)}>
          <div className="modal-symbol">
            <GraduationCap />
          </div>
          <span className="eyebrow">UMA ESCOLHA FAZ A DIFERENÇA</span>
          <h2>{challenge.name}</h2>
          <p>{challenge.question}</p>
          <div className="choices">
            {challenge.options.map((o) => (
              <button
                className="outline"
                disabled={busy}
                key={o}
                onClick={async () => {
                  if (
                    await command({
                      kind: "activity",
                      target: challenge.id,
                      choice: o,
                    })
                  )
                    setChallenge(null);
                }}
              >
                {o}
                <ArrowRight size={16} />
              </button>
            ))}
          </div>
          <small>
            {challenge.seconds} segundos ·{" "}
            {challenge.reward
              ? `Recebes ${euro(challenge.reward)}`
              : euro(challenge.cost)}
          </small>
        </Modal>
      )}
      {phone && state && (
        <Phone
          tab={phone}
          setTab={setPhone}
          state={state}
          world={world}
          close={() => setPhone("")}
          command={command}
          busy={busy}
          go={go}
          notify={notify}
          logout={async () => {
            await fetch("/v1/logout", { method: "POST" });
            setState(null);
            setPhone("");
            booted.current = false;
          }}
          locale={locale}
          setLocale={changeLocale}
        />
      )}
      <button className="mobile-explore" onClick={() => setMobilePanel(true)}>
        <MapPin size={18} />
        Ver local
      </button>
    </main>
  );
}
function findPath(
  world: World,
  from: string,
  to: string,
  preference: string,
): Route[] {
  const queue: { id: string; path: Route[]; cost: number }[] = [
    { id: from, path: [], cost: 0 },
  ];
  const seen = new Set<string>();
  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost);
    const node = queue.shift()!;
    if (seen.has(node.id)) continue;
    if (node.id === to) return node.path;
    seen.add(node.id);
    for (const r of world.routes) {
      const next =
        r.fromHub === node.id ? r.toHub : r.toHub === node.id ? r.fromHub : "";
      if (!next || seen.has(next)) continue;
      queue.push({
        id: next,
        path: [...node.path, r],
        cost:
          node.cost +
          (preference === "cheap"
            ? r.fare * 1000 + r.seconds
            : r.seconds * 1000 + r.fare),
      });
    }
  }
  return [];
}
function Auth({
  mode,
  setMode,
  close,
  done,
  notify,
}: {
  mode: "login" | "register";
  setMode: (s: "login" | "register") => void;
  close: () => void;
  done: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [color, setColor] = useState("terra");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const r = await fetch("/v1/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          handle: f.get("handle"),
          password: f.get("password"),
          name: f.get("name") || "",
          story: f.get("story") || "",
          pronouns: f.get("pronouns") || "",
          bio: f.get("bio") || "",
          interests: f.get("interests") || "",
          color,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        notify(pt[d.error as keyof typeof pt] || pt.server);
        return;
      }
      await done();
    } catch {
      notify(pt.network);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      label={mode === "register" ? "Criar personagem" : "Iniciar sessão"}
      onClose={close}
    >
      <div className="modal-symbol">
        <Sun />
      </div>
      <span className="eyebrow">BEM-VINDO A LISBOA</span>
      <h2>
        {mode === "register"
          ? "A tua história começa aqui."
          : "Bom ter-te de volta."}
      </h2>
      <p>
        {mode === "register"
          ? "Uma personagem adulta. Uma cidade de possibilidades."
          : "O bairro está à tua espera. Continua de onde ficaste."}
      </p>
      <form onSubmit={submit} className="form">
        {mode === "register" && (
          <>
            <label>
              Nome da personagem
              <input
                name="name"
                required
                minLength={2}
                maxLength={40}
                placeholder="Como te chamas?"
                autoComplete="off"
              />
            </label>
            <div className="form-row">
              <label>
                O teu ponto de partida
                <select name="story">
                  <option value="newcomer">Acabei de chegar</option>
                  <option value="local">Sou de cá</option>
                  <option value="student">Vim estudar</option>
                  <option value="returning">Estou de regresso</option>
                </select>
              </label>
              <label>
                Pronomes
                <input name="pronouns" maxLength={40} placeholder="Opcional" />
              </label>
            </div>
            <label>
              Sobre ti
              <input
                name="bio"
                maxLength={280}
                placeholder="Uma frase sobre a tua personagem (opcional)"
              />
            </label>
            <label>
              Interesses
              <input
                name="interests"
                maxLength={120}
                placeholder="Música, surf, cozinha…"
              />
            </label>
            <fieldset className="avatar-options">
              <legend>O teu estilo</legend>
              {["terra", "blue", "green"].map((c) => (
                <button
                  key={c}
                  type="button"
                  className={"avatar " + c + (color === c ? " picked" : "")}
                  aria-label={
                    "Escolher " +
                    { terra: "terracota", blue: "azul", green: "verde" }[c]
                  }
                  aria-pressed={color === c}
                  onClick={() => setColor(c)}
                >
                  {color === c ? <Check size={18} /> : <Users size={18} />}
                </button>
              ))}
            </fieldset>
          </>
        )}
        <label>
          Nome de utilizador
          <input
            name="handle"
            required
            pattern="[a-z0-9_]{3,24}"
            minLength={3}
            maxLength={24}
            placeholder="o_teu_nome"
            autoComplete="username"
          />
          <small>3–24 letras minúsculas, algarismos ou sublinhados.</small>
        </label>
        <label>
          Palavra-passe
          <input
            type="password"
            name="password"
            minLength={10}
            maxLength={72}
            required
            placeholder="Pelo menos 10 caracteres"
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
          />
        </label>
        <button className="primary full" disabled={busy}>
          {busy ? (
            <LoaderCircle className="spin" size={18} />
          ) : mode === "register" ? (
            "Entrar na minha nova vida"
          ) : (
            "Entrar"
          )}
          <ArrowRight size={17} />
        </button>
      </form>
      <button
        className="text-button auth-switch"
        onClick={() => setMode(mode === "login" ? "register" : "login")}
      >
        {mode === "login"
          ? "Ainda não tens conta? Cria a tua personagem."
          : "Já tens uma personagem? Inicia sessão."}
      </button>
      <small className="muted">
        Moeda e regras fictícias. Sem pagamentos reais.
      </small>
    </Modal>
  );
}
function Phone({
  tab,
  setTab,
  state,
  world,
  close,
  command,
  busy,
  go,
  notify,
  logout,
  locale,
  setLocale,
}: {
  tab: string;
  setTab: (s: string) => void;
  state: Snapshot;
  world: World;
  close: () => void;
  command: (c: Omit<Cmd, "key">) => Promise<boolean>;
  busy: boolean;
  go: (v: Venue) => void;
  notify: (s: string) => void;
  logout: () => Promise<void>;
  locale: Locale;
  setLocale: (locale: Locale) => void;
}) {
  const p = state.player;
  const [recipient, setRecipient] = useState(""),
    [amount, setAmount] = useState(""),
    [note, setNote] = useState(""),
    [review, setReview] = useState<{
      id: string;
      name: string;
      handle: string;
      amount: number;
      note: string;
    } | null>(null),
    [message, setMessage] = useState(""),
    [dm, setDm] = useState(false),
    [muted, setMuted] = useState<string[]>([]),
    [search, setSearch] = useState("");
  useEffect(() => {
    try {
      setMuted(JSON.parse(localStorage.getItem("lv-muted") || "[]"));
    } catch {}
  }, []);
  function mute(handle: string) {
    const next = muted.includes(handle)
      ? muted.filter((h) => h !== handle)
      : [...muted, handle];
    setMuted(next);
    localStorage.setItem("lv-muted", JSON.stringify(next));
  }
  async function reviewTransfer(e: FormEvent) {
    e.preventDefault();
    const cents = parseCents(amount);
    if (cents === null || cents <= 0) {
      notify(pt.invalid_amount);
      return;
    }
    try {
      const r = await fetch(
        "/v1/profile?handle=" + encodeURIComponent(recipient),
      );
      const d = await r.json();
      if (!r.ok) {
        notify(pt[d.error as keyof typeof pt] || pt.server);
        return;
      }
      if (d.id === p.id) {
        notify("Escolhe outra pessoa como destinatária.");
        return;
      }
      setReview({ ...d, amount: cents, note });
    } catch {
      notify(pt.network);
    }
  }
  const tabs = [
    ["bank", "Carteira", Wallet],
    ["jobs", "Trabalho", Briefcase],
    ["messages", "Mensagens", MessageCircle],
    ["life", "A minha vida", Heart],
    ["justice", "Cidadania", Scale],
    ["settings", "Definições", Settings],
  ] as const;
  const messages = state.messages
    .filter((m) => (dm ? m.recipient !== null : m.venue === p.venue))
    .filter((m) => !muted.includes(m.handle))
    .slice()
    .reverse();
  return (
    <Modal label="O meu telemóvel" onClose={close} wide>
      <div className="phone-header">
        <span className="eyebrow">O MEU TELEMÓVEL</span>
        <h2>{tabs.find((t) => t[0] === tab)?.[1] || "Administração"}</h2>
        <p>@{p.handle} · Lisboa Viva</p>
      </div>
      <div className="phone-tabs">
        {tabs.map(([id, label, I]) => (
          <button
            className={tab === id ? "active" : ""}
            key={id}
            onClick={() => {
              setTab(id);
              if (id === "messages") command({ kind: "read" });
            }}
          >
            <I size={17} />
            {label}
          </button>
        ))}
        {p.admin && (
          <button onClick={() => setTab("admin")}>
            <ShieldCheck size={17} />
            Administração
          </button>
        )}
      </div>
      <div className="phone-content">
        {tab === "bank" && (
          <>
            <div className="bank-card">
              <span>SALDO DISPONÍVEL</span>
              <strong>{euro(p.bank)}</strong>
              <div>
                <span>Conta virtual · @{p.handle}</span>
                <Landmark size={24} />
              </div>
            </div>
            <div className="cash-line">
              <Backpack size={17} />
              Dinheiro no bolso<strong>{euro(p.cash)}</strong>
            </div>
            {review ? (
              <section className="review">
                <span className="eyebrow">CONFIRMAR TRANSFERÊNCIA</span>
                <h3>
                  {euro(review.amount)} para {review.name}
                </h3>
                <p>@{review.handle}</p>
                {review.note && <p>{review.note}</p>}
                <p>
                  O dinheiro sai da tua conta e chega à conta desta personagem,
                  mesmo que esteja offline.
                </p>
                <div className="form-row">
                  <button
                    className="outline"
                    disabled={busy}
                    onClick={() => setReview(null)}
                  >
                    Voltar
                  </button>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await command({
                          kind: "transfer",
                          target: review.handle,
                          amount: review.amount,
                          text: review.note,
                        })
                      ) {
                        setReview(null);
                        setAmount("");
                        setNote("");
                      }
                    }}
                  >
                    Enviar dinheiro <ArrowRight size={16} />
                  </button>
                </div>
              </section>
            ) : (
              <form className="form" onSubmit={reviewTransfer}>
                <h3>Enviar dinheiro</h3>
                <div className="form-row">
                  <label>
                    Destinatário
                    <input
                      required
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      placeholder="@nome_de_utilizador"
                    />
                  </label>
                  <label>
                    Montante em euros
                    <input
                      required
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0,00"
                    />
                  </label>
                </div>
                <label>
                  Nota opcional
                  <input
                    maxLength={120}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Pelo jantar de ontem…"
                  />
                </label>
                <button className="primary" disabled={busy}>
                  Rever transferência <ArrowRight size={16} />
                </button>
              </form>
            )}
            {p.venue === "bank" ? (
              <div className="atm">
                <h3>Depósitos e levantamentos</h3>
                <p>Usa o montante indicado acima.</p>
                <button
                  className="outline"
                  disabled={busy}
                  onClick={() =>
                    command({
                      kind: "deposit",
                      amount: parseCents(amount) ?? 0,
                    })
                  }
                >
                  Depositar
                </button>
                <button
                  className="outline"
                  disabled={busy}
                  onClick={() =>
                    command({
                      kind: "withdraw",
                      amount: parseCents(amount) ?? 0,
                    })
                  }
                >
                  Levantar
                </button>
              </div>
            ) : (
              <button
                className="text-button"
                onClick={() => go(world.venues.find((v) => v.id === "bank")!)}
              >
                Visitar a Caixa do Tejo para depositar ou levantar{" "}
                <ArrowUpRight size={15} />
              </button>
            )}
            <h3>Movimentos e comprovativos</h3>
            <div className="receipts">
              {state.receipts.map((r, i) => (
                <div key={r.id + i}>
                  <span className="receipt-icon">
                    <Wallet size={17} />
                  </span>
                  <span>
                    <strong>{kinds[r.kind] || "Movimento"}</strong>
                    <small>
                      {r.note || "Sem nota"}
                      {r.counterparty ? " · @" + r.counterparty : ""}
                    </small>
                    <small>
                      {time(r.created_at)} ·{" "}
                      {r.wallet === "cash"
                        ? "Dinheiro no bolso"
                        : "Conta bancária"}{" "}
                      · Concluído
                    </small>
                    <code>{r.id.slice(0, 8)}</code>
                  </span>
                  <strong className={r.amount > 0 ? "positive" : ""}>
                    {r.amount > 0 ? "+" : ""}
                    {euro(r.amount)}
                  </strong>
                </div>
              ))}
            </div>
          </>
        )}
        {tab === "jobs" && (
          <>
            <p className="callout">
              <Briefcase size={20} />
              Um pequeno turno pode abrir uma grande porta. As vagas NPC estão
              disponíveis mesmo quando não há outros jogadores.
            </p>
            {world.activities
              .filter((a) => a.reward > 0)
              .map((a) => {
                const v = world.venues.find((v) => v.id === a.venue)!;
                return (
                  <div className="job-card" key={a.id}>
                    <div>
                      <span className="eyebrow">
                        {world.hubs.find((h) => h.id === v.hub)?.name}
                      </span>
                      <h3>{a.name}</h3>
                      <p>
                        {v.name} · {a.seconds} segundos
                      </p>
                      <small>
                        {a.requires
                          ? "Requer qualificação de atendimento"
                          : "Sem experiência necessária"}{" "}
                        · +1 {skillNames[a.skill]}
                      </small>
                    </div>
                    <strong>{euro(a.reward)}</strong>
                    <button className="outline" onClick={() => go(v)}>
                      Ver local <ArrowUpRight size={15} />
                    </button>
                  </div>
                );
              })}
          </>
        )}
        {tab === "messages" && (
          <>
            <div className="segmented">
              <button
                className={!dm ? "chosen" : ""}
                onClick={() => setDm(false)}
              >
                Conversa local
              </button>
              <button
                className={dm ? "chosen" : ""}
                onClick={() => setDm(true)}
              >
                Mensagens privadas
              </button>
            </div>
            <p className="small muted">
              {dm
                ? "As mensagens permitidas chegam mesmo quando a outra pessoa está offline."
                : "A conversar em " +
                  world.venues.find((v) => v.id === p.venue)?.name +
                  ". A sala muda quando chegas a outro local."}
            </p>
            <div className="chat-log" aria-live="polite">
              {messages.length ? (
                messages.map((m) => (
                  <article
                    key={m.id}
                    className={m.sender === p.id ? "mine" : ""}
                  >
                    <div>
                      <strong>{m.name}</strong>
                      <span>
                        @{m.handle} · {time(m.created_at)}
                      </span>
                      {m.recipient && (
                        <small>
                          {m.sender === p.id
                            ? "Enviada em privado"
                            : "Recebida em privado"}
                        </small>
                      )}
                    </div>
                    <p>{m.body}</p>
                    {m.sender !== p.id && (
                      <button
                        className="text-button"
                        onClick={() => {
                          setRecipient(m.handle);
                          setDm(true);
                        }}
                      >
                        Responder
                      </button>
                    )}
                  </article>
                ))
              ) : (
                <div className="empty-state">
                  <MessageCircle size={32} />
                  <h3>A conversa começa contigo.</h3>
                  <p>
                    {dm
                      ? "Ainda não há mensagens privadas."
                      : "Diz olá ao bairro."}
                  </p>
                </div>
              )}
            </div>
            <form
              className="form chat-compose"
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await command({
                    kind: "message",
                    target: dm ? recipient : "",
                    text: message,
                  })
                ) {
                  setMessage("");
                  await command({ kind: "read" });
                }
              }}
            >
              {dm && (
                <label>
                  Enviar a
                  <input
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder="@nome_de_utilizador"
                    required
                  />
                </label>
              )}
              <label>
                Mensagem
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={500}
                  required
                  placeholder="Escreve a tua mensagem…"
                />
              </label>
              <button className="primary" disabled={busy}>
                Enviar mensagem <Send size={16} />
              </button>
            </form>
          </>
        )}
        {tab === "life" && (
          <>
            <div className="character-card">
              <span className={"avatar large " + p.state.color}>
                {p.name[0]}
              </span>
              <div>
                <h3>{p.name}</h3>
                <p>
                  {p.state.pronouns || "Uma vida em Lisboa"} · @{p.handle}
                </p>
                <small>
                  {p.state.bio || "A tua história ainda está a começar."}
                </small>
              </div>
            </div>
            <div className="quest-detail">
              <span className="eyebrow">
                OS PRIMEIROS VIZINHOS · {p.state.quest}/3
              </span>
              <h3>
                {
                  [
                    "A Amélia tem uma sugestão para ti",
                    "Uma bica com a Rita",
                    "Uma nova oportunidade",
                    "Já fazes parte do bairro",
                  ][p.state.quest]
                }
              </h3>
              <p>
                {
                  [
                    p.state.story === "student"
                      ? "A Amélia quer mostrar-te onde podes estudar e trabalhar no bairro. Fala com ela em casa."
                      : p.state.story === "returning"
                        ? "O bairro mudou desde a última vez. A Amélia ajuda-te a reencontrá-lo. Fala com ela em casa."
                        : p.state.story === "local"
                          ? "Mesmo quem é de cá tem novos vizinhos para conhecer. Fala com a Amélia em casa."
                          : "«Bem-vindo ao bairro! Antes de mais, vamos conhecer as pessoas.» Fala com a Amélia em casa.",
                    "Vai ao Café da Esquina, pede uma bica e conversa com a Rita.",
                    "A Rita recomendou o curso de atendimento da Escola Oficina. Conclui-o e volta a casa para contar as novidades à Amélia.",
                    "A Amélia deu-te 10 € e a confiança do bairro cresceu. A cozinha da Bica já pode ser o teu próximo trabalho.",
                  ][p.state.quest]
                }
              </p>
              <button
                className="outline"
                onClick={() =>
                  go(
                    world.venues.find(
                      (v) =>
                        v.id ===
                        (p.state.quest === 1
                          ? "cafe"
                          : p.state.quest === 2 && !state.qualifications.length
                            ? "school"
                            : "home"),
                    )!,
                  )
                }
              >
                Ver próximo local <ArrowRight size={15} />
              </button>
            </div>
            <h3>Na tua mochila</h3>
            {state.inventory.length ? (
              state.inventory.map((i) => (
                <div className="cash-line" key={i.item}>
                  <ShoppingBasket size={18} />
                  <span>Pão e fruta · {i.quantity}</span>
                  <button
                    className="outline"
                    disabled={busy}
                    onClick={() => command({ kind: "consume" })}
                  >
                    Comer
                  </button>
                </div>
              ))
            ) : (
              <p className="muted">
                A mochila está vazia. O mercado tem pão e fruta.
              </p>
            )}
            <h3>Competências e qualificações</h3>
            <div className="skills">
              {Object.entries(p.state.skills).length ? (
                Object.entries(p.state.skills).map(([k, v]) => (
                  <span key={k}>
                    {skillNames[k]} <b>{v}</b>
                  </span>
                ))
              ) : (
                <p className="muted">
                  Aprendes ao fazer. Experimenta um turno ou uma atividade.
                </p>
              )}
              {state.qualifications.map((q) => (
                <span className="qualification" key={q.qualification}>
                  <GraduationCap size={17} />
                  Atendimento · qualificação obtida
                </span>
              ))}
            </div>
            <h3>As últimas atividades</h3>
            {state.actions
              .filter((a) => a.status !== "running")
              .slice(0, 5)
              .map((a) => (
                <div className="history-line" key={a.id}>
                  <Check size={16} />
                  <span>
                    {a.status === "cancelled"
                      ? "Viagem cancelada"
                      : a.result.activity || a.result.text}
                  </span>
                  <small>{time(a.due_at)}</small>
                </div>
              ))}
          </>
        )}
        {tab === "justice" && (
          <>
            <p className="callout">
              <Scale size={22} />
              Este é um sistema de justiça fictício. Os agentes e juízes NPC só
              usam provas geradas pelo jogo e não têm acesso às tuas mensagens
              privadas.
            </p>
            <label className="toggle">
              <span>
                <strong>Participar em encontros de risco</strong>
                <small>
                  Ambos têm de aceitar este modo. Perda máxima: 10% do dinheiro
                  no bolso, até 100 €. O banco fica protegido.
                </small>
              </span>
              <input
                type="checkbox"
                checked={p.state.risk}
                disabled={busy}
                onChange={(e) =>
                  command({ kind: "risk", enabled: e.target.checked })
                }
              />
            </label>
            <p className="small muted">
              {Date.parse(p.state.protectedUntil) > Date.now()
                ? "Estás sob proteção até às " +
                  time(p.state.protectedUntil) +
                  "."
                : "A tua proteção inicial terminou. As zonas tranquilas continuam protegidas."}{" "}
              O modo é sempre opcional.
            </p>
            {Date.parse(p.state.detainedUntil) > Date.now() && (
              <p className="callout">
                Retenção breve até às {time(p.state.detainedUntil)}. A
                libertação é automática, mesmo se saíres do jogo.
              </p>
            )}
            <h3>Os teus processos</h3>
            {state.cases.length ? (
              state.cases.map((c) => (
                <article className="case-card" key={c.id}>
                  <span className="eyebrow">PROCESSO {c.id.slice(0, 8)}</span>
                  <h3>
                    {c.status === "warning"
                      ? "Advertência após recurso"
                      : c.status === "closed"
                        ? "Processo encerrado"
                        : "Serviço comunitário"}
                  </h3>
                  <details>
                    <summary>Consultar prova e histórico</summary>
                    <p>
                      Prova autenticada: evento {c.evidence.event.slice(0, 8)} ·{" "}
                      {euro(c.evidence.amount)} ·{" "}
                      {
                        world.venues.find((v) => v.id === c.evidence.venue)
                          ?.name
                      }
                    </p>
                    {c.history.map((h, i) => (
                      <div className="case-step" key={i}>
                        <strong>{h.stage}</strong>
                        <p>{h.text}</p>
                      </div>
                    ))}
                  </details>
                  <div className="form-row">
                    {!c.appealed && (
                      <button
                        className="outline"
                        disabled={busy}
                        onClick={() =>
                          command({ kind: "appeal", target: c.id })
                        }
                      >
                        Apresentar recurso
                      </button>
                    )}
                    {c.status === "service" && !c.service_done && (
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() =>
                          p.venue === "community"
                            ? command({ kind: "service", target: c.id })
                            : go(
                                world.venues.find((v) => v.id === "community")!,
                              )
                        }
                      >
                        {p.venue === "community"
                          ? "Iniciar serviço · 12 s"
                          : "Ir à associação"}
                      </button>
                    )}
                  </div>
                </article>
              ))
            ) : (
              <div className="empty-state">
                <ShieldCheck size={30} />
                <h3>Nenhum processo em teu nome.</h3>
                <p>Aproveita a cidade ao teu ritmo.</p>
              </div>
            )}
            <h3>Comprovativos de encontros</h3>
            {state.encounters
              .filter((e) => e.status === "completed")
              .map((e) => (
                <div className="history-line" key={e.id}>
                  <ShieldCheck size={16} />
                  <span>
                    @{e.attacker_handle} → @{e.victim_handle}
                    <small>Concluído · {e.id.slice(0, 8)}</small>
                  </span>
                  <strong>{euro(e.amount)}</strong>
                </div>
              ))}
          </>
        )}
        {tab === "settings" && (
          <>
            <div className="character-card">
              <span className={"avatar large " + p.state.color}>
                {p.name[0]}
              </span>
              <div>
                <h3>{p.name}</h3>
                <p>@{p.handle}</p>
              </div>
            </div>
            <div className="settings-language">
              <div>
                <strong>Idioma / Language</strong>
                <small>Português (Portugal) · English</small>
              </div>
              <LanguageToggle locale={locale} onChange={setLocale} />
            </div>
            <div className="callout">
              Idioma: Português (Portugal). O jogo respeita a preferência de
              movimento reduzido do teu dispositivo. O som está desligado.
            </div>
            <label className="toggle">
              <span>
                <strong>Receber mensagens privadas</strong>
                <small>Podes desligar esta opção em qualquer altura.</small>
              </span>
              <input
                type="checkbox"
                checked={p.state.dms}
                disabled={busy}
                onChange={(e) =>
                  command({ kind: "dm_permission", enabled: e.target.checked })
                }
              />
            </label>
            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                command({ kind: "report", target: recipient, text: note });
              }}
            >
              <h3>Segurança e convívio</h3>
              <label>
                Nome de utilizador
                <input
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  required
                  placeholder="@nome_de_utilizador"
                />
              </label>
              <div className="form-row">
                <button
                  type="button"
                  className="outline"
                  disabled={busy}
                  onClick={() => command({ kind: "block", target: recipient })}
                >
                  Bloquear pessoa
                </button>
                <button
                  type="button"
                  className="outline"
                  disabled={!recipient}
                  onClick={() => mute(recipient.replace("@", ""))}
                >
                  Silenciar / voltar a ouvir
                </button>
              </div>
              <label>
                Motivo da denúncia
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  required
                  minLength={5}
                  maxLength={500}
                  placeholder="Descreve o comportamento que pretendes denunciar."
                />
              </label>
              <button className="outline" disabled={busy}>
                Enviar denúncia à moderação
              </button>
              <small>
                As denúncias de abuso são separadas dos crimes fictícios do
                jogo.
              </small>
            </form>
            {state.blocks.map((b) => (
              <div className="cash-line" key={b.id}>
                @{b.handle}
                <button
                  className="tiny"
                  onClick={() => command({ kind: "unblock", target: b.handle })}
                >
                  Desbloquear
                </button>
              </div>
            ))}
            {muted.length > 0 && (
              <p>Silenciados neste dispositivo: {muted.join(", ")}</p>
            )}
            <button className="outline logout" onClick={logout}>
              <LogOut size={17} />
              Terminar sessão
            </button>
          </>
        )}
        {tab === "admin" && p.admin && (
          <>
            <p className="callout">
              As correções criam movimentos no registo financeiro. As funções
              administrativas não são atribuídas às profissões do jogo.
            </p>
            <form
              className="form"
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await fetch(
                  "/v1/profile?handle=" + encodeURIComponent(search),
                );
                const d = await r.json();
                notify(
                  r.ok ? `${d.name} · @${d.handle} · ${d.id}` : pt.not_found,
                );
              }}
            >
              <label>
                Procurar jogador
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  required
                />
              </label>
              <button className="outline">Procurar</button>
            </form>
            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                command({
                  kind: "admin_adjust",
                  target: search,
                  amount: parseCents(amount) ?? 0,
                  text: note,
                });
              }}
            >
              <label>
                Correção em euros (pode ser negativa)
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </label>
              <label>
                Justificação obrigatória
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  minLength={5}
                  required
                />
              </label>
              <button className="outline" disabled={busy}>
                Registar correção
              </button>
              <div className="form-row">
                <button
                  type="button"
                  className="outline"
                  disabled={busy || note.length < 5}
                  onClick={() =>
                    command({
                      kind: "admin_ban",
                      target: search,
                      enabled: true,
                      text: note,
                    })
                  }
                >
                  Suspender conta
                </button>
                <button
                  type="button"
                  className="outline"
                  disabled={busy || note.length < 5}
                  onClick={() =>
                    command({
                      kind: "admin_ban",
                      target: search,
                      enabled: false,
                      text: note,
                    })
                  }
                >
                  Reativar conta
                </button>
              </div>
              <label>
                Disponibilidade de espaços e atividades
                <select
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                >
                  <option value="">Escolher</option>
                  {world.venues.map((v) => (
                    <option value={"venue:" + v.id} key={v.id}>
                      {v.name}
                    </option>
                  ))}
                  {world.activities.map((a) => (
                    <option value={"activity:" + a.id} key={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-row">
                <button
                  type="button"
                  className="outline"
                  disabled={busy || !recipient || note.length < 5}
                  onClick={() =>
                    command({
                      kind: "admin_setting",
                      target: recipient,
                      enabled: true,
                      text: note,
                    })
                  }
                >
                  Suspender
                </button>
                <button
                  type="button"
                  className="outline"
                  disabled={busy || !recipient || note.length < 5}
                  onClick={() =>
                    command({
                      kind: "admin_setting",
                      target: recipient,
                      enabled: false,
                      text: note,
                    })
                  }
                >
                  Reativar
                </button>
              </div>
            </form>
            <h3>Denúncias</h3>
            {state.reports?.map((r) => (
              <div className="case-card" key={r.id}>
                <strong>@{r.handle}</strong>
                <p>{r.reason}</p>
                {r.status === "open" ? (
                  <button
                    className="outline"
                    disabled={busy}
                    onClick={() =>
                      command({
                        kind: "admin_report",
                        target: r.id,
                        text: "Denúncia revista pela moderação.",
                      })
                    }
                  >
                    Marcar como resolvida
                  </button>
                ) : (
                  <small>Resolvida</small>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </Modal>
  );
}
function parseCents(s: string) {
  if (!/^-?\d{1,6}([,.]\d{1,2})?$/.test(s.trim())) return null;
  const sign = s.trim().startsWith("-") ? -1 : 1;
  const [whole, frac = ""] = s
    .trim()
    .replace("-", "")
    .replace(",", ".")
    .split(".");
  return sign * (Number(whole) * 100 + Number(frac.padEnd(2, "0")));
}
