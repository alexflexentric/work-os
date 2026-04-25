"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Languages, Settings, LogOut, CalendarDays, Home, BookOpen } from "lucide-react";

const links = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/translation", label: "Translation", icon: Languages },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/booking", label: "Booking", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-[220px] flex-col border-r border-[--border] bg-[--background] z-40">
        <div className="h-14 flex items-center px-5 border-b border-[--border]">
          <span className="text-xl font-normal text-[--foreground]" style={{ fontFamily: "'Charter', 'Georgia', serif" }}>
            Work OS
          </span>
        </div>
        <nav className="flex-1 py-4 px-2 space-y-0.5">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== "/home" && !!pathname?.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={`relative flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                  active
                    ? "bg-accent-subtle text-accent-subtle-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {active && <span className="absolute left-0 inset-y-1 w-0.5 rounded-full bg-accent" />}
                <Icon size={15} strokeWidth={1.75} className={active ? "text-accent" : ""} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="py-4 px-2 border-t border-[--border]">
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            <LogOut size={15} strokeWidth={1.75} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-[--border] bg-[--background] flex items-center justify-around px-1 pb-safe">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/home" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-1 px-3 py-3 text-[10px] font-medium transition-colors ${
                active ? "text-accent" : "text-muted-foreground"
              }`}
            >
              <Icon size={20} strokeWidth={1.75} />
              {label}
            </Link>
          );
        })}
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="flex flex-col items-center gap-1 px-3 py-3 text-[10px] font-medium text-muted-foreground"
        >
          <LogOut size={20} strokeWidth={1.75} />
          Sign out
        </button>
      </nav>
    </>
  );
}
