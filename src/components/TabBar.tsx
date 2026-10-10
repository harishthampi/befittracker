"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/app", label: "Home", icon: "◎" },
  { href: "/app/diary", label: "Diary", icon: "▤" },
  { href: "/app/food/add", label: "Add food", icon: "＋" },
  { href: "/app/targets", label: "Targets", icon: "◇" },
  { href: "/app/coach", label: "Coach", icon: "✉" },
];

/** Bottom navigation. aria-current tells screen readers which tab is open. */
export function TabBar() {
  const path = usePathname();
  return (
    <nav className="tabbar" aria-label="Main">
      <ul>
        {TABS.map((t) => {
          const active = t.href === "/app" ? path === "/app" : path.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link href={t.href} aria-current={active ? "page" : undefined}>
                <span className="tab-icon" aria-hidden="true">
                  {t.icon}
                </span>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
