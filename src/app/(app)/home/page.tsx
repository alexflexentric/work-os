import { auth } from "@/auth";
import Link from "next/link";
import { Languages, CalendarDays } from "lucide-react";

export const dynamic = "force-dynamic";

const features = [
  {
    href: "/translation",
    icon: Languages,
    label: "Translation",
    description: "Translate text or voice recordings using AI with custom formats and tones.",
  },
  {
    href: "/calendar",
    icon: CalendarDays,
    label: "Calendar",
    description: "View your Microsoft calendar and iCal feeds in one unified week view.",
  },
];

export default async function HomePage() {
  const session = await auth();
  const name = session?.user?.name?.split(" ")[0] ?? "there";

  return (
    <div className="space-y-8">
      <div>
        <h1
          className="text-3xl font-normal text-[--foreground] mb-1"
          style={{ fontFamily: "'Charter', 'Georgia', serif" }}
        >
          Hi, {name}
        </h1>
        <p className="text-sm text-[--muted-foreground]">What would you like to do today?</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {features.map(({ href, icon: Icon, label, description }) => (
          <Link
            key={href}
            href={href}
            className="group block border border-[--border] rounded-xl p-6 bg-[--card] hover:bg-[--muted] transition-colors"
          >
            <div className="flex items-center gap-3 mb-3">
              <Icon size={18} strokeWidth={1.75} className="text-[--muted-foreground] group-hover:text-[--foreground] transition-colors" />
              <span className="text-sm font-medium text-[--foreground]">{label}</span>
            </div>
            <p className="text-xs text-[--muted-foreground] leading-relaxed">{description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
