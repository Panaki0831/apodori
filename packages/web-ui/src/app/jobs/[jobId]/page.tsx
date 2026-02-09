"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { fetchApi, type Job } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import ProgressBar from "@/components/ProgressBar";

const TASK_LABELS = [
  "企業URL特定",
  "企業情報取得",
  "事業内容分析",
  "ニュース取得",
  "競合分析",
  "組織構造分析",
  "キーパーソン特定",
  "メールパターン推定",
  "メール検証",
  "連絡先スコアリング",
  "レポート生成",
];

interface CompanyTask {
  id: string;
  name: string;
  url?: string;
  tasksCompleted: number;
  tasksFailed: number;
  tasksTotal: number;
  tasks?: { name: string; status: "done" | "fail" | "pending" }[];
}

interface JobDetail extends Job {
  companies?: CompanyTask[];
}

export default function JobDetailPage() {
  const params = useParams<{ jobId: string }>();
  const jobId = params.jobId;

  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const res = await fetchApi<JobDetail>(`/api/jobs/${jobId}`);
    if (res.ok) {
      setJob(res.data);
    } else {
      setError(res.error ?? "ジョブの取得に失敗しました");
    }
    setLoading(false);
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  /* Auto-refresh for running jobs */
  useEffect(() => {
    if (job && (job.status === "running" || job.status === "pending")) {
      intervalRef.current = setInterval(load, 5000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [job, load]);

  if (loading) {
    return (
      <div className="loading">
        <span className="spinner" />
        読み込み中...
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="alert alert-error">{error ?? "ジョブが見つかりません"}</div>
    );
  }

  const elapsed = job.updatedAt
    ? Math.round(
        (new Date(job.updatedAt).getTime() -
          new Date(job.createdAt).getTime()) /
          1000,
      )
    : 0;

  return (
    <>
      <div className="page-header">
        <h1>
          ジョブ詳細{" "}
          <span className="text-mono text-muted">{job.id.slice(0, 8)}</span>
        </h1>
        <p>
          <Link href="/jobs">ジョブ管理</Link> &gt; {job.id.slice(0, 8)}
        </p>
      </div>

      {/* Summary cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-label">ステータス</div>
          <div className="mt-2">
            <StatusBadge status={job.status} />
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">進捗</div>
          <div className="mt-2">
            <ProgressBar
              current={job.completedCompanies + job.failedCompanies}
              total={job.totalCompanies}
            />
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">企業数</div>
          <div className="stat-card-value">{job.totalCompanies}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">経過時間</div>
          <div className="stat-card-value">
            {elapsed}
            <span className="text-muted text-sm">秒</span>
          </div>
        </div>
      </div>

      {/* Company breakdown */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">企業別タスク進捗</span>
        </div>

        {!job.companies || job.companies.length === 0 ? (
          <p className="text-muted">企業データがありません</p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>企業名</th>
                  <th>進捗</th>
                  <th>タスク状況</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {job.companies.map((comp) => {
                  const tasks =
                    comp.tasks ??
                    TASK_LABELS.map((name, i) => ({
                      name,
                      status:
                        i < comp.tasksCompleted
                          ? ("done" as const)
                          : i < comp.tasksCompleted + comp.tasksFailed
                            ? ("fail" as const)
                            : ("pending" as const),
                    }));

                  return (
                    <tr key={comp.id}>
                      <td>
                        <strong>{comp.name}</strong>
                        {comp.url && (
                          <div className="text-sm text-muted">{comp.url}</div>
                        )}
                      </td>
                      <td>
                        <ProgressBar
                          current={comp.tasksCompleted}
                          total={comp.tasksTotal || TASK_LABELS.length}
                        />
                      </td>
                      <td>
                        <div className="task-list">
                          {tasks.map((t, i) => (
                            <span
                              key={i}
                              className={`task-chip ${t.status}`}
                              title={t.name}
                            >
                              {t.name}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <Link
                          href={`/companies/${comp.id}`}
                          className="btn btn-secondary btn-sm"
                        >
                          企業詳細
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
