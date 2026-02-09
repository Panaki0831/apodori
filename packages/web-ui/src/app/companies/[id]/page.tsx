"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { fetchApi, type Company, type Contact } from "@/lib/api";

function confidenceClass(val: number): string {
  if (val >= 0.7) return "high";
  if (val >= 0.4) return "medium";
  return "low";
}

function exportContactsCSV(company: Company) {
  const header = "Name,Email,Confidence,Title,Department,Source";
  const rows = company.contacts.map(
    (c) =>
      `"${c.name}","${c.email}",${c.confidence},"${c.title ?? ""}","${c.department ?? ""}","${c.source ?? ""}"`,
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${company.name}_contacts.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CompanyDetailPage() {
  const params = useParams<{ id: string }>();
  const companyId = params.id;

  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetchApi<Company>(`/api/companies/${companyId}`);
      if (res.ok) {
        setCompany(res.data);
      } else {
        setError(res.error ?? "企業情報の取得に失敗しました");
      }
      setLoading(false);
    }
    load();
  }, [companyId]);

  if (loading) {
    return (
      <div className="loading">
        <span className="spinner" />
        読み込み中...
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="alert alert-error">
        {error ?? "企業が見つかりません"}
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <h1>{company.name}</h1>
        <p>
          <Link href="/companies">企業一覧</Link> &gt; {company.name}
        </p>
      </div>

      {/* Company info */}
      <div className="card section">
        <div className="card-header">
          <span className="card-title">企業情報</span>
        </div>
        <div className="detail-grid">
          <div>
            <div className="detail-item-label">企業名</div>
            <div className="detail-item-value">{company.name}</div>
          </div>
          <div>
            <div className="detail-item-label">URL</div>
            <div className="detail-item-value">
              {company.url ? (
                <a
                  href={company.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {company.url}
                </a>
              ) : (
                "-"
              )}
            </div>
          </div>
          <div>
            <div className="detail-item-label">住所</div>
            <div className="detail-item-value">{company.address ?? "-"}</div>
          </div>
          <div>
            <div className="detail-item-label">電話番号</div>
            <div className="detail-item-value">{company.phone ?? "-"}</div>
          </div>
          <div>
            <div className="detail-item-label">業種</div>
            <div className="detail-item-value">{company.industry ?? "-"}</div>
          </div>
          <div>
            <div className="detail-item-label">従業員数</div>
            <div className="detail-item-value">
              {company.employeeCount?.toLocaleString() ?? "-"}
            </div>
          </div>
        </div>

        {company.description && (
          <div className="mt-4">
            <div className="detail-item-label">事業内容</div>
            <div className="detail-item-value">{company.description}</div>
          </div>
        )}
      </div>

      {/* Contacts */}
      <div className="card section">
        <div className="card-header">
          <span className="card-title">
            連絡先（{company.contacts.length} 件）
          </span>
          {company.contacts.length > 0 && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => exportContactsCSV(company)}
            >
              CSVエクスポート
            </button>
          )}
        </div>

        {company.contacts.length === 0 ? (
          <p className="text-muted">連絡先がまだ収集されていません</p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>氏名</th>
                  <th>メール</th>
                  <th>信頼度</th>
                  <th>役職</th>
                  <th>部署</th>
                  <th>ソース</th>
                </tr>
              </thead>
              <tbody>
                {company.contacts.map((ct: Contact) => (
                  <tr key={ct.id}>
                    <td>
                      <strong>{ct.name}</strong>
                    </td>
                    <td className="text-mono">{ct.email}</td>
                    <td>
                      <div className="confidence-bar">
                        <div className="confidence-track">
                          <div
                            className={`confidence-fill ${confidenceClass(ct.confidence)}`}
                            style={{
                              width: `${Math.round(ct.confidence * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="confidence-value">
                          {Math.round(ct.confidence * 100)}%
                        </span>
                      </div>
                    </td>
                    <td>{ct.title ?? "-"}</td>
                    <td>{ct.department ?? "-"}</td>
                    <td className="text-sm text-muted">
                      {ct.source ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* News */}
      {company.news && company.news.length > 0 && (
        <div className="card section">
          <div className="card-header">
            <span className="card-title">最近のニュース</span>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>タイトル</th>
                  <th>日付</th>
                  <th>概要</th>
                </tr>
              </thead>
              <tbody>
                {company.news.map((n, i) => (
                  <tr key={i}>
                    <td>
                      <a
                        href={n.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {n.title}
                      </a>
                    </td>
                    <td className="text-muted">
                      {new Date(n.date).toLocaleDateString("ja-JP")}
                    </td>
                    <td className="text-sm">{n.summary ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Competitors */}
      {company.competitors && company.competitors.length > 0 && (
        <div className="card section">
          <div className="card-header">
            <span className="card-title">競合企業</span>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>企業名</th>
                  <th>URL</th>
                  <th>説明</th>
                </tr>
              </thead>
              <tbody>
                {company.competitors.map((comp, i) => (
                  <tr key={i}>
                    <td>
                      <strong>{comp.name}</strong>
                    </td>
                    <td>
                      {comp.url ? (
                        <a
                          href={comp.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm"
                        >
                          {comp.url}
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="text-sm">{comp.description ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
