"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchApi, type Company } from "@/lib/api";

const PAGE_SIZE = 20;

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    async function load() {
      const res = await fetchApi<Company[]>("/api/companies");
      if (res.ok) setCompanies(res.data);
      setLoading(false);
    }
    load();
  }, []);

  /* Filter by name */
  const filtered = useMemo(() => {
    if (!search.trim()) return companies;
    const q = search.trim().toLowerCase();
    return companies.filter((c) => c.name.toLowerCase().includes(q));
  }, [companies, search]);

  /* Pagination */
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  /* Reset page when search changes */
  useEffect(() => {
    setPage(1);
  }, [search]);

  if (loading) {
    return (
      <div className="loading">
        <span className="spinner" />
        読み込み中...
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <h1>企業一覧</h1>
        <p>収集済み企業の一覧（{filtered.length} 件）</p>
      </div>

      {/* Search */}
      <div className="search-bar">
        <span className="search-bar-icon">🔍</span>
        <input
          type="text"
          className="form-input"
          placeholder="企業名で検索..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {paginated.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">🏢</div>
            <h3>企業が見つかりません</h3>
            <p>検索条件を変更するか、CSVインポートで企業を追加してください</p>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>企業名</th>
                  <th>URL</th>
                  <th>業種</th>
                  <th>連絡先数</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/companies/${c.id}`}>
                        <strong>{c.name}</strong>
                      </Link>
                    </td>
                    <td className="text-muted text-sm">
                      {c.url ? (
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {c.url}
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>{c.industry ?? "-"}</td>
                    <td>{c.contacts?.length ?? 0}</td>
                    <td>
                      <Link
                        href={`/companies/${c.id}`}
                        className="btn btn-secondary btn-sm"
                      >
                        詳細
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                &laquo;
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(
                  (p) =>
                    p === 1 ||
                    p === totalPages ||
                    Math.abs(p - page) <= 2,
                )
                .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1] as number) > 1) {
                    acc.push("...");
                  }
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, idx) =>
                  p === "..." ? (
                    <span key={`dots-${idx}`} style={{ padding: "0 4px" }}>
                      ...
                    </span>
                  ) : (
                    <button
                      key={p}
                      className={page === p ? "active" : ""}
                      onClick={() => setPage(p as number)}
                    >
                      {p}
                    </button>
                  ),
                )}
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                &raquo;
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
