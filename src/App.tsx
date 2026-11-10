import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Compass,
  Crosshair,
  Globe2,
  Info,
  Layers2,
  LocateFixed,
  Moon,
  Pause,
  Play,
  Plus,
  Search,
  Sun,
  X,
} from "lucide-react";
import tzlookup from "tz-lookup";
import type { HoverZone } from "./Globe";
import {
  cityName,
  clock,
  dateLabel,
  differenceLabel,
  isDaytime,
  localInput,
  parseLocalInput,
  places,
  utcLabel,
} from "./time";

const Globe = lazy(() => import("./Globe"));
const supportedZones = [
  ...new Set([
    ...Intl.supportedValuesOf("timeZone"),
    ...places.map((place) => place.zone),
    "UTC",
  ]),
];
const initialHome = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const initialZone =
  initialHome === "Asia/Tokyo" ? "Europe/London" : "Asia/Tokyo";
const starStyles = Array.from({ length: 85 }, (_, i) => ({
  left: `${((i * 73.37 + 11) % 100).toFixed(2)}%`,
  top: `${((i * 37.19 + 3) % 100).toFixed(2)}%`,
  width: i % 11 === 0 ? 2 : 1,
  height: i % 11 === 0 ? 2 : 1,
  animationDelay: `${-(i % 7)}s`,
  animationDuration: `${3 + (i % 5)}s`,
}));

type SearchMode = "destination" | "home" | "add" | null;

