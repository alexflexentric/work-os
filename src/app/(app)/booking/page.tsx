"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

// ─── Types ────────────────────────────────────────────────────────────────────

type BookingPageData = {
  id: string;
  name: string;
  slug: string;
  durations: number[];
  timezone: string;
};

type Slot = { start: string; end: string };

type Step = "duration" | "datetime" | "details" | "confirmed";

type ConfirmedBooking = {
  bookingId: string;
  teamsLink: string | null;
  subject: string;
  dateLabel: string;
  durationMinutes: number;
  location: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(localIso: string, timezone: string) {
  const d = new Date(localIso + "Z");
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: timezone });
}

function formatTime(localIso: string, timezone: string) {
  const d = new Date(localIso + "Z");
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: timezone });
}

function formatFull(localIso: string, timezone: string, durationMinutes: number) {
  const d = new Date(localIso + "Z");
  return d.toLocaleString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: timezone,
  }) + ` · ${durationMinutes} min`;
}

function slotDateKey(localIso: string) {
  return localIso.slice(0, 10);
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BookingPage() {
  const { data: session } = useSession();
  const [pages, setPages] = useState<BookingPageData[]>([]);
  const [selectedPage, setSelectedPage] = useState<BookingPageData | null>(null);
  const [loadingPages, setLoadingPages] = useState(true);
  const [view, setView] = useState<"book" | "list">("book");

  useEffect(() => {
    fetch("/api/booking-pages")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d) && d.length > 0) {
          setPages(d);
          setSelectedPage(d[0]);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingPages(false));
  }, []);

  const inputCls =
    "w-full border border-[--border] rounded-lg px-3 py-2 text-sm bg-[--card] text-[--foreground] placeholder:text-[--muted-foreground] focus:outline-none focus-visible:ring-2 focus-visible:ring-[--ring]";

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1
          className="text-3xl font-normal text-[--foreground]"
          style={{ fontFamily: "'Charter', 'Georgia', serif" }}
        >
          Booking
        </h1>
        <div className="flex gap-1 border border-[--border] rounded-lg p-0.5">
          <button
            onClick={() => setView("book")}
            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${view === "book" ? "bg-[--foreground] text-[--background]" : "text-[--muted-foreground] hover:text-[--foreground]"}`}
          >
            Book
          </button>
          <button
            onClick={() => setView("list")}
            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${view === "list" ? "bg-[--foreground] text-[--background]" : "text-[--muted-foreground] hover:text-[--foreground]"}`}
          >
            Bookings
          </button>
        </div>
      </div>

      {view === "book" ? (
        loadingPages ? (
          <p className="text-sm text-[--muted-foreground]">Loading…</p>
        ) : pages.length === 0 ? (
          <p className="text-sm text-[--muted-foreground]">
            No booking pages yet. Create one in Settings → Booking pages.
          </p>
        ) : (
          <div className="space-y-4">
            {pages.length > 1 && (
              <div className="flex gap-1.5 flex-wrap">
                {pages.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPage(p)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${selectedPage?.id === p.id ? "bg-[--foreground] text-[--background] border-[--foreground]" : "border-[--border] text-[--muted-foreground] hover:text-[--foreground]"}`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
            {selectedPage && (
              <BookingFlow
                key={selectedPage.id}
                page={selectedPage}
                defaultName={session?.user?.name ?? ""}
                defaultEmail={session?.user?.email ?? ""}
                inputCls={inputCls}
              />
            )}
          </div>
        )
      ) : (
        <BookingsList />
      )}
    </div>
  );
}

// ─── Booking flow ─────────────────────────────────────────────────────────────

function BookingFlow({
  page,
  defaultName,
  defaultEmail,
  inputCls,
}: {
  page: BookingPageData;
  defaultName: string;
  defaultEmail: string;
  inputCls: string;
}) {
  const [step, setStep] = useState<Step>("duration");
  const [duration, setDuration] = useState<number>(page.durations[0] ?? 30);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [confirmed, setConfirmed] = useState<ConfirmedBooking | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [form, setForm] = useState({
    guestName: defaultName,
    guestEmail: defaultEmail,
    guestCompany: "",
    subject: "",
    note: "",
    location: "online",
    address: "",
  });

  async function loadSlots(dur: number) {
    setLoadingSlots(true);
    setSlots([]);
    setSelectedDate(null);
    setSelectedSlot(null);
    try {
      const res = await fetch(`/api/availability?slug=${page.slug}&duration=${dur}&days=30`);
      const data = await res.json();
      if (Array.isArray(data.slots)) setSlots(data.slots);
    } catch {
      // slots stays empty
    } finally {
      setLoadingSlots(false);
    }
  }

  function goToDatetime(dur: number) {
    setDuration(dur);
    loadSlots(dur);
    setStep("datetime");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSlot) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingPageId: page.id,
          guestName: form.guestName,
          guestEmail: form.guestEmail,
          guestCompany: form.guestCompany,
          subject: form.subject,
          note: form.note || null,
          location: form.location,
          address: form.location === "offline" ? form.address : null,
          start: selectedSlot.start,
          durationMinutes: duration,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error === "slot_taken" ? "This slot was just taken. Please pick another time." : "Something went wrong. Please try again.");
        return;
      }
      setConfirmed({
        bookingId: data.bookingId,
        teamsLink: data.teamsLink,
        subject: form.subject,
        dateLabel: formatFull(selectedSlot.start, page.timezone, duration),
        durationMinutes: duration,
        location: form.location,
      });
      setStep("confirmed");
    } finally {
      setSubmitting(false);
    }
  }

  // Group slots by date
  const slotsByDate = slots.reduce<Record<string, Slot[]>>((acc, s) => {
    const key = slotDateKey(s.start);
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});
  const availableDates = Object.keys(slotsByDate).sort();

  // Step indicator
  const steps: { id: Step; label: string }[] = [
    { id: "duration", label: "Duration" },
    { id: "datetime", label: "Date & Time" },
    { id: "details", label: "Details" },
  ];
  const stepIndex = { duration: 0, datetime: 1, details: 2, confirmed: 3 };

  if (step === "confirmed" && confirmed) {
    return (
      <div className="border border-[--border] rounded-xl p-8 space-y-6 text-center">
        <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center mx-auto">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div className="space-y-1">
          <p className="text-lg font-medium text-[--foreground]">Meeting confirmed</p>
          <p className="text-sm text-[--muted-foreground]">{confirmed.subject}</p>
        </div>
        <div className="text-sm text-[--foreground] space-y-1">
          <p>{confirmed.dateLabel}</p>
          <p className="text-[--muted-foreground]">{confirmed.location === "online" ? "Online" : "Offline"}</p>
        </div>
        {confirmed.teamsLink && (
          <a
            href={confirmed.teamsLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-5 py-2.5 rounded-lg text-sm font-medium bg-[#6264a7] text-white hover:opacity-90 transition-opacity"
          >
            Join Microsoft Teams
          </a>
        )}
        <p className="text-xs text-[--muted-foreground]">
          Confirmation emails have been sent. Calendar invite was created automatically.
        </p>
        <button
          onClick={() => { setStep("duration"); setConfirmed(null); setForm((f) => ({ ...f, guestCompany: "", subject: "", note: "" })); }}
          className="text-xs text-[--muted-foreground] hover:text-[--foreground] underline transition-colors"
        >
          Book another meeting
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => {
          const current = step === s.id;
          const done = stepIndex[step] > i;
          return (
            <div key={s.id} className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (done) {
                    if (s.id === "duration") setStep("duration");
                    if (s.id === "datetime") setStep("datetime");
                  }
                }}
                disabled={!done && !current}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  current
                    ? "border-accent bg-accent text-white"
                    : done
                    ? "border-[--border] text-[--foreground] hover:bg-[--muted] cursor-pointer"
                    : "border-[--border] text-[--muted-foreground] cursor-default"
                }`}
              >
                {done && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
                {s.label}
              </button>
              {i < steps.length - 1 && <div className="w-6 h-px bg-[--border]" />}
            </div>
          );
        })}
      </div>

      {/* Step: Duration */}
      {step === "duration" && (
        <div className="border border-[--border] rounded-xl p-6 space-y-5">
          <div className="space-y-1">
            <p className="text-base font-medium text-[--foreground]">Select duration</p>
            <p className="text-sm text-[--muted-foreground]">How long should the meeting be?</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {page.durations.map((d) => (
              <button
                key={d}
                onClick={() => setDuration(d)}
                className={`px-4 py-2 rounded-full text-sm border transition-colors ${
                  duration === d
                    ? "bg-accent text-white border-accent"
                    : "border-[--border] text-[--foreground] hover:border-accent hover:text-accent"
                }`}
              >
                {d} min
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs text-[--muted-foreground] bg-[--muted] rounded-lg px-3 py-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
            Online meetings will include a Microsoft Teams link in the confirmation email.
          </div>
          <button
            onClick={() => goToDatetime(duration)}
            className="w-full py-2.5 rounded-lg text-sm font-medium bg-accent text-white hover:opacity-90 transition-opacity"
          >
            Continue
          </button>
        </div>
      )}

      {/* Step: Date & Time */}
      {step === "datetime" && (
        <div className="border border-[--border] rounded-xl p-6 space-y-5">
          <div className="flex items-center gap-3">
            <button onClick={() => setStep("duration")} className="text-xs text-[--muted-foreground] hover:text-[--foreground] flex items-center gap-1 transition-colors">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
              Back
            </button>
          </div>
          <div className="space-y-1">
            <p className="text-base font-medium text-[--foreground]">Pick a date & time</p>
            <p className="text-sm text-[--muted-foreground]">{duration} min meeting · Select an available slot</p>
          </div>

          {loadingSlots ? (
            <p className="text-sm text-[--muted-foreground]">Loading available slots…</p>
          ) : availableDates.length === 0 ? (
            <p className="text-sm text-[--muted-foreground]">No available slots in the next 30 days.</p>
          ) : (
            <div className="space-y-4">
              {/* Day pills */}
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {availableDates.map((dateKey) => {
                  const sample = slotsByDate[dateKey][0];
                  const active = selectedDate === dateKey;
                  const d = new Date(sample.start + "Z");
                  const dow = d.toLocaleDateString("en-GB", { weekday: "short", timeZone: page.timezone });
                  const day = d.toLocaleDateString("en-GB", { day: "numeric", timeZone: page.timezone });
                  const mon = d.toLocaleDateString("en-GB", { month: "short", timeZone: page.timezone });
                  return (
                    <button
                      key={dateKey}
                      onClick={() => { setSelectedDate(dateKey); setSelectedSlot(null); }}
                      className={`flex flex-col items-center px-3 py-2.5 rounded-xl border shrink-0 transition-colors min-w-[56px] ${
                        active ? "bg-accent text-white border-accent" : "border-[--border] text-[--foreground] hover:border-accent"
                      }`}
                    >
                      <span className="text-xs font-medium">{dow}</span>
                      <span className="text-lg font-semibold leading-tight">{day}</span>
                      <span className="text-xs">{mon}</span>
                    </button>
                  );
                })}
              </div>

              {/* Time slots */}
              {selectedDate && (
                <div className="space-y-2">
                  <p className="text-xs text-[--muted-foreground]">Times shown in {page.timezone}</p>
                  <div className="flex gap-2 flex-wrap">
                    {slotsByDate[selectedDate].map((slot) => {
                      const active = selectedSlot?.start === slot.start;
                      return (
                        <button
                          key={slot.start}
                          onClick={() => setSelectedSlot(slot)}
                          className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                            active ? "bg-accent text-white border-accent" : "border-[--border] text-[--foreground] hover:border-accent"
                          }`}
                        >
                          {formatTime(slot.start, page.timezone)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => setStep("details")}
            disabled={!selectedSlot}
            className="w-full py-2.5 rounded-lg text-sm font-medium bg-accent text-white hover:opacity-90 disabled:opacity-30 transition-opacity"
          >
            Continue
          </button>
        </div>
      )}

      {/* Step: Details */}
      {step === "details" && selectedSlot && (
        <form onSubmit={submit} className="border border-[--border] rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setStep("datetime")} className="text-xs text-[--muted-foreground] hover:text-[--foreground] flex items-center gap-1 transition-colors">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
              Back
            </button>
          </div>
          <div className="space-y-1">
            <p className="text-base font-medium text-[--foreground]">Your details</p>
            <p className="text-sm text-[--muted-foreground]">{duration} min · {formatDate(selectedSlot.start, page.timezone)} {formatTime(selectedSlot.start, page.timezone)}</p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[--muted-foreground] mb-1">Full name *</label>
              <input required value={form.guestName} onChange={(e) => setForm({ ...form, guestName: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-[--muted-foreground] mb-1">Email address *</label>
              <input required type="email" value={form.guestEmail} onChange={(e) => setForm({ ...form, guestEmail: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-[--muted-foreground] mb-1">Company *</label>
              <input required value={form.guestCompany} onChange={(e) => setForm({ ...form, guestCompany: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-[--muted-foreground] mb-1">Subject *</label>
              <input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="What's this meeting about?" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-[--muted-foreground] mb-1">Notes</label>
              <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={3} placeholder="Anything to know beforehand?" className={inputCls + " resize-none"} />
            </div>
            <div>
              <label className="block text-xs font-medium text-[--muted-foreground] mb-1.5">Location *</label>
              <div className="flex gap-2">
                {["online", "offline"].map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => setForm({ ...form, location: loc })}
                    className={`px-4 py-2 rounded-full text-sm border transition-colors capitalize ${
                      form.location === loc ? "bg-accent text-white border-accent" : "border-[--border] text-[--foreground] hover:border-accent"
                    }`}
                  >
                    {loc === "online" ? "🎥 Online" : "📍 Offline"}
                  </button>
                ))}
              </div>
              {form.location === "online" && (
                <p className="text-xs text-[--muted-foreground] mt-1.5">A Microsoft Teams link will be included in the confirmation.</p>
              )}
              {form.location === "offline" && (
                <div className="mt-2">
                  <input required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Meeting address" className={inputCls} />
                </div>
              )}
            </div>
          </div>

          {submitError && (
            <p className="text-xs text-[--destructive]">{submitError}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 rounded-lg text-sm font-medium bg-accent text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {submitting ? "Booking…" : "Request meeting"}
          </button>
        </form>
      )}
    </div>
  );
}

// ─── Bookings list ────────────────────────────────────────────────────────────

type Booking = {
  id: string;
  guestName: string;
  guestEmail: string;
  guestCompany: string;
  subject: string;
  note: string | null;
  location: string;
  address: string | null;
  startAt: string;
  durationMinutes: number;
  teamsLink: string | null;
  bookingPage: { name: string; slug: string };
};

function BookingsList() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/bookings")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setBookings(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-[--muted-foreground]">Loading…</p>;
  if (bookings.length === 0) return <p className="text-sm text-[--muted-foreground]">No bookings yet.</p>;

  const now = new Date();
  const upcoming = bookings.filter((b) => new Date(b.startAt) >= now);
  const past = bookings.filter((b) => new Date(b.startAt) < now);

  return (
    <div className="space-y-8">
      {upcoming.length > 0 && (
        <section className="space-y-3">
          <p className="text-xs font-medium text-[--muted-foreground]">Upcoming</p>
          <BookingList bookings={upcoming} />
        </section>
      )}
      {past.length > 0 && (
        <section className="space-y-3">
          <p className="text-xs font-medium text-[--muted-foreground]">Past</p>
          <BookingList bookings={past} muted />
        </section>
      )}
    </div>
  );
}

function BookingList({ bookings, muted }: { bookings: Booking[]; muted?: boolean }) {
  return (
    <ul className="space-y-px border border-[--border] rounded-lg overflow-hidden">
      {bookings.map((b) => {
        const start = new Date(b.startAt);
        const dateLabel = start.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
        const timeLabel = start.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
        return (
          <li key={b.id} className={`bg-[--card] border-b border-[--border] last:border-0 px-4 py-3 ${muted ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[--foreground]">{b.subject}</p>
                <p className="text-xs text-[--muted-foreground] mt-0.5">{b.guestName} · {b.guestCompany}</p>
                <p className="text-xs text-[--muted-foreground]">{b.guestEmail}</p>
                <p className="text-xs text-[--foreground] mt-1">{dateLabel} at {timeLabel} · {b.durationMinutes} min</p>
                <p className="text-xs text-[--muted-foreground]">
                  {b.location === "online" ? "Online" : b.address ?? "Offline"} · {b.bookingPage.name}
                </p>
                {b.note && <p className="text-xs text-[--muted-foreground] mt-1 italic">{b.note}</p>}
              </div>
              {b.teamsLink && (
                <a href={b.teamsLink} target="_blank" rel="noopener noreferrer"
                  className="shrink-0 px-2.5 py-1 rounded-md text-xs border border-[--border] text-[--muted-foreground] hover:text-[--foreground] transition-colors">
                  Teams link
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
