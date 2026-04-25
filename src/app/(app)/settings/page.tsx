"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

type Section = "api-keys" | "tones" | "formats" | "calendar";
type Item = { id: string; name: string; instructions: string };
type CalendarOption = { id: string; name: string; primary: boolean };
type Connection = {
  id: string;
  sourceCalendarName: string;
  icalUrl: string | null;
  isActive: boolean;
  lastSyncedAt: string | null;
  syncErrors: number;
  lastErrorMessage: string | null;
};

const NAV: { group: string; items: { id: Section; label: string }[] }[] = [
  { group: "General", items: [{ id: "api-keys", label: "API Keys" }] },
  {
    group: "Translation",
    items: [
      { id: "formats", label: "Formats" },
      { id: "tones", label: "Tones" },
    ],
  },
  { group: "Calendar", items: [{ id: "calendar", label: "Calendar" }] },
];

const CHEVRON_STYLE = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat" as const,
  backgroundPosition: "right 10px center",
};

export default function SettingsPage() {
  const { data: session } = useSession();
  const [section, setSection] = useState<Section>("api-keys");
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then(setSettings);
  }, []);

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const inputCls =
    "w-full border border-[--border] rounded-lg px-3 py-2 text-sm bg-[--card] text-[--foreground] placeholder:text-[--muted-foreground] focus:outline-none focus-visible:ring-2 focus-visible:ring-[--ring] focus-visible:ring-offset-2";
  const monoInputCls = inputCls + " font-mono";

  const keyFields = [
    { key: "anthropicApiKey", label: "Anthropic API Key", placeholder: "sk-ant-..." },
    { key: "openaiApiKey", label: "OpenAI API Key", placeholder: "sk-..." },
  ];

  return (
    <div className="max-w-2xl space-y-6">
      <h1
        className="text-3xl font-normal text-[--foreground]"
        style={{ fontFamily: "'Charter', 'Georgia', serif" }}
      >
        Settings
      </h1>

      <div className="flex gap-8">
        <nav className="w-44 shrink-0 space-y-5">
          {NAV.map(({ group, items }) => (
            <div key={group}>
              <p className="text-xs font-medium text-[--muted-foreground] px-2 mb-1">{group}</p>
              <ul className="space-y-0.5">
                {items.map(({ id, label }) => {
                  const active = section === id;
                  return (
                    <li key={id}>
                      <button
                        onClick={() => setSection(id)}
                        className={`w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                          active
                            ? "bg-accent-subtle text-accent-subtle-foreground font-medium"
                            : "text-[--muted-foreground] hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        {label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="flex-1 min-w-0">
          {section === "api-keys" && (
            <form onSubmit={saveSettings} className="space-y-4">
              {keyFields.map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-[--muted-foreground] mb-1.5">
                    {label}
                  </label>
                  <input
                    type="password"
                    value={settings[key] ?? ""}
                    onChange={(e) => setSettings((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className={monoInputCls}
                  />
                </div>
              ))}
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-[--foreground] text-[--background] hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {saved ? "Saved" : saving ? "Saving…" : "Save"}
              </button>
            </form>
          )}

          {section === "tones" && (
            <ItemPanel
              endpoint="/api/tones"
              addLabel="tone"
              namePlaceholder="Name"
              instructionsPlaceholder="Instructions — e.g. polite and professional, no emojis"
              inputCls={inputCls}
            />
          )}

          {section === "formats" && (
            <ItemPanel
              endpoint="/api/formats"
              addLabel="format"
              namePlaceholder="Name — e.g. Chat, Email, Slack message"
              instructionsPlaceholder="Instructions — e.g. concise and conversational, no greeting"
              emptyMessage="No formats yet. Add one below — the first will be the default in Translation."
              showDefaultBadge
              inputCls={inputCls}
            />
          )}

          {section === "calendar" && (
            <CalendarPanel
              settings={settings}
              setSettings={setSettings}
              userEmail={session?.user?.email ?? ""}
              inputCls={inputCls}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ItemPanel({
  endpoint,
  addLabel,
  namePlaceholder,
  instructionsPlaceholder,
  emptyMessage,
  showDefaultBadge,
  inputCls,
}: {
  endpoint: string;
  addLabel: string;
  namePlaceholder: string;
  instructionsPlaceholder: string;
  emptyMessage?: string;
  showDefaultBadge?: boolean;
  inputCls: string;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [newItem, setNewItem] = useState({ name: "", instructions: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ name: "", instructions: "" });

  useEffect(() => {
    fetch(endpoint)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setItems(data); })
      .catch(() => {});
  }, [endpoint]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!newItem.name || !newItem.instructions) return;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newItem),
    });
    const item = await res.json();
    setItems((prev) => [...prev, item]);
    setNewItem({ name: "", instructions: "" });
  }

  async function remove(id: string) {
    await fetch(`${endpoint}/${id}`, { method: "DELETE" });
    setItems((prev) => prev.filter((t) => t.id !== id));
  }

  async function saveEdit(id: string) {
    await fetch(`${endpoint}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editDraft),
    });
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, ...editDraft } : t)));
    setEditingId(null);
  }

  async function move(index: number, direction: -1 | 1) {
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= items.length) return;
    const a = items[index];
    const b = items[swapIndex];
    const next = [...items];
    next[index] = { ...b };
    next[swapIndex] = { ...a };
    setItems(next);
    await Promise.all([
      fetch(`${endpoint}/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: swapIndex }),
      }),
      fetch(`${endpoint}/${b.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: index }),
      }),
    ]);
  }

  return (
    <div className="space-y-3">
      {emptyMessage && items.length === 0 && (
        <p className="text-xs text-[--muted-foreground]">{emptyMessage}</p>
      )}
      {items.length > 0 && (
        <ul className="space-y-px border border-[--border] rounded-lg overflow-hidden">
          {items.map((item, i) => (
            <li key={item.id} className="bg-[--card] border-b border-[--border] last:border-0 px-4 py-3">
              {editingId === item.id ? (
                <div className="space-y-2">
                  <input
                    value={editDraft.name}
                    onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                    className={inputCls}
                  />
                  <textarea
                    value={editDraft.instructions}
                    onChange={(e) => setEditDraft({ ...editDraft, instructions: e.target.value })}
                    rows={3}
                    className={inputCls + " resize-none"}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEdit(item.id)}
                      className="px-3 py-1.5 rounded-md text-xs font-medium bg-[--foreground] text-[--background] hover:opacity-90 transition-opacity"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 rounded-md text-xs border border-[--border] text-[--muted-foreground] hover:text-[--foreground] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-[--foreground]">{item.name}</p>
                      {showDefaultBadge && i === 0 && (
                        <span className="text-xs text-[--muted-foreground] border border-[--border] rounded-full px-2 py-0.5">
                          default
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[--muted-foreground] mt-0.5 leading-relaxed">
                      {item.instructions}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      className="p-1 text-[--muted-foreground] hover:text-[--foreground] disabled:opacity-25 transition-colors"
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => move(i, 1)}
                      disabled={i === items.length - 1}
                      className="p-1 text-[--muted-foreground] hover:text-[--foreground] disabled:opacity-25 transition-colors"
                      title="Move down"
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => {
                        setEditingId(item.id);
                        setEditDraft({ name: item.name, instructions: item.instructions });
                      }}
                      className="px-2.5 py-1 rounded-md text-xs border border-[--border] text-[--muted-foreground] hover:text-[--foreground] transition-colors ml-1"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => remove(item.id)}
                      className="px-2.5 py-1 rounded-md text-xs border border-[--border] text-[--muted-foreground] hover:text-[--destructive] transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="border border-[--border] rounded-lg p-4 space-y-3">
        <p className="text-xs font-medium text-[--muted-foreground]">Add {addLabel}</p>
        <input
          value={newItem.name}
          onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
          placeholder={namePlaceholder}
          className={inputCls}
        />
        <textarea
          value={newItem.instructions}
          onChange={(e) => setNewItem({ ...newItem, instructions: e.target.value })}
          placeholder={instructionsPlaceholder}
          rows={2}
          className={inputCls + " resize-none"}
        />
        <button
          type="submit"
          className="px-4 py-2 rounded-lg text-sm font-medium bg-[--foreground] text-[--background] hover:opacity-90 transition-opacity"
        >
          Add
        </button>
      </form>
    </div>
  );
}

function CalendarPanel({
  settings,
  setSettings,
  userEmail,
  inputCls,
}: {
  settings: Record<string, string>;
  setSettings: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  userEmail: string;
  inputCls: string;
}) {
  const provider = settings.masterCalendarProvider ?? "google";
  const providerLabel = provider === "microsoft" ? "Microsoft" : "Google";

  const [calendars, setCalendars] = useState<CalendarOption[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [newConn, setNewConn] = useState({ name: "", url: "" });
  const [addingConn, setAddingConn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/calendar/calendars")
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) return;
        setCalendars(data);
        setSettings((prev) => {
          if (prev.calendarId) return prev;
          const primary = data.find((c: CalendarOption) => c.primary);
          return primary ? { ...prev, calendarId: primary.id } : prev;
        });
      })
      .catch(() => {});
    fetch("/api/calendar/connections")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setConnections(data); })
      .catch(() => {});
  }, [setSettings]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function addConnection(e: React.FormEvent) {
    e.preventDefault();
    if (!newConn.name.trim() || !newConn.url.trim()) return;
    setAddingConn(true);
    try {
      const res = await fetch("/api/calendar/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newConn.name.trim(), url: newConn.url.trim() }),
      });
      const conn = await res.json();
      setConnections((prev) => [...prev, conn]);
      setNewConn({ name: "", url: "" });
    } finally {
      setAddingConn(false);
    }
  }

  async function toggleConnection(id: string) {
    const res = await fetch(`/api/calendar/connections/${id}`, { method: "PATCH" });
    const updated = await res.json();
    setConnections((prev) => prev.map((c) => (c.id === id ? updated : c)));
  }

  async function deleteConnection(id: string) {
    await fetch(`/api/calendar/connections/${id}`, { method: "DELETE" });
    setConnections((prev) => prev.filter((c) => c.id !== id));
  }

  const selectCls = inputCls + " appearance-none pr-8 cursor-pointer";

  return (
    <div className="space-y-6">
      <form onSubmit={save} className="space-y-4">
        <div className="border border-[--border] rounded-lg px-4 py-3 space-y-0.5">
          <p className="text-xs font-medium text-[--muted-foreground]">Master account</p>
          <p className="text-sm text-[--foreground]">
            {providerLabel}{userEmail ? ` · ${userEmail}` : ""}
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-[--muted-foreground] mb-1.5">
            Primary calendar
          </label>
          {calendars.length > 0 ? (
            <select
              value={settings.calendarId ?? ""}
              onChange={(e) => setSettings((prev) => ({ ...prev, calendarId: e.target.value }))}
              className={selectCls}
              style={CHEVRON_STYLE}
            >
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.primary ? " (primary)" : ""}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={settings.calendarId ?? ""}
              onChange={(e) => setSettings((prev) => ({ ...prev, calendarId: e.target.value }))}
              placeholder="primary"
              className={inputCls}
            />
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-[--muted-foreground] mb-1.5">
            Sync interval (minutes)
          </label>
          <input
            type="number"
            min={5}
            max={1440}
            value={settings.syncInterval ?? "15"}
            onChange={(e) => setSettings((prev) => ({ ...prev, syncInterval: e.target.value }))}
            className={inputCls}
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-[--foreground] text-[--background] hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          {saved ? "Saved" : saving ? "Saving…" : "Save"}
        </button>
      </form>

      <div className="space-y-3">
        <p className="text-xs font-medium text-[--muted-foreground]">iCal connections</p>

        {connections.length > 0 && (
          <ul className="space-y-px border border-[--border] rounded-lg overflow-hidden">
            {connections.map((conn) => (
              <li
                key={conn.id}
                className="bg-[--card] border-b border-[--border] last:border-0 px-4 py-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[--foreground]">
                      {conn.sourceCalendarName}
                    </p>
                    {conn.icalUrl && (
                      <p className="text-xs text-[--muted-foreground] mt-0.5 truncate max-w-xs">
                        {conn.icalUrl}
                      </p>
                    )}
                    {conn.syncErrors > 0 && conn.lastErrorMessage && (
                      <p className="text-xs text-[--destructive] mt-0.5">{conn.lastErrorMessage}</p>
                    )}
                    {conn.lastSyncedAt && conn.syncErrors === 0 && (
                      <p className="text-xs text-[--muted-foreground] mt-0.5">
                        Last synced {new Date(conn.lastSyncedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => toggleConnection(conn.id)}
                      className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
                        conn.isActive
                          ? "border-[--border] text-[--muted-foreground] hover:text-[--foreground]"
                          : "border-[--border] text-[--muted-foreground] opacity-50 hover:opacity-100"
                      }`}
                    >
                      {conn.isActive ? "Active" : "Paused"}
                    </button>
                    <button
                      onClick={() => deleteConnection(conn.id)}
                      className="px-2.5 py-1 rounded-md text-xs border border-[--border] text-[--muted-foreground] hover:text-[--destructive] transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={addConnection} className="border border-[--border] rounded-lg p-4 space-y-3">
          <p className="text-xs font-medium text-[--muted-foreground]">Add iCal feed</p>
          <input
            value={newConn.name}
            onChange={(e) => setNewConn({ ...newConn, name: e.target.value })}
            placeholder="Name — e.g. Public holidays"
            className={inputCls}
          />
          <input
            value={newConn.url}
            onChange={(e) => setNewConn({ ...newConn, url: e.target.value })}
            placeholder="https://calendar.google.com/calendar/ical/…"
            className={inputCls}
          />
          <button
            type="submit"
            disabled={addingConn}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-[--foreground] text-[--background] hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {addingConn ? "Adding…" : "Add"}
          </button>
        </form>
      </div>
    </div>
  );
}