function App() {
  const [now, setNow] = useState(new Date());
  const [home, setHome] = useState(initialHome);
  const [selected, setSelected] = useState(initialZone);
  const [hover, setHover] = useState<HoverZone>(null);
  const [customInstant, setCustomInstant] = useState<Date | null>(null);
  const [input, setInput] = useState("");
  const [timeError, setTimeError] = useState("");
  const [boundaries, setBoundaries] = useState(true);
  const [rotating, setRotating] = useState(true);
  const [focus, setFocus] = useState<{
    lat: number;
    lon: number;
    key: number;
  } | null>(null);
  const [searchMode, setSearchMode] = useState<SearchMode>(null);
  const [query, setQuery] = useState("");
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState("");
  const [about, setAbout] = useState(false);
  const [favorites, setFavorites] = useState([
    "America/New_York",
    "Europe/London",
    "Asia/Tokyo",
    "Australia/Sydney",
  ]);
  const [copied, setCopied] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const instant = customInstant ?? now;
  const destination = hover?.zone ?? selected;
  const selectedPlace = places.find((place) => place.zone === selected);
  const matchingZones = supportedZones
    .filter((zone) =>
      zone
        .replaceAll("_", " ")
        .toLowerCase()
        .includes(query.toLowerCase().trim()),
    )
    .slice(0, 60);
  const modalOpen = searchMode !== null || about;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 8000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!modalOpen) return;
    restoreFocus.current = document.activeElement as HTMLElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => {
      if (searchMode) searchInput.current?.focus();
      else
        dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    }, 0);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSearchMode(null);
        setAbout(false);
      }
      if (event.key !== "Tab") return;
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
        "button, input, a[href]",
      );
      if (!focusables?.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      restoreFocus.current?.focus();
    };
  }, [modalOpen, searchMode]);

  function chooseZone(zone: string) {
    setSelected(zone);
    setHover(null);
    const place = places.find((item) => item.zone === zone);
    if (place) setFocus({ lat: place.lat, lon: place.lon, key: Date.now() });
  }

  function openSearch(mode: SearchMode) {
    setQuery("");
    setSearchMode(mode);
  }

  function onSearchSelect(zone: string) {
    if (searchMode === "home") {
      setHome(zone);
      if (customInstant) setInput(localInput(customInstant, zone));
      setTimeError("");
    } else if (searchMode === "add") {
      if (favorites.includes(zone))
        setNotice(`${cityName(zone)} is already in your world clock.`);
      else if (favorites.length >= 8)
        setNotice(
          "Your world clock has room for 8 places. Remove a place first.",
        );
      else setFavorites((previous) => [...previous, zone]);
      chooseZone(zone);
    } else chooseZone(zone);
    setSearchMode(null);
  }

  function locate() {
    if (!navigator.geolocation) {
      setNotice(
        "Geolocation is not supported. Choose your home time zone manually.",
      );
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const zone = tzlookup(coords.latitude, coords.longitude);
        setHome(zone);
        if (customInstant) setInput(localInput(customInstant, zone));
        setTimeError("");
        setFocus({
          lat: coords.latitude,
          lon: coords.longitude,
          key: Date.now(),
        });
        setLocating(false);
        setNotice(
          `You're in ${cityName(zone)}'s time zone. Your location stays in your browser.`,
        );
      },
      (error) => {
        setLocating(false);
        setNotice(
          error.code === 1
            ? "Location permission was declined. Your device's time zone is still available; you can also choose it manually."
            : "We couldn't find your location. Choose your home time zone manually.",
        );
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 },
    );
  }

  function changeTime(value: string) {
    setInput(value);
    if (!value) {
      setTimeError("Choose a date and time, or select Live to return to now.");
      return;
    }
    try {
      setCustomInstant(parseLocalInput(value, home));
      setTimeError("");
    } catch (error) {
      console.warn("Local time could not be resolved", error);
      setTimeError(
        "This local time is skipped or occurs twice during a daylight-saving change. Choose another time.",
      );
    }
  }

  async function copyMoment() {
    const text = `${dateLabel(instant, home)}, ${clock(instant, home)} in ${cityName(home)} = ${dateLabel(instant, selected)}, ${clock(instant, selected)} in ${cityName(selected)} (${utcLabel(selected, instant)}).`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.warn("Clipboard unavailable", error);
      setNotice(
        "Your browser couldn't access the clipboard. You can select and copy the converted time below.",
      );
    }
  }

  return (
    <div className="app-shell">
      <div className="star-field" aria-hidden="true">
        {starStyles.map((style, i) => (
          <i key={i} style={style} />
        ))}
      </div>
      <header className="header">
        <a className="brand" href="#" aria-label="Meridian home">
          <span className="brand-symbol">
            <Globe2 size={26} strokeWidth={1.35} />
          </span>
          meridian<span className="brand-dot">.</span>
        </a>
        <nav className="navigation" aria-label="Main navigation">
          <a className="nav-active" href="#explore">
            Explore
          </a>
          <a href="#world-clock">
            World clock <ArrowUpRight size={12} />
          </a>
          <button onClick={() => setAbout(true)}>
            The perspective <ArrowUpRight size={12} />
          </button>
        </nav>
        <div className="header-local">
          <span className="live-dot" /> <span>YOUR LOCAL TIME</span>
          <strong>{clock(now, home)}</strong>
          <span className="local-zone">{utcLabel(home, now)}</span>
        </div>
      </header>

      <main>
        <section className="hero" id="explore" aria-labelledby="hero-heading">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="tiny-orbit" /> A DIFFERENT PERSPECTIVE ON TIME
            </div>
            <h1 id="hero-heading">
              One planet.
              <br />
              Countless
              <br />
              <span>moments.</span>
            </h1>
            <p className="hero-description">
              Somewhere, the day is just beginning.
              <br className="desktop-break" /> Somewhere else, the stars are
              out.
              <br className="desktop-break" /> Find your moment in between.
            </p>
            <button
              className="locate-button"
              onClick={locate}
              disabled={locating}
            >
              <LocateFixed size={16} className={locating ? "spin" : ""} />
              {locating ? "Finding your place…" : "Find my place"}
              <ArrowUpRight size={16} />
            </button>
            <div className="home-caption">
              <span className="live-dot" />
              Your time zone{" "}
              <button onClick={() => openSearch("home")}>
                {cityName(home)} <ChevronDown size={11} />
              </button>
            </div>
          </div>

          <div className="globe-stage">
            <div className="globe-aura" aria-hidden="true" />
            <div className="orbital-ring" aria-hidden="true" />
            <Suspense
              fallback={
                <div className="globe-status">
                  <span className="loading-orbit" />
                  Preparing your perspective
                </div>
              }
            >
              <Globe
                instant={instant}
                selectedZone={selected}
                boundaries={boundaries}
                rotating={rotating}
                focus={focus}
                onHover={setHover}
                onSelect={chooseZone}
              />
            </Suspense>
            <div className="globe-topline">
              <span>
                <span className="live-dot" />{" "}
                {customInstant ? "YOUR CHOSEN MOMENT" : "EARTH, RIGHT NOW"}
              </span>
              <span>
                {dateLabel(instant, "UTC").toUpperCase()} ·{" "}
                {clock(instant, "UTC")} UTC
              </span>
            </div>
            <div className="globe-tools" aria-label="Globe controls">
              <button
                className={boundaries ? "tool-active" : ""}
                onClick={() => setBoundaries(!boundaries)}
                aria-label="Toggle time-zone boundaries"
                aria-pressed={boundaries}
                title="Time-zone boundaries"
              >
                <Layers2 size={17} />
              </button>
              <button
                onClick={() => setRotating(!rotating)}
                aria-label={rotating ? "Pause rotation" : "Resume rotation"}
                aria-pressed={rotating}
                title={rotating ? "Pause rotation" : "Resume rotation"}
              >
                {rotating ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <span className="tool-separator" />
              <button
                onClick={() => setFocus({ lat: 23, lon: 24, key: Date.now() })}
                aria-label="Reset globe view"
                title="Reset view"
              >
                <Crosshair size={17} />
              </button>
            </div>
            <div className="globe-instruction">
              <Compass size={14} />
              <span>DRAG TO EXPLORE</span>
              <span className="instruction-dot">·</span>
              <span>SCROLL TO ZOOM</span>
            </div>
            <div className="zone-preview" aria-live="polite">
              <span className="zone-preview-icon">
                {isDaytime(instant, destination) ? (
                  <Sun size={18} />
                ) : (
                  <Moon size={18} />
                )}
              </span>
              <div>
                <span className="micro-label">
                  {hover ? "EXPLORING" : "ON THE OTHER SIDE"}
                </span>
                <button onClick={() => openSearch("destination")}>
                  {cityName(destination)} <ArrowUpRight size={15} />
                </button>
                <span className="zone-preview-detail">
                  {differenceLabel(destination, home, instant)}
                </span>
              </div>
              <strong>
                {clock(instant, destination)}
                <span>{utcLabel(destination, instant)}</span>
              </strong>
            </div>
          </div>

          <div className="moment-panel">
            <div className="moment-heading">
              <span className="micro-label">
                <span className="mini-line" /> FIND A SHARED MOMENT
              </span>
              <button
                className={`live-switch ${!customInstant ? "is-live" : ""}`}
                onClick={() => {
                  setCustomInstant(null);
                  setInput("");
                  setTimeError("");
                }}
              >
                <span className="live-dot" /> LIVE
              </button>
            </div>
            <div className="conversion-grid">
              <div className="conversion-origin">
                <button
                  className="conversion-place"
                  onClick={() => openSearch("home")}
                >
                  Your time <span>{cityName(home)}</span>
                  <ChevronDown size={12} />
                </button>
                <input
                  aria-label="Your date and time"
                  type="datetime-local"
                  value={input || localInput(instant, home)}
                  onChange={(event) => changeTime(event.target.value)}
                  aria-invalid={Boolean(timeError)}
                  aria-describedby={timeError ? "time-error" : undefined}
                />
                <span className="conversion-hint">
                  {utcLabel(home, instant)} <span>·</span>{" "}
                  {customInstant
                    ? "Custom date & time"
                    : "Choose any date & time"}
                </span>
              </div>
              <ArrowRight className="conversion-arrow" size={20} />
              <div className="conversion-result">
                <button
                  className="conversion-place"
                  onClick={() => openSearch("destination")}
                >
                  {cityName(selected)}
                  <ChevronDown size={12} />
                </button>
                <div className="result-time">
                  {clock(instant, selected)}
                  <span>{dateLabel(instant, selected)}</span>
                </div>
                <span className="conversion-hint">
                  {utcLabel(selected, instant)} <span>·</span>{" "}
                  {differenceLabel(selected, home, instant)}
                </span>
              </div>
              <button
                className="share-button"
                onClick={copyMoment}
                aria-label="Copy converted time"
                title="Copy this moment"
              >
                {copied ? <Check size={18} /> : <ArrowUpRight size={19} />}
              </button>
            </div>
            {timeError && (
              <p className="time-error" id="time-error" role="alert">
                {timeError}
              </p>
            )}
          </div>

          <div className="hero-footnote">
            <span className="sunset-swatch" />
            <span>
              Real sunlight. Real time zones.
              <br />
              One beautifully connected world.
            </span>
            <ArrowDown size={17} />
          </div>
        </section>

        <section
          className="world-clock"
          id="world-clock"
          aria-labelledby="world-clock-heading"
        >
          <div className="section-heading">
            <div>
              <span className="eyebrow">DISTANCE IS JUST A NUMBER</span>
              <h2 id="world-clock-heading">
                Meanwhile, elsewhere<span>.</span>
              </h2>
            </div>
            <button className="add-city" onClick={() => openSearch("add")}>
              <Plus size={16} /> Add a place
            </button>
          </div>
          <div className="clock-grid">
            {favorites.map((zone) => {
              const daylight = isDaytime(instant, zone);
              const active = selected === zone;
              return (
                <article
                  className={`clock-card ${active ? "clock-selected" : ""}`}
                  key={zone}
                >
                  <button
                    className="clock-main"
                    onClick={() => chooseZone(zone)}
                    aria-label={`Explore ${cityName(zone)}`}
                    aria-pressed={active}
                  >
                    <div className="clock-card-top">
                      <span className="clock-city">{cityName(zone)}</span>
                      <span className={daylight ? "day-icon" : "night-icon"}>
                        {daylight ? <Sun size={17} /> : <Moon size={16} />}
                      </span>
                    </div>
                    <span className="clock-zone">
                      {utcLabel(zone, instant)}
                      <span className="card-selected-label">
                        {active ? "EXPLORING" : ""}
                      </span>
                    </span>
                    <div className="city-time">
                      {clock(instant, zone)}
                      <span>{clock(instant, zone, true).slice(-2)}</span>
                    </div>
                    <div className="clock-card-bottom">
                      <span>{dateLabel(instant, zone)}</span>
                      <span>
                        {differenceLabel(zone, home, instant)
                          .replace(" of you", "")
                          .replace(" you", "")}
                      </span>
                    </div>
                  </button>
                  <button
                    className="remove-city"
                    aria-label={`Remove ${cityName(zone)}`}
                    title={`Remove ${cityName(zone)}`}
                    onClick={() =>
                      setFavorites((previous) =>
                        previous.filter((item) => item !== zone),
                      )
                    }
                  >
                    <X size={12} />
                  </button>
                </article>
              );
            })}
            {!favorites.length && (
              <div className="empty-clock">
                Your world is waiting. Add a place to keep its time close.
              </div>
            )}
          </div>
        </section>
      </main>

      <footer>
        <span className="footer-tagline">
          <Globe2 size={14} /> A little closer, wherever you are.
        </span>
        <span>MADE FOR A WORLD THAT NEVER STOPS.</span>
        <button onClick={() => setAbout(true)}>
          About & credits <ArrowUpRight size={12} />
        </button>
      </footer>

      {hover && (
        <div
          className="hover-tooltip"
          style={{
            left: Math.min(hover.x + 18, window.innerWidth - 235),
            top: Math.max(12, Math.min(hover.y - 78, window.innerHeight - 100)),
          }}
        >
          <span>
            {cityName(hover.zone)} <strong>{clock(instant, hover.zone)}</strong>
          </span>
          <small>{differenceLabel(hover.zone, home, instant)}</small>
          <span className="hover-hint">CLICK TO KEEP THIS MOMENT</span>
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          <Info size={17} />
          <span>{notice}</span>
          <button
            onClick={() => setNotice("")}
            aria-label="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {modalOpen && (
        <div
          className="modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setSearchMode(null);
              setAbout(false);
            }
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-heading"
            ref={dialogRef}
          >
            <button
              className="modal-close"
              onClick={() => {
                setSearchMode(null);
                setAbout(false);
              }}
              aria-label="Close dialog"
            >
              <X size={20} />
            </button>
            {searchMode ? (
              <>
                <span className="eyebrow">YOUR WORLD, A LITTLE CLOSER</span>
                <h2 id="modal-heading">
                  {searchMode === "home"
                    ? "Where is home?"
                    : searchMode === "add"
                      ? "Keep a place close."
                      : "Where to next?"}
                </h2>
                <div className="search-field">
                  <Search size={18} />
                  <input
                    ref={searchInput}
                    aria-label="Search time zones"
                    placeholder="Search a city or time zone…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
                <p className="search-caption">
                  Search IANA time-zone cities, e.g. London, Tokyo, or New York.
                  You can also tap any place on the globe.
                </p>
                <div className="zone-results">
                  {matchingZones.map((zone) => (
                    <button key={zone} onClick={() => onSearchSelect(zone)}>
                      <span>
                        <strong>{cityName(zone)}</strong>
                        <small>{zone.replaceAll("_", " ")}</small>
                      </span>
                      <span>
                        {clock(instant, zone)}
                        <small>{utcLabel(zone, instant)}</small>
                      </span>
                      <ArrowUpRight size={15} />
                    </button>
                  ))}
                  {!matchingZones.length && (
                    <p className="no-results">
                      No matching time-zone city. Try a nearby major city or
                      select your destination on the globe.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <span className="eyebrow">A DIFFERENT PERSPECTIVE</span>
                <h2 id="modal-heading">Time connects us.</h2>
                <p className="about-copy">
                  Meridian is a small invitation to see the bigger picture.
                  Rotate our planet, follow the light, and find a moment to
                  share with someone a world away.
                </p>
                <div className="about-details">
                  <p>
                    <Sun size={18} />
                    <span>
                      <strong>A living planet</strong>Sunlight and twilight
                      follow the sun's astronomical position at your selected
                      moment. City lights emerge on the night side.
                    </span>
                  </p>
                  <p>
                    <Layers2 size={18} />
                    <span>
                      <strong>Real boundaries, not straight lines</strong>
                      Geographic time-zone outlines from Timezone Boundary
                      Builder (2026f), simplified for the web. Hover lookup uses
                      tz-lookup; tiny borders and recent boundary changes may
                      differ. IANA rules from your browser handle daylight
                      saving and fractional offsets.
                    </span>
                  </p>
                  <p>
                    <LocateFixed size={18} />
                    <span>
                      <strong>Your place stays yours</strong>Your device
                      supplies your initial time zone. Precise location is
                      requested only when you choose “Find my place,” and
                      processed on your device. No account, analytics, or
                      location storage.
                    </span>
                  </p>
                </div>
                <div className="credits">
                  Earth imagery:{" "}
                  <a
                    href="https://visibleearth.nasa.gov/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    NASA Visible Earth
                  </a>{" "}
                  via Three.js. Boundaries:{" "}
                  <a
                    href="https://github.com/evansiroky/timezone-boundary-builder"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Timezone Boundary Builder
                  </a>{" "}
                  / OpenStreetMap contributors, ODbL. Sun/moon icons on city
                  cards indicate approximate local day (07:00–19:00), not
                  calculated sunrise.{" "}
                  <a
                    href="https://github.com/paolo-aliprandi/meridian"
                    target="_blank"
                    rel="noreferrer"
                  >
                    View source <ArrowUpRight size={11} />
                  </a>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <span className="sr-only">{selectedPlace?.country}</span>
    </div>
  );
}

export default App;
