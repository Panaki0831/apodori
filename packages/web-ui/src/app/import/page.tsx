"use client";

import React, { useCallback, useRef, useState } from "react";
import { fetchApi } from "@/lib/api";

interface ParsedCompany {
  name: string;
  url?: string;
}

export default function ImportPage() {
  const [tab, setTab] = useState<"csv" | "manual">("csv");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [parsed, setParsed] = useState<ParsedCompany[]>([]);
  const [manualText, setManualText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* ── CSV parsing ── */
  const parseCSV = useCallback((text: string) => {
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    const header = lines[0].toLowerCase();
    const hasHeader =
      header.includes("name") ||
      header.includes("company") ||
      header.includes("企業") ||
      header.includes("会社");
    const dataLines = hasHeader ? lines.slice(1) : lines;

    const companies: ParsedCompany[] = dataLines.map((line) => {
      const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      return { name: cols[0], url: cols[1] || undefined };
    });
    setParsed(companies);
  }, []);

  const handleFile = useCallback(
    (f: File) => {
      setFile(f);
      setResult(null);
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        parseCSV(text);
      };
      reader.readAsText(f);
    },
    [parseCSV],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f && f.name.endsWith(".csv")) handleFile(f);
    },
    [handleFile],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  /* ── Manual entry → parsed list ── */
  const parseManual = useCallback(() => {
    const lines = manualText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const companies: ParsedCompany[] = lines.map((line) => {
      const parts = line.split(",").map((p) => p.trim());
      return { name: parts[0], url: parts[1] || undefined };
    });
    setParsed(companies);
  }, [manualText]);

  /* ── Submit ── */
  const handleSubmit = async () => {
    if (parsed.length === 0) return;
    setSubmitting(true);
    setResult(null);

    const res = await fetchApi<{ jobId: string }>("/api/jobs", {
      method: "POST",
      body: JSON.stringify({
        companies: parsed.map((c) => ({
          company_name: c.name,
          company_url: c.url,
        })),
      }),
    });

    setSubmitting(false);

    if (res.ok) {
      setResult({
        ok: true,
        message: `ジョブを作成しました (ID: ${res.data.jobId})。${parsed.length} 件の企業を処理します。`,
      });
      setParsed([]);
      setFile(null);
      setManualText("");
    } else {
      setResult({
        ok: false,
        message: `エラー: ${res.error ?? "不明なエラー"}`,
      });
    }
  };

  return (
    <>
      <div className="page-header">
        <h1>CSVインポート</h1>
        <p>企業リストをインポートして情報収集ジョブを開始します</p>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${tab === "csv" ? "active" : ""}`}
          onClick={() => {
            setTab("csv");
            setParsed([]);
          }}
        >
          CSVファイル
        </button>
        <button
          className={`tab ${tab === "manual" ? "active" : ""}`}
          onClick={() => {
            setTab("manual");
            setParsed([]);
            setFile(null);
          }}
        >
          手動入力
        </button>
      </div>

      {/* Result banner */}
      {result && (
        <div className={`alert ${result.ok ? "alert-success" : "alert-error"}`}>
          {result.message}
        </div>
      )}

      {/* CSV Upload */}
      {tab === "csv" && (
        <div className="section">
          <div
            className={`file-upload-area ${dragOver ? "drag-over" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
          >
            <div className="upload-icon">📄</div>
            <p>
              CSVファイルをドラッグ&ドロップ、またはクリックして選択
            </p>
            <p className="text-sm text-muted">
              形式: 企業名, URL（1行に1社）
            </p>
            {file && <div className="file-name">{file.name}</div>}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={handleInputChange}
          />
        </div>
      )}

      {/* Manual entry */}
      {tab === "manual" && (
        <div className="section">
          <div className="form-group">
            <label className="form-label">
              企業リスト（1行に1社、カンマ区切りでURLも指定可）
            </label>
            <textarea
              className="form-textarea"
              rows={8}
              placeholder={"株式会社テスト, https://test.co.jp\n合同会社サンプル"}
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
            />
          </div>
          <button className="btn btn-secondary" onClick={parseManual}>
            プレビュー
          </button>
        </div>
      )}

      {/* Preview table */}
      {parsed.length > 0 && (
        <div className="card section">
          <div className="card-header">
            <span className="card-title">
              プレビュー（{parsed.length} 件）
            </span>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>企業名</th>
                  <th>URL</th>
                </tr>
              </thead>
              <tbody>
                {parsed.map((c, i) => (
                  <tr key={i}>
                    <td className="text-muted">{i + 1}</td>
                    <td>{c.name}</td>
                    <td className="text-muted">{c.url || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4">
            <button
              className="btn btn-primary"
              disabled={submitting}
              onClick={handleSubmit}
            >
              {submitting ? (
                <>
                  <span className="spinner" />
                  送信中...
                </>
              ) : (
                "インポート実行"
              )}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
