"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const BASE_URL = typeof window !== "undefined" ? window.location.origin : "https://work-os.flexentric.com";

type Step = "microsoft" | "done"; // "google" disabled — Microsoft-only

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 text-xs bg-[--muted] border border-[--border] rounded px-3 py-2 text-[--foreground] break-all">
        {value}
      </code>
      <button
        onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="shrink-0 text-xs border border-[--border] px-2.5 py-1.5 rounded-md text-[--muted-foreground] hover:text-[--foreground] transition-colors"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-[--muted-foreground] mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-[--border] rounded-lg px-3 py-2 text-sm bg-[--card] text-[--foreground] placeholder:text-[--muted-foreground] focus:outline-none focus-visible:ring-2 focus-visible:ring-[--ring] focus-visible:ring-offset-2 font-mono"
      />
    </div>
  );
}

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("microsoft");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Google state disabled — Microsoft-only. Re-enable if migrating to Google.
  // const [googleClientId, setGoogleClientId] = useState("");
  // const [googleClientSecret, setGoogleClientSecret] = useState("");
  // const googleRedirect = `${BASE_URL}/api/auth/callback/google`;
  const [microsoftClientId, setMicrosoftClientId] = useState("");
  const [microsoftClientSecret, setMicrosoftClientSecret] = useState("");
  const [microsoftTenantId, setMicrosoftTenantId] = useState("");

  const microsoftRedirect = `${BASE_URL}/api/auth/callback/microsoft-entra-id`;

  async function save(data: Record<string, string>) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save");
    } catch {
      setError("Something went wrong. Please try again.");
      setSaving(false);
      return false;
    }
    setSaving(false);
    return true;
  }

  // Google handler disabled — Microsoft-only.
  // async function handleGoogleContinue() { ... }

  async function handleMicrosoftContinue() {
    if (!microsoftClientId || !microsoftClientSecret) { setStep("done"); return; }
    const ok = await save({ microsoftClientId, microsoftClientSecret, microsoftTenantId: microsoftTenantId || "common" });
    if (ok) setStep("done");
  }

  const inputCls = "w-full border border-[--border] rounded-lg px-3 py-2 text-sm bg-[--card] text-[--foreground] font-mono";

  return (
    <main className="min-h-screen flex items-center justify-center bg-[--background] px-4">
      <div className="w-full max-w-lg border border-[--border] rounded-xl p-10 bg-[--card] space-y-8">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-normal text-[--foreground] mb-1" style={{ fontFamily: "'Charter', 'Georgia', serif" }}>
            Work OS Setup
          </h1>
          <p className="text-sm text-[--muted-foreground]">
            Connect at least one sign-in provider to get started. You can add or change these later in Settings.
          </p>
        </div>

        {/* Progress */}
        <div className="flex gap-2 items-center">
          {(["microsoft", "done"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                step === s ? "bg-[--foreground] text-[--background]" :
                ["microsoft", "done"].indexOf(step) > i ? "bg-[--accent] text-[--accent-foreground]" :
                "border border-[--border] text-[--muted-foreground]"
              }`}>
                {["microsoft", "done"].indexOf(step) > i ? "✓" : i + 1}
              </div>
              <span className={`text-xs ${step === s ? "text-[--foreground] font-medium" : "text-[--muted-foreground]"}`}>
                {s === "microsoft" ? "Microsoft" : "Done"}
              </span>
              {i < 1 && <div className="w-6 h-px bg-[--border]" />}
            </div>
          ))}
        </div>

        {/* Google step disabled — Microsoft-only. Re-enable if migrating to Google. */}

        {/* Step: Microsoft */}
        {step === "microsoft" && (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-medium text-[--foreground] mb-1">Microsoft Entra ID</h2>
              <p className="text-xs text-[--muted-foreground]">Connect your Microsoft Entra app to enable sign-in.</p>
            </div>

            <div className="border border-[--border] rounded-lg p-4 space-y-3 bg-[--muted]/40 text-xs text-[--muted-foreground]">
              <p className="font-medium text-[--foreground]">How to create a Microsoft Entra app:</p>
              <ol className="space-y-1.5 list-decimal list-inside">
                <li>Go to <strong>portal.azure.com</strong> → Microsoft Entra ID → App registrations</li>
                <li>Click <strong>New registration</strong></li>
                <li>Name: <strong>work-os</strong> — Supported account types: <strong>Single tenant</strong> (or multi-tenant if personal)</li>
                <li>Add this redirect URI (type: Web):</li>
              </ol>
              <CopyField value={microsoftRedirect} />
              <ol className="space-y-1.5 list-decimal list-inside" start={5}>
                <li>Go to <strong>Certificates & secrets → New client secret</strong> — copy the Value immediately</li>
                <li>Go to <strong>API permissions → Add → Microsoft Graph → Delegated</strong> and add: <strong>Calendars.ReadWrite, offline_access, openid, email, profile</strong></li>
                <li>Click <strong>Grant admin consent</strong></li>
                <li>Copy Application (client) ID, Client secret, and Directory (tenant) ID below</li>
              </ol>
            </div>

            <div className="space-y-3">
              <Field label="Application (Client) ID" value={microsoftClientId} onChange={setMicrosoftClientId} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
              <Field label="Client Secret" value={microsoftClientSecret} onChange={setMicrosoftClientSecret} placeholder="Client secret value" type="password" />
              <Field label="Directory (Tenant) ID" value={microsoftTenantId} onChange={setMicrosoftTenantId} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (or leave blank for common)" />
            </div>

            {error && <p className="text-xs text-[--destructive]">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={handleMicrosoftContinue}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-[--foreground] text-[--background] hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {microsoftClientId && microsoftClientSecret ? (saving ? "Saving…" : "Save & Continue") : "Skip"}
              </button>
            </div>
          </div>
        )}

        {/* Step: Done */}
        {step === "done" && (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-medium text-[--foreground] mb-1">You&apos;re all set</h2>
              <p className="text-xs text-[--muted-foreground]">
                Work OS is configured. Sign in with your connected provider to continue.
              </p>
            </div>
            <button
              onClick={() => router.push("/")}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-[--foreground] text-[--background] hover:opacity-90 transition-opacity"
            >
              Go to sign in →
            </button>
          </div>
        )}

      </div>
    </main>
  );
}
