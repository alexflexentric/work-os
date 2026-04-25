"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type StoredEvent = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  source: string;
  location: string | null;
};

type Connection = {
  id: string;
  sourceCalendarName: string;
  color: string | null;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const HOUR_H = 56; // px per hour
const APPLE_COLORS = [
  "#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#5AC8FA",
  "#007AFF", "#AF52DE", "#FF2D55", "#A2845E", "#8E8E93",
];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// ── Date helpers ──────────────────────────────────────────────────────────────

function getWeekStart(d: Date): Date {
  const day = d.getDay();
  const result = new Date(d);
  result.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
}

function localDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtHour(h: number): string {
  if (h === 0) return "";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

function fmtTime(d: Date): string {
  const h = d.getHours(), m = d.getMinutes();
  const ampm = h < 12 ? "am" : "pm";
  const hr = h % 12 || 12;
  return m === 0 ? `${hr}${ampm}` : `${hr}:${String(m).padStart(2, "0")}${ampm}`;
}

function fmtWeekLabel(start: Date, end: Date): string {
  const sm = start.toLocaleString("en", { month: "short" });
  const em = end.toLocaleString("en", { month: "short" });
  const y = end.getFullYear();
  return sm === em
    ? `${sm} ${start.getDate()} – ${end.getDate()}, ${y}`
    : `${sm} ${start.getDate()} – ${em} ${end.getDate()}, ${y}`;
}

// ── Overlap layout ────────────────────────────────────────────────────────────

type LayoutEvent = StoredEvent & { col: number; totalCols: number };

function layoutDay(events: StoredEvent[]): LayoutEvent[] {
  const sorted = events
    .map((e) => ({ e, start: new Date(e.startAt).getTime(), end: new Date(e.endAt).getTime() }))
    .sort((a, b) => a.start - b.start);

  const colEnds: number[] = [];
  const withCols = sorted.map(({ e, start, end }) => {
    let col = colEnds.findIndex((ce) => ce <= start);
    if (col === -1) { col = colEnds.length; colEnds.push(0); }
    colEnds[col] = end;
    return { e, start, end, col };
  });

  return withCols.map(({ e, start, end, col }) => {
    let maxCol = col;
    for (const other of withCols) {
      if (other.start < end && other.end > start) maxCol = Math.max(maxCol, other.col);
    }
    return { ...e, col, totalCols: maxCol + 1 };
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [settings, setSettings] = useState<{ masterCalendarColor?: string }>({});
  const [connections, setConnections] = useState<Connection[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [nowLine, setNowLine] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekEnd = weekDays[6];
  const todayStr = localDate(new Date());

  // Color map: source id → hex
  const colorMap = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {
      master: settings.masterCalendarColor ?? "#007AFF",
    };
    connections.forEach((c, i) => {
      map[c.id] = c.color ?? APPLE_COLORS[i % APPLE_COLORS.length];
    });
    return map;
  }, [settings, connections]);

  // Source display name map
  const nameMap = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = { master: "Master calendar" };
    connections.forEach((c) => { map[c.id] = c.sourceCalendarName; });
    return map;
  }, [connections]);

  // Load settings + connections once
  useEffect(() => {
    Promise.all([
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/calendar/connections").then((r) => r.json()),
    ]).then(([s, c]) => {
      setSettings(s ?? {});
      if (Array.isArray(c)) setConnections(c);
    });
  }, []);

  // Scroll to 7am on first mount
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_H;
  }, []);

  // Update "now" line every minute
  useEffect(() => {
    const update = () => {
      const d = new Date();
      setNowLine(d.getHours() * HOUR_H + (d.getMinutes() / 60) * HOUR_H);
    };
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, []);

  // Load events from DB when week changes, then trigger background sync
  useEffect(() => {
    loadEvents().then(() => {
      sync(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  async function loadEvents() {
    setLoading(true);
    const start = localDate(weekStart);
    const end = localDate(weekEnd);
    const res = await fetch(`/api/calendar/events?start=${start}&end=${end}`);
    const data = await res.json();
    if (Array.isArray(data)) setEvents(data);
    setLoading(false);
  }

  async function sync(silent = false) {
    if (!silent) setSyncing(true);
    else setSyncing(true);
    try {
      await fetch("/api/calendar/sync", { method: "POST" });
      await loadEvents();
    } finally {
      setSyncing(false);
    }
  }

  // Partition events
  const allDayEvs = events.filter((e) => e.allDay);
  const timedEvs = events.filter((e) => !e.allDay);

  // Group timed events by local date
  const byDay = useMemo(() => {
    const map = new Map<string, StoredEvent[]>();
    weekDays.forEach((d) => map.set(localDate(d), []));
    for (const ev of timedEvs) {
      const key = localDate(new Date(ev.startAt));
      map.get(key)?.push(ev);
    }
    return map;
  }, [timedEvs, weekDays]);

  const layoutByDay = useMemo(() => {
    const map = new Map<string, LayoutEvent[]>();
    for (const [day, evs] of byDay) map.set(day, layoutDay(evs));
    return map;
  }, [byDay]);

  // Unique sources that have events this week (for legend)
  const activeSources = useMemo(() => {
    const seen = new Set<string>();
    events.forEach((e) => seen.add(e.source));
    return [...seen];
  }, [events]);

  return (
    <div className="flex flex-col gap-3" style={{ height: "calc(100vh - 80px)" }}>

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setWeekStart((d) => addDays(d, -7))}
            className="p-1.5 rounded-md text-[--muted-foreground] hover:bg-[--muted] hover:text-[--foreground] transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setWeekStart((d) => addDays(d, 7))}
            className="p-1.5 rounded-md text-[--muted-foreground] hover:bg-[--muted] hover:text-[--foreground] transition-colors"
          >
            <ChevronRight size={16} />
          </button>
          <span className="text-sm font-medium text-[--foreground] ml-1">
            {fmtWeekLabel(weekStart, weekEnd)}
          </span>
          <button
            onClick={() => setWeekStart(getWeekStart(new Date()))}
            className="ml-2 px-2.5 py-1 text-xs border border-[--border] rounded-md text-[--muted-foreground] hover:bg-[--muted] hover:text-[--foreground] transition-colors"
          >
            Today
          </button>
        </div>

        <div className="flex items-center gap-4">
          {/* Legend */}
          {activeSources.length > 0 && (
            <div className="flex items-center gap-3">
              {activeSources.map((src) => (
                <div key={src} className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: colorMap[src] ?? "#8E8E93" }}
                  />
                  <span className="text-xs text-[--muted-foreground]">{nameMap[src] ?? src}</span>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => sync()}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[--border] rounded-md text-[--muted-foreground] hover:bg-[--muted] hover:text-[--foreground] disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={12} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* ── Calendar grid ── */}
      <div className="flex-1 flex flex-col overflow-hidden border border-[--border] rounded-lg">

        {/* Day header */}
        <div className="flex shrink-0 border-b border-[--border] bg-[--card]">
          <div className="w-12 shrink-0" />
          {weekDays.map((d) => {
            const isToday = localDate(d) === todayStr;
            return (
              <div
                key={d.toISOString()}
                className={`flex-1 text-center py-2 border-l border-[--border] ${isToday ? "bg-accent/10" : ""}`}
              >
                <p className="text-[10px] font-medium text-[--muted-foreground] uppercase tracking-wide">
                  {d.toLocaleString("en", { weekday: "short" })}
                </p>
                <p className={`text-sm font-semibold mt-0.5 ${isToday ? "text-accent" : "text-[--foreground]"}`}>
                  {d.getDate()}
                </p>
              </div>
            );
          })}
        </div>

        {/* All-day strip */}
        {allDayEvs.length > 0 && (
          <div className="flex shrink-0 border-b border-[--border] bg-[--card]">
            <div className="w-12 shrink-0 flex items-start justify-end pr-2 pt-1.5">
              <span className="text-[9px] text-[--muted-foreground] leading-none">all day</span>
            </div>
            {weekDays.map((d) => {
              const ds = localDate(d);
              const dayEvs = allDayEvs.filter((e) => {
                const s = e.startAt.slice(0, 10);
                const en = e.endAt.slice(0, 10);
                return s <= ds && en >= ds;
              });
              return (
                <div key={ds} className="flex-1 border-l border-[--border] px-0.5 py-0.5 min-h-[28px] space-y-0.5">
                  {dayEvs.map((ev) => (
                    <div
                      key={ev.id}
                      className="text-white text-[10px] font-medium rounded px-1.5 py-0.5 truncate"
                      style={{ background: colorMap[ev.source] ?? "#8E8E93" }}
                      title={ev.title}
                    >
                      {ev.title}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* Time grid */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {loading && events.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-[--muted-foreground] gap-2">
              <CalendarDays size={16} />
              Loading events…
            </div>
          ) : (
            <div className="flex" style={{ height: 24 * HOUR_H }}>

              {/* Time gutter */}
              <div className="w-12 shrink-0 relative select-none">
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="absolute right-2 text-[10px] text-[--muted-foreground]"
                    style={{ top: h * HOUR_H - 7 }}
                  >
                    {fmtHour(h)}
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {weekDays.map((d) => {
                const ds = localDate(d);
                const isToday = ds === todayStr;
                const layout = layoutByDay.get(ds) ?? [];

                return (
                  <div
                    key={ds}
                    className={`flex-1 relative border-l border-[--border] ${isToday ? "bg-accent/[0.03]" : ""}`}
                  >
                    {/* Hour lines */}
                    {HOURS.map((h) => (
                      <div
                        key={h}
                        className="absolute left-0 right-0 border-t border-[--border]/40"
                        style={{ top: h * HOUR_H }}
                      />
                    ))}

                    {/* Current time line */}
                    {isToday && (
                      <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: nowLine }}>
                        <div className="relative h-px bg-accent">
                          <div className="absolute -top-[3px] -left-[3px] w-1.5 h-1.5 rounded-full bg-accent" />
                        </div>
                      </div>
                    )}

                    {/* Timed events */}
                    {layout.map((ev) => {
                      const start = new Date(ev.startAt);
                      const end = new Date(ev.endAt);
                      const topMin = start.getHours() * 60 + start.getMinutes();
                      const endMin = end.getHours() * 60 + end.getMinutes();
                      const durMin = Math.max(endMin - topMin, 15);
                      const top = (topMin / 60) * HOUR_H;
                      const height = Math.max((durMin / 60) * HOUR_H, 18);
                      const w = 100 / ev.totalCols;
                      const left = ev.col * w;
                      const color = colorMap[ev.source] ?? "#8E8E93";

                      return (
                        <div
                          key={ev.id}
                          className="absolute rounded-[3px] px-1.5 py-0.5 overflow-hidden text-white z-10 cursor-default"
                          style={{
                            top,
                            height,
                            left: `${left + 1}%`,
                            width: `${w - 2}%`,
                            background: color,
                          }}
                          title={`${ev.title}${ev.location ? ` · ${ev.location}` : ""}  ${fmtTime(start)}–${fmtTime(end)}`}
                        >
                          <p className="text-[11px] font-semibold leading-tight truncate">{ev.title}</p>
                          {height > 28 && (
                            <p className="text-[10px] leading-tight opacity-90">
                              {fmtTime(start)}–{fmtTime(end)}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
