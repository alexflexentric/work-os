"use client";
import { useState, useRef } from "react";

const LANGUAGES = ["English", "Dutch", "French", "German", "Spanish", "Russian", "Ukrainian"];
const FORMATS = [
  { id: "chat", label: "Chat" },
  { id: "email", label: "Email" },
  { id: "note", label: "Note" },
];

export default function TranslationPage() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("English");
  const [format, setFormat] = useState("chat");
  const [toneId, setToneId] = useState("");
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function handleTranslate() {
    if (!input.trim()) return;
    setLoading(true);
    setOutput("");
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, targetLanguage, format, toneId: toneId || undefined }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setOutput(data.text);
    } catch (e) {
      setOutput("Error: " + (e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleRecording() {
    if (recording) {
      mediaRef.current?.stop();
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setRecording(false);
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      const fd = new FormData();
      fd.append("audio", blob, "audio.webm");
      setLoading(true);
      try {
        const res = await fetch("/api/transcribe", { method: "POST", body: fd });
        const data = await res.json();
        if (data.text) setInput(data.text);
      } finally {
        setLoading(false);
      }
    };
    recorder.start();
    mediaRef.current = recorder;
    setRecording(true);
  }

  function copyOutput() {
    navigator.clipboard.writeText(output);
  }

  function speakOutput() {
    const utterance = new SpeechSynthesisUtterance(output);
    window.speechSynthesis.speak(utterance);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Translation</h1>

      <div className="flex gap-3 flex-wrap">
        <select
          value={targetLanguage}
          onChange={(e) => setTargetLanguage(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
        >
          {LANGUAGES.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {FORMATS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setFormat(id)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                format === id ? "bg-sky-500 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type or dictate something…"
          rows={5}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-sky-300"
        />
        <button
          onClick={toggleRecording}
          className={`absolute bottom-3 right-3 p-2 rounded-lg transition-colors ${
            recording ? "bg-red-100 text-red-500 animate-pulse" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
          }`}
          title={recording ? "Stop recording" : "Start recording"}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </button>
      </div>

      <button
        onClick={handleTranslate}
        disabled={loading || !input.trim()}
        className="w-full bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl transition-colors"
      >
        {loading ? "Working…" : "Translate"}
      </button>

      {output && (
        <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
          <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans">{output}</pre>
          <div className="flex gap-2">
            <button
              onClick={copyOutput}
              className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg transition-colors"
            >
              Copy
            </button>
            <button
              onClick={speakOutput}
              className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg transition-colors"
            >
              Speak
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
