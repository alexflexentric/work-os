"use client";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";

type Section = "api-keys" | "tones" | "formats" | "calendar" | "import-export";
type Item = { id: string; name: string; instructions: string };
type CalendarOption = { id: string; name: string; primary: boolean };
type Connection = {
  id: string;
  sourceCalendarName: string;
  icalUrl: string | null;
  color: string | null;
  isActive: boolean;
  lastSyncedAt: string | null;
  syncErrors: number;
  lastErrorMessage: string | null;
};

const APPLE_COLORS = [
  "#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#5AC8FA",
  "#007AFF", "#AF52DE", "#FF2D55", "#A2845E", "#8E8E93",
];

const NAV: { group: string; items: { id: Section; label: string }[] }[] = [
  {
    group: "General",
    items: [
      { id: "api-keys", label: "API Keys" },
      { id: "import-export", label: "Import / Export" },
    ],
  },
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

          {section === "import-export" && (
            <ImportExportPanel inputCls={inputCls} />
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

function parseSettingsFile(text: string): {
  apiKeys: Record<string, string>;
  formats: { name: string; instructions: string }[];
  tones: { name: string; instructions: string }[];
  icalConnections: { name: string; url: string }[];
} {
  const lines = text.split("\n");
  let section: "none" | "api-keys" | "formats" | "tones" | "ical" = "none";
  let currentName = "";
  let currentLines: string[] = [];
  const apiKeys: Record<string, string> = {};
  const formats: { name: string; instructions: string }[] = [];
  const tones: { name: string; instructions: string }[] = [];
  const icalConnections: { name: string; url: string }[] = [];

  function flush() {
    if (!currentName) return;
    const body = currentLines.join("\n").trim();
    if (section === "formats" && body) formats.push({ name: currentName, instructions: body });
    if (section === "tones" && body) tones.push({ name: currentName, instructions: body });
    if (section === "ical" && body) icalConnections.push({ name: currentName, url: body });
    currentName = "";
    currentLines = [];
  }

  for (const line of lines) {
    if (line.startsWith("## API Keys")) { flush(); section = "api-keys"; continue; }
    if (line.startsWith("## Formats")) { flush(); section = "formats"; continue; }
    if (line.startsWith("## Tones")) { flush(); section = "tones"; continue; }
    if (line.startsWith("## iCal Connections")) { flush(); section = "ical"; continue; }
    if (line.startsWith("## ")) { flush(); section = "none"; continue; }

    if (line.startsWith("### ") && (section === "formats" || section === "tones" || section === "ical")) {
      flush();
      currentName = line.slice(4).trim();
      continue;
    }

    if (section === "api-keys") {
      const sep = line.indexOf(": ");
      if (sep > 0) {
        const key = line.slice(0, sep).trim();
        const value = line.slice(sep + 2).trim();
        if (key && value) apiKeys[key] = value;
      }
      continue;
    }

    if (currentName) currentLines.push(line);
  }
  flush();

  return { apiKeys, formats, tones, icalConnections };
}

function ImportExportPanel({ inputCls }: { inputCls: string }) {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ ok: boolean; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    setExporting(true);
    try {
      const [settingsData, formatsData, tonesData, connectionsData] = await Promise.all([
        fetch("/api/settings").then((r) => r.json()),
        fetch("/api/formats").then((r) => r.json()),
        fetch("/api/tones").then((r) => r.json()),
        fetch("/api/calendar/connections").then((r) => r.json()),
      ]);

      const lines: string[] = [
        "# Work OS Settings",
        `Exported: ${new Date().toISOString().split("T")[0]}`,
        "",
        "## API Keys",
        "",
      ];
      if (settingsData.anthropicApiKey) lines.push(`anthropicApiKey: ${settingsData.anthropicApiKey}`);
      if (settingsData.openaiApiKey) lines.push(`openaiApiKey: ${settingsData.openaiApiKey}`);
      lines.push("");

      lines.push("## Formats", "");
      for (const f of (formatsData as Item[])) {
        lines.push(`### ${f.name}`, f.instructions, "");
      }

      lines.push("## Tones", "");
      for (const t of (tonesData as Item[])) {
        lines.push(`### ${t.name}`, t.instructions, "");
      }

      lines.push("## iCal Connections", "");
      for (const c of (connectionsData as Connection[])) {
        if (c.icalUrl) lines.push(`### ${c.sourceCalendarName}`, c.icalUrl, "");
      }

      const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `work-os-settings-${new Date().toISOString().split("T")[0]}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      const { apiKeys, formats, tones, icalConnections } = parseSettingsFile(text);

      if (Object.keys(apiKeys).length > 0) {
        await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(apiKeys),
        });
      }

      const [existingFormats, existingTones, existingConnections] = await Promise.all([
        fetch("/api/formats").then((r) => r.json()),
        fetch("/api/tones").then((r) => r.json()),
        fetch("/api/calendar/connections").then((r) => r.json()),
      ]);

      const existingFormatNames = new Set((existingFormats as Item[]).map((f) => f.name.toLowerCase()));
      const existingToneNames = new Set((existingTones as Item[]).map((t) => t.name.toLowerCase()));
      const existingUrls = new Set((existingConnections as Connection[]).map((c) => c.icalUrl?.toLowerCase()));
      const newFormats = formats.filter((f) => !existingFormatNames.has(f.name.toLowerCase()));
      const newTones = tones.filter((t) => !existingToneNames.has(t.name.toLowerCase()));
      const newConnections = icalConnections.filter((c) => !existingUrls.has(c.url.toLowerCase()));

      for (const f of newFormats) {
        await fetch("/api/formats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(f),
        });
      }
      for (const t of newTones) {
        await fetch("/api/tones", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(t),
        });
      }
      for (const c of newConnections) {
        await fetch("/api/calendar/connections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: c.name, url: c.url }),
        });
      }

      const parts: string[] = [];
      if (Object.keys(apiKeys).length > 0) parts.push(`${Object.keys(apiKeys).length} API key(s)`);
      if (newFormats.length > 0) parts.push(`${newFormats.length} format(s)`);
      if (newTones.length > 0) parts.push(`${newTones.length} tone(s)`);
      if (newConnections.length > 0) parts.push(`${newConnections.length} iCal connection(s)`);

      if (parts.length > 0) {
        window.location.reload();
      } else {
        setImportResult({ ok: true, message: "Nothing new to import — all items already exist." });
      }
    } catch {
      setImportResult({ ok: false, message: "Import failed. Make sure the file is a valid Work OS settings export." });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="text-xs font-medium text-[--muted-foreground]">Export</p>
        <p className="text-xs text-[--muted-foreground]">
          Downloads a Markdown file with your API keys, formats, tones, and iCal connections. Keep it safe — it contains your API keys in plain text.
        </p>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-[--foreground] text-[--background] hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          {exporting ? "Exporting…" : "Export settings"}
        </button>
      </div>

      <div className="border-t border-[--border]" />

      <div className="space-y-3">
        <p className="text-xs font-medium text-[--muted-foreground]">Import</p>
        <p className="text-xs text-[--muted-foreground]">
          Restores API keys, formats, and tones from a previously exported file. Existing items with the same name are skipped.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,text/markdown"
          onChange={handleImport}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          className="px-4 py-2 rounded-lg text-sm font-medium border border-[--border] text-[--foreground] hover:bg-[--muted] disabled:opacity-40 transition-colors"
        >
          {importing ? "Importing…" : "Import settings"}
        </button>
        {importResult && (
          <p className={`text-xs ${importResult.ok ? "text-[--foreground]" : "text-[--destructive]"}`}>
            {importResult.message}
          </p>
        )}
      </div>
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
  const [expandedColorId, setExpandedColorId] = useState<string | null>(null);

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
        <div className="border border-[--border] rounded-lg px-4 py-3 space-y-2">
          <p className="text-xs font-medium text-[--muted-foreground]">Master account</p>
          <div className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ background: settings.masterCalendarColor ?? "#007AFF" }}
            />
            <p className="text-sm text-[--foreground]">
              {providerLabel}{userEmail ? ` · ${userEmail}` : ""}
            </p>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {APPLE_COLORS.map((hex) => {
              const active = (settings.masterCalendarColor ?? "#007AFF") === hex;
              return (
                <button
                  key={hex}
                  title={hex}
                  onClick={() => {
                    setSettings((prev) => ({ ...prev, masterCalendarColor: hex }));
                    fetch("/api/settings", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ masterCalendarColor: hex }),
                    });
                  }}
                  className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${active ? "border-[--foreground]" : "border-transparent"}`}
                  style={{ background: hex }}
                />
              );
            })}
          </div>
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
            {connections.map((conn, i) => {
              const connColor = conn.color ?? APPLE_COLORS[i % APPLE_COLORS.length];
              const colorOpen = expandedColorId === conn.id;
              return (
                <li key={conn.id} className="bg-[--card] border-b border-[--border] last:border-0 px-4 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <button
                          title="Change color"
                          onClick={() => setExpandedColorId(colorOpen ? null : conn.id)}
                          className="w-3.5 h-3.5 rounded-full shrink-0 border border-[--border] hover:scale-110 transition-transform"
                          style={{ background: connColor }}
                        />
                        <p className="text-sm font-medium text-[--foreground]">{conn.sourceCalendarName}</p>
                      </div>
                      {colorOpen && (
                        <div className="flex gap-1.5 flex-wrap mt-2 ml-5">
                          {APPLE_COLORS.map((hex) => {
                            const active = connColor === hex;
                            return (
                              <button
                                key={hex}
                                title={hex}
                                onClick={async () => {
                                  setConnections((prev) =>
                                    prev.map((c) => (c.id === conn.id ? { ...c, color: hex } : c))
                                  );
                                  setExpandedColorId(null);
                                  await fetch(`/api/calendar/connections/${conn.id}`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ color: hex }),
                                  });
                                }}
                                className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${active ? "border-[--foreground]" : "border-transparent"}`}
                                style={{ background: hex }}
                              />
                            );
                          })}
                        </div>
                      )}
                      {conn.icalUrl && (
                        <p className="text-xs text-[--muted-foreground] mt-0.5 truncate max-w-xs ml-5">
                          {conn.icalUrl}
                        </p>
                      )}
                      {conn.syncErrors > 0 && conn.lastErrorMessage && (
                        <p className="text-xs text-[--destructive] mt-0.5 ml-5">{conn.lastErrorMessage}</p>
                      )}
                      {conn.lastSyncedAt && conn.syncErrors === 0 && (
                        <p className="text-xs text-[--muted-foreground] mt-0.5 ml-5">
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
              );
            })}
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
