"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { fetchApi, type Job } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import ProgressBar from "@/components/ProgressBar";

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const res = await fetchApi<Job[]>("/api/jobs");
    if (res.ok) setJobs(res.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* Auto-refresh while there are running/pending jobs */
  useEffect(() => {
    const hasActive = jobs.some(
      (j) => j.status === "running" || j.status === "pending",
    );

    if (hasActive && !intervalRef.current) {
      intervalRef.current = setInterval(load, 5000);
    } else if (!hasActive && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [jobs, load]);

  const sorted = [...jobs].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

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
        <h1>ジョブ管理</h1>
        <p>情報収集ジョブの一覧と進捗状況</p>
      </div>

      {sorted.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <h3>ジョブがありません</h3>
            <p>CSVインポートからジョブを作成してください</p>
            <div className="mt-4">
              <Link href="/import" className="btn btn-primary">
                CSVインポート
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>ステータス</th>
                  <th>合計</th>
                  <th>完了</th>
                  <th>失敗</th>
                  <th>進捗</th>
                  <th>作成日時</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((job) => (
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
                    <td>{job.failedCompanies}</td>
                    <td>
                      <ProgressBar
                        current={job.completedCompanies + job.failedCompanies}
                        total={job.totalCompanies}
                      />
                    </td>
                    <td className="text-muted">
                      {new Date(job.createdAt).toLocaleString("ja-JP")}
                    </td>
                    <td>
                      <Link
                        href={`/jobs/${job.id}`}
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
        </div>
      )}
    </>
  );
}
