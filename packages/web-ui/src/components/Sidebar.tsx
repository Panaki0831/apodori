"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "ダッシュボード", icon: "📊" },
  { href: "/import", label: "CSVインポート", icon: "📁" },
  { href: "/jobs", label: "ジョブ管理", icon: "⚙️" },
  { href: "/companies", label: "企業一覧", icon: "🏢" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-logo">営業AI Agent</span>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link ${isActive ? "sidebar-link-active" : ""}`}
            >
              <span className="sidebar-link-icon">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <span className="sidebar-version">v1.0.0</span>
      </div>
    </aside>
  );
}
