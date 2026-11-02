"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Briefcase, Compass, Star, Bell, Inbox, User } from "lucide-react";

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/portfolio", label: "Portfolio", icon: Briefcase },
  { href: "/explore", label: "Explore", icon: Compass },
  { href: "/watchlist", label: "Watchlist", icon: Star },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/notifications", label: "Notifications", icon: Inbox },
  { href: "/profile", label: "Profile", icon: User },
];

export function NavLinks({ unread }: { unread: number }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:px-3 md:pb-0">
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = path === href || path.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm no-underline hover:no-underline ${active ? "bg-brand-50 text-brand-700 font-medium" : "text-ink-muted hover:bg-canvas hover:text-ink"}`}
          >
            <Icon size={16} aria-hidden />
            <span>{label}</span>
            {href === "/notifications" && unread > 0 && (
              <span className="ml-auto rounded-full bg-brand-600 px-1.5 text-[11px] font-medium text-white" aria-label={`${unread} unread`}>{unread}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
