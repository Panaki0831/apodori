import React from "react";

interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
}

const STATUS_CLASS_MAP: Record<string, string> = {
  pending: "badge badge-pending",
  running: "badge badge-running",
  completed: "badge badge-completed",
  failed: "badge badge-failed",
};

export default function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const cls = STATUS_CLASS_MAP[status] ?? "badge";
  const sizeClass = size === "sm" ? "badge-sm" : "";

  return <span className={`${cls} ${sizeClass}`}>{status}</span>;
}
