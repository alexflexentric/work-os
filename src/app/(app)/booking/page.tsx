"use client";
import { useEffect, useState } from "react";

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
  endAt: string;
  durationMinutes: number;
  status: string;
  teamsLink: string | null;
  createdAt: string;
  bookingPage: { name: string; slug: string };
};

export default function BookingPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/bookings")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setBookings(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const upcoming = bookings.filter((b) => new Date(b.startAt) >= new Date());
  const past = bookings.filter((b) => new Date(b.startAt) < new Date());

  return (
    <div className="max-w-2xl space-y-6">
      <h1
        className="text-3xl font-normal text-[--foreground]"
        style={{ fontFamily: "'Charter', 'Georgia', serif" }}
      >
        Booking
      </h1>

      {loading ? (
        <p className="text-sm text-[--muted-foreground]">Loading…</p>
      ) : bookings.length === 0 ? (
        <p className="text-sm text-[--muted-foreground]">No bookings yet.</p>
      ) : (
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
      )}
    </div>
  );
}

function BookingList({ bookings, muted }: { bookings: Booking[]; muted?: boolean }) {
  return (
    <ul className="space-y-px border border-[--border] rounded-lg overflow-hidden">
      {bookings.map((b) => {
        const start = new Date(b.startAt);
        const dateLabel = start.toLocaleDateString("en-GB", {
          weekday: "short", day: "numeric", month: "short", year: "numeric",
        });
        const timeLabel = start.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

        return (
          <li
            key={b.id}
            className={`bg-[--card] border-b border-[--border] last:border-0 px-4 py-3 ${muted ? "opacity-60" : ""}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[--foreground]">{b.subject}</p>
                <p className="text-xs text-[--muted-foreground] mt-0.5">
                  {b.guestName} · {b.guestCompany}
                </p>
                <p className="text-xs text-[--muted-foreground]">{b.guestEmail}</p>
                <p className="text-xs text-[--foreground] mt-1">
                  {dateLabel} at {timeLabel} · {b.durationMinutes} min
                </p>
                <p className="text-xs text-[--muted-foreground]">
                  {b.location === "online" ? "Online" : b.address ?? "Offline"} · {b.bookingPage.name}
                </p>
                {b.note && (
                  <p className="text-xs text-[--muted-foreground] mt-1 italic">{b.note}</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                {b.teamsLink && (
                  <a
                    href={b.teamsLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 rounded-md text-xs border border-[--border] text-[--muted-foreground] hover:text-[--foreground] transition-colors"
                  >
                    Teams link
                  </a>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
