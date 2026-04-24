"use client";
import { useState, useRef, useEffect } from "react";

const LANGUAGES = [
  { code: "NL", label: "Dutch" },
  { code: "EN", label: "English" },
  { code: "FR", label: "French" },
  { code: "DE", label: "German" },
  { code: "UA", label: "Ukrainian" },
  { code: "RU", label: "Russian" },
];

const FORMATS = ["Chat", "Email", "Note"];

const BUILT_IN_TONES = [
  {
    id: "informal",
    name: "Informal",
    instructions:
      "warm, casual, and conversational. Always starts with Hi, Hello, or Hey. In Dutch, always uses 'je' instead of 'u'. Never use emojis or emoticons.",
  },
  {
    id: "formal",
    name: "Formal",
    instructions:
      "polite and professional but approachable, avoiding stiff corporate language. In Dutch uses 'u'.",
  },
];

const LANG_CODES: Record<string, string> = {
  Dutch: "nl-NL",
  English: "en-GB",
  French: "fr-FR",
  German: "de-DE",
  Ukrainian: "uk-UA",
  Russian: "ru-RU",
};

type Tone = { id: string; name: string; instructions: string };

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
        active
          ? "bg-pink-100 text-pink-700"
          : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] uppercase tracking-widest text-gray-400 font-medium mb-2">
      {children}
    </p>
  );
}

export default function TranslationPage() {
  const [input, setInput] = useState("");
  const [lang, setLang] = useState("Dutch");
  const [format, setFormat] = useState("Chat");
  const [tones, setTones] = useState<Tone[]>(BUILT_IN_TONES);
  const [toneId, setToneId] = useState("informal");
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [result, setResult] = useState<{ meta: string; subject?: string; body: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    fetch("/api/tones")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setTones([...BUILT_IN_TONES, ...data]);
        }
      })
      .catch(() => {});
  }, []);

  async function handleTranslate() {
    if (!input.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const tone = tones.find((t) => t.id === toneId);
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input,
          targetLanguage: lang,
          format: format.toLowerCase(),
          toneInstructions: tone?.instructions,
          toneName: tone?.name,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const meta = `${format} · ${lang} · ${tone?.name ?? ""}`;

      if (format === "Email") {
        try {
          const parsed = JSON.parse(data.text);
          setResult({ meta, subject: parsed.subject, body: parsed.body });
        } catch {
          setResult({ meta, body: data.text });
        }
      } else {
        setResult({ meta, body: data.text });
      }
    } catch (e) {
      setResult({ meta: "", body: "Error: " + (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  async function toggleRecording() {
    if (recording) {
      mediaRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]
        .find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      startTimeRef.current = Date.now();
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordingSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);

      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        setRecording(false);
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
        if (blob.size < 5000 || elapsed < 1) return;
        const fd = new FormData();
        fd.append("audio", blob, "audio.webm");
        setLoading(true);
        try {
          const res = await fetch("/api/transcribe", { method: "POST", body: fd });
          const data = await res.json();
          if (data.text) setInput((prev) => (prev ? prev + " " + data.text : data.text));
        } finally {
          setLoading(false);
        }
      };
      recorder.start(1000);
      mediaRef.current = recorder;
      setRecording(true);
    } catch {
      alert("Microphone access denied.");
    }
  }

  function formatTimer(s: number) {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function toggleSpeak() {
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    if (!result?.body) return;
    const utter = new SpeechSynthesisUtterance(result.body);
    utter.lang = LANG_CODES[lang] ?? "en-GB";
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utter);
  }

  const copyAllText = result
    ? result.subject
      ? `Subject: ${result.subject}\n\n${result.body}`
      : result.body
    : "";

  return (
    <div className="max-w-xl mx-auto py-6 px-4 space-y-6">

      {/* Your text */}
      <div>
        <SectionLabel>Your text</SectionLabel>
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleTranslate();
            }}
            placeholder="Hi, please help me with…"
            rows={5}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-12 text-sm resize-none bg-white focus:outline-none focus:ring-2 focus:ring-pink-200"
          />
          <button
            onClick={toggleRecording}
            title={recording ? "Stop" : "Record"}
            className={`absolute bottom-3 right-3 p-2 rounded-lg transition-colors ${
              recording
                ? "bg-red-100 text-red-500 animate-pulse"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {recording ? (
              <span className="text-xs font-mono px-1">{formatTimer(recordingSeconds)}</span>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Translate to */}
      <div>
        <SectionLabel>Translate to</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map(({ code, label }) => (
            <Pill key={code} active={lang === label} onClick={() => setLang(label)}>
              {code}
            </Pill>
          ))}
        </div>
      </div>

      {/* Format */}
      <div>
        <SectionLabel>Format</SectionLabel>
        <div className="flex gap-2">
          {FORMATS.map((f) => (
            <Pill key={f} active={format === f} onClick={() => setFormat(f)}>
              {f}
            </Pill>
          ))}
        </div>
      </div>

      {/* Tone */}
      <div>
        <SectionLabel>Tone</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {tones.map((t) => (
            <Pill key={t.id} active={toneId === t.id} onClick={() => setToneId(t.id)}>
              {t.name}
            </Pill>
          ))}
        </div>
      </div>

      {/* Translate button */}
      <button
        onClick={handleTranslate}
        disabled={loading || !input.trim()}
        className="w-full bg-[#E91E63] hover:bg-[#D81B60] disabled:opacity-40 text-white font-medium py-2.5 rounded-xl transition-colors text-sm"
      >
        {loading ? "Working…" : "Translate"}
      </button>

      {/* Result */}
      {result && (
        <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
          {result.meta && (
            <p className="text-[11px] uppercase tracking-widest text-gray-400 font-medium">
              {result.meta}
            </p>
          )}

          {result.subject && (
            <div>
              <p className="text-[11px] uppercase tracking-widest text-gray-400 font-medium mb-1">Subject</p>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-gray-800">{result.subject}</p>
                <button
                  onClick={() => copy(result.subject!)}
                  className="shrink-0 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-2 py-1 rounded-lg"
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          <div>
            <p className="text-[11px] uppercase tracking-widest text-gray-400 font-medium mb-1">Output</p>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{result.body}</p>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => copy(copyAllText)}
              className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg transition-colors"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
            <button
              onClick={toggleSpeak}
              className={`text-xs border px-3 py-1.5 rounded-lg transition-colors ${
                speaking
                  ? "border-pink-300 text-pink-600 bg-pink-50"
                  : "border-gray-200 text-gray-500 hover:text-gray-700"
              }`}
            >
              {speaking ? "⏹ Stop" : "🔊 Speak"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
