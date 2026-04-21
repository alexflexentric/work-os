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

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Settings</h1>

      <div className="flex border-b border-gray-200">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === id
                ? "border-sky-500 text-sky-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "keys" && (
        <form onSubmit={saveSettings} className="space-y-4 bg-white border border-gray-100 rounded-xl p-6">
          {keyFields.map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input
                type="password"
                value={settings[key] ?? ""}
                onChange={(e) => setSettings((prev) => ({ ...prev, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
              />
            </div>
          ))}
          <button
            type="submit"
            disabled={saving}
            className="bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
          >
            {saved ? "Saved ✓" : saving ? "Saving…" : "Save"}
          </button>
        </form>
      )}

      {tab === "tones" && (
        <div className="space-y-4">
          <ul className="space-y-2">
            {tones.map((tone) => (
              <li key={tone.id} className="flex items-start justify-between bg-white border border-gray-100 rounded-xl px-5 py-4">
                <div>
                  <p className="font-medium text-gray-900 text-sm">{tone.name}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{tone.instructions}</p>
                </div>
                <button
                  onClick={() => deleteTone(tone.id)}
                  className="text-gray-300 hover:text-red-400 transition-colors ml-4 mt-0.5"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <form onSubmit={addTone} className="bg-white border border-gray-100 rounded-xl p-5 space-y-3">
            <p className="text-sm font-medium text-gray-700">Add tone</p>
            <input
              value={newTone.name}
              onChange={(e) => setNewTone((p) => ({ ...p, name: e.target.value }))}
              placeholder="Name (e.g. Formal)"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
            />
            <textarea
              value={newTone.instructions}
              onChange={(e) => setNewTone((p) => ({ ...p, instructions: e.target.value }))}
              placeholder="Instructions (e.g. Use professional, concise language)"
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-sky-300"
            />
            <button
              type="submit"
              className="bg-sky-500 hover:bg-sky-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Add
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
