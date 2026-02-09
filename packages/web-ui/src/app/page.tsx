"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { fetchApi, type Job, type Company } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";

export default function DashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [jobsRes, companiesRes] = await Promise.all([
        fetchApi<Job[]>("/api/jobs"),
        fetchApi<Company[]>("/api/companies"),
      ]);
      if (jobsRes.ok) setJobs(jobsRes.data);
      if (companiesRes.ok) setCompanies(companiesRes.data);
      setLoading(false);
    }
    load();
  }, []);

  const totalContacts = companies.reduce(
    (sum, c) => sum + (c.contacts?.length ?? 0),
    0,
  );

  const emailAcquisitionRate =
    totalContacts > 0
      ? Math.round(
          (companies.filter((c) => c.contacts?.some((ct) => ct.email)).length /
            companies.length) *
            100,
        )
      : 0;

  const activeJobs = jobs.filter(
    (j) => j.status === "running" || j.status === "pending",
  ).length;

  const recentJobs = [...jobs]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, 8);

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
        <h1>ダッシュボード</h1>
        <p>営業リード獲得システムの概要</p>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-label">企業数</div>
          <div className="stat-card-value">{companies.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">連絡先数</div>
          <div className="stat-card-value">{totalContacts}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">実行中ジョブ</div>
          <div className="stat-card-value">{activeJobs}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">メール取得率</div>
          <div className="stat-card-value">
            {emailAcquisitionRate}
            <span className="text-muted text-sm">%</span>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="section">
        <div className="btn-group">
          <Link href="/import" className="btn btn-primary">
            CSVインポート
          </Link>
          <Link href="/jobs" className="btn btn-secondary">
            ジョブ一覧
          </Link>
        </div>
      </div>

      {/* Recent jobs */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">最近のジョブ</span>
          <Link href="/jobs" className="btn btn-secondary btn-sm">
            すべて表示
          </Link>
        </div>

        {recentJobs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <h3>ジョブがありません</h3>
            <p>CSVインポートからジョブを作成してください</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>ステータス</th>
                  <th>企業数</th>
                  <th>完了</th>
                  <th>作成日時</th>
                </tr>
              </thead>
              <tbody>
                {recentJobs.map((job) => (
                  <tr key={job.id}>
                    <td>
                      <Link href={`/jobs/${job.id}`} className="text-mono">
                        {job.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td>
                      <StatusBadge status={job.status} size="sm" />
                    </td>
                    <td>{job.totalCompanies}</td>
                    <td>{job.completedCompanies}</td>
                    <td className="text-muted">
                      {new Date(job.createdAt).toLocaleString("ja-JP")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
