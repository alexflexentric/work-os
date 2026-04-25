"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

type Section = "api-keys" | "tones" | "formats" | "calendar";
type Tone = { id: string; name: string; instructions: string };
type Format = { id: string; name: string; instructions: string };
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
  {
    group: "General",
    items: [{ id: "api-keys", label: "API Keys" }],
  },
  {
    group: "Translation",
    items: [
      { id: "formats", label: "Formats" },
      { id: "tones", label: "Tones" },
    ],
  },
  {
    group: "Calendar",
    items: [{ id: "calendar", label: "Calendar" }],
  },
];

export default function SettingsPage() {
  const { data: session } = useSession();
  const [section, setSection] = useState<Section>("api-keys");
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [tones, setTones] = useState<Tone[]>([]);
  const [newTone, setNewTone] = useState({ name: "", instructions: "" });
  const [editingToneId, setEditingToneId] = useState<string | null>(null);
  const [editToneDraft, setEditToneDraft] = useState({ name: "", instructions: "" });

  const [formats, setFormats] = useState<Format[]>([]);
  const [newFormat, setNewFormat] = useState({ name: "", instructions: "" });
  const [editingFormatId, setEditingFormatId] = useState<string | null>(null);
  const [editFormatDraft, setEditFormatDraft] = useState({ name: "", instructions: "" });

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then(setSettings);
    fetch("/api/tones").then((r) => r.json()).then(setTones);
    fetch("/api/formats").then((r) => r.json()).then(setFormats);
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

  // Tones
  async function addTone(e: React.FormEvent) {
    e.preventDefault();
    if (!newTone.name || !newTone.instructions) return;
    const res = await fetch("/api/tones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newTone),
    });
    const tone = await res.json();
    setTones((prev) => [...prev, tone]);
    setNewTone({ name: "", instructions: "" });
  }

  async function deleteTone(id: string) {
    await fetch(`/api/tones/${id}`, { method: "DELETE" });
    setTones((prev) => prev.filter((t) => t.id !== id));
  }

  async function saveToneEdit(id: string) {
    await fetch(`/api/tones/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editToneDraft),
    });
    setTones((prev) => prev.map((t) => (t.id === id ? { ...t, ...editToneDraft } : t)));
    setEditingToneId(null);
  }

  async function moveTone(index: number, direction: -1 | 1) {
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= tones.length) return;
    const a = tones[index];
    const b = tones[swapIndex];
    const next = [...tones];
    next[index] = { ...b };
    next[swapIndex] = { ...a };
    setTones(next);
    await Promise.all([
      fetch(`/api/tones/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sortOrder: swapIndex }) }),
      fetch(`/api/tones/${b.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sortOrder: index }) }),
    ]);
  }

  // Formats
  async function addFormat(e: React.FormEvent) {
    e.preventDefault();
    if (!newFormat.name || !newFormat.instructions) return;
    const res = await fetch("/api/formats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newFormat),
    });
    const fmt = await res.json();
    setFormats((prev) => [...prev, fmt]);
    setNewFormat({ name: "", instructions: "" });
  }

  async function deleteFormat(id: string) {
    await fetch(`/api/formats/${id}`, { method: "DELETE" });
    setFormats((prev) => prev.filter((f) => f.id !== id));
  }

  async function saveFormatEdit(id: string) {
    await fetch(`/api/formats/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editFormatDraft),
    });
    setFormats((prev) => prev.map((f) => (f.id === id ? { ...f, ...editFormatDraft } : f)));
    setEditingFormatId(null);
  }

  async function moveFormat(index: number, direction: -1 | 1) {
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= formats.length) return;
    const a = formats[index];
    const b = formats[swapIndex];
    const next = [...formats];
    next[index] = { ...b };
    next[swapIndex] = { ...a };
    setFormats(next);
    await Promise.all([
      fetch(`/api/formats/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sortOrder: swapIndex }) }),
      fetch(`/api/formats/${b.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sortOrder: index }) }),
    ]);
  }

  const inputCls = "w-full border border-[--border] rounded-lg px-3 py-2 text-sm bg-[--card] text-[--foreground] placeholder:text-[--muted-foreground] focus:outline-none focus-visible:ring-2 focus-visible:ring-[--ring] focus-visible:ring-offset-2";
  const monoInputCls = inputCls + " font-mono";

  const keyFields = [
    { key: "anthropicApiKey", label: "Anthropic API Key", placeholder: "sk-ant-..." },
    { key: "openaiApiKey", label: "OpenAI API Key", placeholder: "sk-..." },
  ];

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-3xl font-normal text-[--foreground]" style={{ fontFamily: "'Charter', 'Georgia', serif" }}>
        Settings
      </h1>

      <div className="flex gap-8">
        {/* Sidebar nav */}
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

        {/* Content */}
        <div className="flex-1 min-w-0">
          {section === "api-keys" && (
            <form onSubmit={saveSettings} className="space-y-4">
              {keyFields.map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-[--muted-foreground] mb-1.5">{label}</label>
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
            <TonesPanel
              tones={tones}
              newTone={newTone}
              setNewTone={setNewTone}
              editingId={editingToneId}
              setEditingId={setEditingToneId}
              editDraft={editToneDraft}
              setEditDraft={setEditToneDraft}
              onAdd={addTone}
              onDelete={deleteTone}
              onSaveEdit={saveToneEdit}
              onMove={moveTone}
              inputCls={inputCls}
            />
          )}

          {section === "formats" && (
            <FormatsPanel
              formats={formats}
              newFormat={newFormat}
              setNewFormat={setNewFormat}
              editingId={editingFormatId}
              setEditingId={setEditingFormatId}
              editDraft={editFormatDraft}
              setEditDraft={setEditFormatDraft}
              onAdd={addFormat}
              onDelete={deleteFormat}
              onSaveEdit={saveFormatEdit}
              onMove={moveFormat}
              inputCls={inputCls}
            />
          )}

          {section === "calendar" && (
            <CalendarPanel
              settings={settings}
              setSettings={setSettings}
              userEmail={session?.user?.email ?? ""}
              onSave={saveSettings}
              saving={saving}
              saved={saved}
              inputCls={inputCls}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function TonesPanel({
  tones, newTone, setNewTone, editingId, setEditingId, editDraft, setEditDraft,
  onAdd, onDelete, onSaveEdit, onMove, inputCls,
}: {
  tones: Tone[];
  newTone: { name: string; instructions: string };
  setNewTone: (v: { name: string; instructions: string }) => void;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  editDraft: { name: string; instructions: string };
  setEditDraft: (v: { name: string; instructions: string }) => void;
  onAdd: (e: React.FormEvent) => void;
  onDelete: (id: string) => void;
  onSaveEdit: (id: string) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  inputCls: string;
}) {
  return (
    <div className="space-y-3">
      {tones.length > 0 && (
        <ul className="space-y-px border border-[--border] rounded-lg overflow-hidden">
          {tones.map((tone, i) => (
            <li key={tone.id} className="bg-[--card] border-b border-[--border] last:border-0 px-4 py-3">
              {editingId === tone.id ? (
                <div className="space-y-2">
                  <input value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} className={inputCls} />
                  <textarea value={editDraft.instructions} onChange={(e) => setEditDraft({ ...editDraft, instructions: e.target.value })} rows={3} className={inputCls + " resize-none"} />
                  <div className="flex gap-2">
                    <button onClick={() => onSaveEdit(tone.id)} className="px-3 py-1.5 rounded-md text-xs font-medium bg-[--foreground] text-[--background] hover:opacity-90 transition-opacity">Save</button>
                    <button onClick={() => setEditingId(null)} className="px-3 py-1.5 rounded-md text-xs border border-[--border] text-[--muted-foreground] hover:text-[--foreground] transition-colors">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[--foreground]">{tone.name}</p>
                    <p className="text-xs text-[--muted-foreground] mt-0.5 leading-relaxed">{tone.instructions}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => onMove(i, -1)} disabled={i === 0} className="p-1 text-[--muted-foreground] hover:text-[--foreground] disabled:opacity-25 transition-colors" title="Move up">↑</button>
                    <button onClick={() => onMove(i, 1)} disabled={i === tones.length - 1} className="p-1 text-[--muted-foreground] hover:text-[--foreground] disabled:opacity-25 transition-colors" title="Move down">↓</button>
                    <button onClick={() => { setEditingId(tone.id); setEditDraft({ name: tone.name, instructions: tone.instructions }); }} className="px-2.5 py-1 rounded-md text-xs border border-[--border] text-[--muted-foreground] hover:text-[--foreground] transition-colors ml-1">Edit</button>
                    <button onClick={() => onDelete(tone.id)} className="px-2.5 py-1 rounded-md text-xs border border-[--border] text-[--muted-foreground] hover:text-[--destructive] transition-colors">Delete</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={onAdd} className="border border-[--border] rounded-lg p-4 space-y-3">
        <p className="text-xs font-medium text-[--muted-foreground]">Add tone</p>
        <input value={newTone.name} onChange={(e) => setNewTone({ ...newTone, name: e.target.value })} placeholder="Name" className={inputCls} />
        <textarea value={newTone.instructions} onChange={(e) => setNewTone({ ...newTone, instructions: e.target.value })} placeholder="Instructions — e.g. polite and professional, no emojis" rows={2} className={inputCls + " resize-none"} />
        <button type="submit" className="px-4 py-2 rounded-lg text-sm font-medium bg-[--foreground] text-[--background] hover:opacity-90 transition-opacity">Add</button>
      </form>
    </div>
  );
}

function FormatsPanel({
  formats, newFormat, setNewFormat, editingId, setEditingId, editDraft, setEditDraft,
  onAdd, onDelete, onSaveEdit, onMove, inputCls,
}: {
  formats: Format[];
  newFormat: { name: string; instructions: string };
  setNewFormat: (v: { name: string; instructions: string }) => void;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  editDraft: { name: string; instructions: string };
  setEditDraft: (v: { name: string; instructions: string }) => void;
  onAdd: (e: React.FormEvent) => void;
  onDelete: (id: string) => void;
  onSaveEdit: (id: string) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  inputCls: string;
}) {
  return (
    <div className="space-y-3">
      {formats.length === 0 && (
        <p className="text-xs text-[--muted-foreground]">No formats yet. Add one below — the first will be the default in Translation.</p>
      )}
      {formats.length > 0 && (
        <ul className="space-y-px border border-[--border] rounded-lg overflow-hidden">
          {formats.map((fmt, i) => (
            <li key={fmt.id} className="bg-[--card] border-b border-[--border] last:border-0 px-4 py-3">
              {editingId === fmt.id ? (
                <div className="space-y-2">
                  <input value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} className={inputCls} />
                  <textarea value={editDraft.instructions} onChange={(e) => setEditDraft({ ...editDraft, instructions: e.target.value })} rows={3} className={inputCls + " resize-none"} />
                  <div className="flex gap-2">
                    <button onClick={() => onSaveEdit(fmt.id)} className="px-3 py-1.5 rounded-md text-xs font-medium bg-[--foreground] text-[--background] hover:opacity-90 transition-opacity">Save</button>
                    <button onClick={() => setEditingId(null)} className="px-3 py-1.5 rounded-md text-xs border border-[--border] text-[--muted-foreground] hover:text-[--foreground] transition-colors">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-[--foreground]">{fmt.name}</p>
                      {i === 0 && <span className="text-xs text-[--muted-foreground] border border-[--border] rounded-full px-2 py-0.5">default</span>}
                    </div>
                    <p className="text-xs text-[--muted-foreground] mt-0.5 leading-relaxed">{fmt.instructions}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => onMove(i, -1)} disabled={i === 0} className="p-1 text-[--muted-foreground] hover:text-[--foreground] disabled:opacity-25 transition-colors" title="Move up">↑</button>
                    <button onClick={() => onMove(i, 1)} disabled={i === formats.length - 1} className="p-1 text-[--muted-foreground] hover:text-[--foreground] disabled:opacity-25 transition-colors" title="Move down">↓</button>
                    <button onClick={() => { setEditingId(fmt.id); setEditDraft({ name: fmt.name, instructions: fmt.instructions }); }} className="px-2.5 py-1 rounded-md text-xs border border-[--border] text-[--muted-foreground] hover:text-[--foreground] transition-colors ml-1">Edit</button>
                    <button onClick={() => onDelete(fmt.id)} className="px-2.5 py-1 rounded-md text-xs border border-[--border] text-[--muted-foreground] hover:text-[--destructive] transition-colors">Delete</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={onAdd} className="border border-[--border] rounded-lg p-4 space-y-3">
        <p className="text-xs font-medium text-[--muted-foreground]">Add format</p>
        <input value={newFormat.name} onChange={(e) => setNewFormat({ ...newFormat, name: e.target.value })} placeholder="Name — e.g. Chat, Email, Slack message" className={inputCls} />
        <textarea value={newFormat.instructions} onChange={(e) => setNewFormat({ ...newFormat, instructions: e.target.value })} placeholder="Instructions — e.g. concise and conversational, no greeting" rows={2} className={inputCls + " resize-none"} />
        <button type="submit" className="px-4 py-2 rounded-lg text-sm font-medium bg-[--foreground] text-[--background] hover:opacity-90 transition-opacity">Add</button>
      </form>
    </div>
  );
}

function CalendarPanel({
  settings, setSettings, userEmail, onSave, saving, saved, inputCls,
}: {
  settings: Record<string, string>;
  setSettings: (v: Record<string, string>) => void;
  userEmail: string;
  onSave: (e: React.FormEvent) => void;
  saving: boolean;
  saved: boolean;
  inputCls: string;
}) {
  const provider = settings.masterCalendarProvider ?? "google";
  const providerLabel = provider === "microsoft" ? "Microsoft" : "Google";

  const [calendars, setCalendars] = useState<CalendarOption[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [newConn, setNewConn] = useState({ name: "", url: "" });
  const [addingConn, setAddingConn] = useState(false);

  useEffect(() => {
    fetch("/api/calendar/calendars")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setCalendars(data);
          if (!settings.calendarId) {
            const primary = data.find((c: CalendarOption) => c.primary);
            if (primary) setSettings({ ...settings, calendarId: primary.id });
          }
        }
      })
      .catch(() => {});
    fetch("/api/calendar/connections")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setConnections(data); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const chevron = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")";

  return (
    <div className="space-y-6">
      {/* Master account + calendar settings */}
      <form onSubmit={onSave} className="space-y-4">
        <div className="border border-[--border] rounded-lg px-4 py-3 space-y-0.5">
          <p className="text-xs font-medium text-[--muted-foreground]">Master account</p>
          <p className="text-sm text-[--foreground]">{providerLabel}{userEmail ? ` · ${userEmail}` : ""}</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-[--muted-foreground] mb-1.5">Primary calendar</label>
          {calendars.length > 0 ? (
            <select
              value={settings.calendarId ?? ""}
              onChange={(e) => setSettings({ ...settings, calendarId: e.target.value })}
              className={selectCls}
              style={{ backgroundImage: chevron, backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center" }}
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
              onChange={(e) => setSettings({ ...settings, calendarId: e.target.value })}
              placeholder="primary"
              className={inputCls}
            />
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-[--muted-foreground] mb-1.5">Sync interval (minutes)</label>
          <input
            type="number"
            min={5}
            max={1440}
            value={settings.syncInterval ?? "15"}
            onChange={(e) => setSettings({ ...settings, syncInterval: e.target.value })}
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

      {/* iCal connections */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-[--muted-foreground]">iCal connections</p>

        {connections.length > 0 && (
          <ul className="space-y-px border border-[--border] rounded-lg overflow-hidden">
            {connections.map((conn) => (
              <li key={conn.id} className="bg-[--card] border-b border-[--border] last:border-0 px-4 py-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[--foreground]">{conn.sourceCalendarName}</p>
                    {conn.icalUrl && (
                      <p className="text-xs text-[--muted-foreground] mt-0.5 truncate max-w-xs">{conn.icalUrl}</p>
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
