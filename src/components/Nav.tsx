"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Languages, Settings } from "lucide-react";

const links = [
  { href: "/translation", label: "Translation", icon: Languages },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 w-[220px] flex flex-col border-r border-[--border] bg-[--background]">
      {/* Wordmark */}
      <div className="h-14 flex items-center px-5 border-b border-[--border]">
        <span
          className="text-xl font-normal text-[--foreground]"
          style={{ fontFamily: "'Charter', 'Georgia', serif" }}
        >
          Work OS
        </span>
      </div>

      {/* Nav links */}
      <nav className="flex-1 py-4 px-2 space-y-0.5">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-[--muted] text-[--foreground] font-medium"
                  : "text-[--muted-foreground] hover:bg-[--muted] hover:text-[--foreground]"
              }`}
            >
              <Icon size={15} strokeWidth={1.75} />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
