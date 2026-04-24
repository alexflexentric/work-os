"use client";
import { useEffect, useState } from "react";

type Tab = "keys" | "tones";
type Tone = { id: string; name: string; instructions: string };

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("keys");
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tones, setTones] = useState<Tone[]>([]);
  const [newTone, setNewTone] = useState({ name: "", instructions: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ name: "", instructions: "" });

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then(setSettings);
    fetch("/api/tones").then((r) => r.json()).then(setTones);
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

  function startEdit(tone: Tone) {
    setEditingId(tone.id);
    setEditDraft({ name: tone.name, instructions: tone.instructions });
  }

  async function saveEdit(id: string) {
    await fetch(`/api/tones/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editDraft),
    });
    setTones((prev) => prev.map((t) => (t.id === id ? { ...t, ...editDraft } : t)));
    setEditingId(null);
  }

  async function moveTone(index: number, direction: -1 | 1) {
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= tones.length) return;
    const a = tones[index];
    const b = tones[swapIndex];
    const newTones = [...tones];
    newTones[index] = { ...b };
    newTones[swapIndex] = { ...a };
    setTones(newTones);
    await Promise.all([
      fetch(`/api/tones/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: swapIndex }),
      }),
      fetch(`/api/tones/${b.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: index }),
      }),
    ]);
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "keys", label: "API Keys" },
    { id: "tones", label: "Tones" },
  ];

  const keyFields = [
    { key: "anthropicApiKey", label: "Anthropic API Key", placeholder: "sk-ant-..." },
    { key: "openaiApiKey", label: "OpenAI API Key", placeholder: "sk-..." },
    { key: "microsoftClientId", label: "Microsoft Client ID", placeholder: "" },
    { key: "microsoftClientSecret", label: "Microsoft Client Secret", placeholder: "" },
    { key: "microsoftTenantId", label: "Microsoft Tenant ID", placeholder: "common" },
  ];

  const inputCls = "w-full border border-[--border] rounded-lg px-3 py-2 text-sm bg-[--card] text-[--foreground] placeholder:text-[--muted-foreground] focus:outline-none focus:ring-1 focus:ring-[--ring] font-mono";

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-3xl font-normal text-[--foreground]" style={{ fontFamily: "'Charter', 'Georgia', serif" }}>
        Settings
      </h1>

      {/* Tabs */}
      <div className="flex border-b border-[--border]">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
              tab === id
                ? "border-[--foreground] text-[--foreground] font-medium"
                : "border-transparent text-[--muted-foreground] hover:text-[--foreground]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "keys" && (
        <form onSubmit={saveSettings} className="space-y-4">
          {keyFields.map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-[--muted-foreground] mb-1.5">{label}</label>
              <input
                type="password"
                value={settings[key] ?? ""}
                onChange={(e) => setSettings((prev) => ({ ...prev, [key]: e.target.value }))}
                placeholder={placeholder}
                className={inputCls}
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

      {tab === "tones" && (
        <div className="space-y-3">
          {tones.length > 0 && (
            <ul className="space-y-px border border-[--border] rounded-lg overflow-hidden">
              {tones.map((tone, i) => (
                <li key={tone.id} className="bg-[--card] border-b border-[--border] last:border-0 px-4 py-3">
                  {editingId === tone.id ? (
                    <div className="space-y-2">
                      <input
                        value={editDraft.name}
                        onChange={(e) => setEditDraft((p) => ({ ...p, name: e.target.value }))}
                        className={inputCls}
                      />
                      <textarea
                        value={editDraft.instructions}
                        onChange={(e) => setEditDraft((p) => ({ ...p, instructions: e.target.value }))}
                        rows={3}
                        className={inputCls + " resize-none"}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveEdit(tone.id)}
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
                        <p className="text-sm font-medium text-[--foreground]">{tone.name}</p>
                        <p className="text-xs text-[--muted-foreground] mt-0.5 leading-relaxed">{tone.instructions}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => moveTone(i, -1)} disabled={i === 0} className="p-1 text-[--muted-foreground] hover:text-[--foreground] disabled:opacity-25 transition-colors" title="Move up">↑</button>
                        <button onClick={() => moveTone(i, 1)} disabled={i === tones.length - 1} className="p-1 text-[--muted-foreground] hover:text-[--foreground] disabled:opacity-25 transition-colors" title="Move down">↓</button>
                        <button onClick={() => startEdit(tone)} className="px-2.5 py-1 rounded-md text-xs border border-[--border] text-[--muted-foreground] hover:text-[--foreground] transition-colors ml-1">Edit</button>
                        <button onClick={() => deleteTone(tone.id)} className="px-2.5 py-1 rounded-md text-xs border border-[--border] text-[--muted-foreground] hover:text-[--destructive] transition-colors">Delete</button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={addTone} className="border border-[--border] rounded-lg p-4 space-y-3">
            <p className="text-xs font-medium text-[--muted-foreground]">Add tone</p>
            <input
              value={newTone.name}
              onChange={(e) => setNewTone((p) => ({ ...p, name: e.target.value }))}
              placeholder="Name"
              className={inputCls}
            />
            <textarea
              value={newTone.instructions}
              onChange={(e) => setNewTone((p) => ({ ...p, instructions: e.target.value }))}
              placeholder="Instructions — e.g. polite and professional, no emojis"
              rows={2}
              className={inputCls + " resize-none"}
            />
            <button type="submit" className="px-4 py-2 rounded-lg text-sm font-medium bg-[--foreground] text-[--background] hover:opacity-90 transition-opacity">
              Add
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
