"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { API_URL, apiFetch, getToken } from "@/lib/api";
import { useTranslations } from "next-intl";
import { CheckCircle2, ChevronDown, ChevronUp, Plus, Save, Trash2 } from "lucide-react";

type Project = { id: number; name: string; developerId: number };
type Developer = { id: number };

type Milestone = {
  id?: number;
  title: string;
  done: boolean;
  sortOrder: number;
  photoUrls?: string[];
};

/** Только то, что принимает PATCH /projects/:id/progress (без id — иначе 400 на старом API). */
type MilestoneSaveBody = Pick<Milestone, "title" | "done" | "sortOrder" | "photoUrls">;

type ProgressPayload = {
  percent: number | null;
  total: number;
  done: number;
  milestones: Milestone[];
};

const emptyRow = (sortOrder: number): Milestone => ({
  title: "",
  done: false,
  sortOrder,
  photoUrls: [],
});

export default function ProgressPage() {
  const t = useTranslations("Dashboard.progress");
  const tCommon = useTranslations("Dashboard.common");
  const searchParams = useSearchParams();
  const queryProjectId = searchParams.get("projectId");

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [rows, setRows] = useState<Milestone[]>([emptyRow(0)]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const normalize = (r: Milestone[]): MilestoneSaveBody[] =>
    r
      .slice()
      .map((x) => ({ ...x, title: x.title.trim() }))
      .filter((x) => Boolean(x.title))
      .map((x, idx) => ({
        title: x.title,
        done: x.done,
        sortOrder: idx,
        photoUrls: (x.photoUrls ?? [])
          .map((u) => String(u).trim())
          .filter(Boolean)
          .slice(0, 12),
      }));

  const uploadPhoto = async (idx: number, file: File) => {
    const token = getToken();
    if (!token) throw new Error("Unauthorized");
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_URL}/upload/image`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!res.ok) throw new Error(`Upload failed (${res.status})`);
    const data = (await res.json()) as { url?: string };
    if (!data?.url) throw new Error("Upload failed (no url)");
    setRows((prev) =>
      prev.map((m, i) =>
        i === idx
          ? { ...m, photoUrls: [...(m.photoUrls ?? []), data.url!].slice(0, 12) }
          : m,
      ),
    );
  };

  const removePhoto = (idx: number, url: string) => {
    setRows((prev) =>
      prev.map((m, i) =>
        i === idx ? { ...m, photoUrls: (m.photoUrls ?? []).filter((u) => u !== url) } : m,
      ),
    );
  };

  const percent = useMemo(() => {
    const total = rows.filter((r) => r.title.trim()).length;
    const done = rows.filter((r) => r.title.trim() && r.done).length;
    return total ? Math.floor((done / total) * 100) : null;
  }, [rows]);

  const loadProjectList = async () => {
    setLoading(true);
    setError(null);
    try {
      const [dev, all] = await Promise.all([
        apiFetch<Developer>("/developers"),
        apiFetch<Project[]>("/projects/mine"),
      ]);
      const own = all.filter((p) => p.developerId === dev.id);
      setProjects(own);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load error");
    } finally {
      setLoading(false);
    }
  };

  const loadProgress = async (pid: number) => {
    setError(null);
    try {
      const data = await apiFetch<ProgressPayload>(`/projects/${pid}/progress`);
      const sorted = (data.milestones ?? []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      setRows(sorted.length ? sorted.map((r, idx) => ({ ...r, sortOrder: idx })) : [emptyRow(0)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load error");
    }
  };

  useEffect(() => {
    void loadProjectList();
  }, []);

  useEffect(() => {
    if (!projects.length) return;
    const parsed = queryProjectId ? Number(queryProjectId) : NaN;
    const fromUrl = Number.isFinite(parsed) && projects.some((p) => p.id === parsed) ? parsed : null;
    setProjectId((cur) => {
      if (fromUrl != null) return fromUrl;
      if (cur != null) return cur;
      return projects[0]?.id ?? null;
    });
  }, [projects, queryProjectId]);

  useEffect(() => {
    if (!projectId) return;
    void loadProgress(projectId);
  }, [projectId]);

  const move = (idx: number, dir: -1 | 1) => {
    setRows((prev) => {
      const next = prev.slice();
      const to = idx + dir;
      if (to < 0 || to >= next.length) return prev;
      const tmp = next[idx];
      next[idx] = next[to];
      next[to] = tmp;
      return next.map((r, i) => ({ ...r, sortOrder: i }));
    });
  };

  const addRow = () => setRows((prev) => [...prev, emptyRow(prev.length)]);
  const removeRow = (idx: number) =>
    setRows((prev) => {
      const next = prev.slice();
      next.splice(idx, 1);
      return (next.length ? next : [emptyRow(0)]).map((r, i) => ({ ...r, sortOrder: i }));
    });

  const save = async () => {
    if (!projectId) return;
    const milestones = normalize(rows);
    if (!milestones.length) {
      setNotice(t("needOne"));
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/projects/${projectId}/progress`, {
        method: "PATCH",
        body: JSON.stringify({ milestones }),
      });
      setNotice(t("saved"));
      await loadProgress(projectId);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 md:p-10">
      <div className="mb-6 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-[#1E3A8A] tracking-tight">
            {t("title")}
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1">{t("subtitle")}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t("percentLabel")}</div>
          <div className="text-xl font-black text-slate-900">{percent != null ? `${percent}%` : "—"}</div>
        </div>
      </div>

      <div className="rounded-[2.5rem] border border-slate-100 bg-white p-6 md:p-10 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t("projectLabel")}</div>
            <div className="mt-2 relative">
              <select
                className="w-full md:w-[420px] appearance-none rounded-2xl border border-slate-200 bg-white px-5 py-4 pr-12 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-slate-200/60"
                value={projectId ?? ""}
                onChange={(e) => setProjectId(Number(e.target.value))}
                disabled={loading || projects.length === 0}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={addRow}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-black text-slate-700 hover:bg-slate-50 transition"
              type="button"
            >
              <Plus className="h-5 w-5" />
              {t("addPoint")}
            </button>
            <button
              onClick={() => void save()}
              className="inline-flex items-center gap-2 rounded-2xl bg-[#F97316] px-6 py-4 text-sm font-black text-white shadow-lg shadow-orange-500/20 hover:bg-[#fb7a24] transition disabled:opacity-60"
              type="button"
              disabled={saving || loading || !projectId}
            >
              <Save className="h-5 w-5" />
              {saving ? t("saving") : t("save")}
            </button>
          </div>
        </div>

        <div className="sr-only">{tCommon("title")}</div>

        {loading ? (
          <div className="mt-10 text-sm font-bold text-slate-500">{t("loading")}</div>
        ) : error ? (
          <div className="mt-10 text-sm font-bold text-red-600">{error}</div>
        ) : null}

        {notice ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-bold text-slate-700">
            {notice}
          </div>
        ) : null}

        <div className="mt-8 space-y-3">
          {rows.map((r, idx) => (
            <div
              key={idx}
              className="flex flex-col md:flex-row md:items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-4"
            >
              <button
                type="button"
                onClick={() => setRows((prev) => prev.map((x, i) => (i === idx ? { ...x, done: !x.done } : x)))}
                className="inline-flex items-center gap-2"
              >
                {r.done ? (
                  <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                ) : (
                  <div className="h-6 w-6 rounded-full border-2 border-slate-300" />
                )}
                <span className="text-xs font-black uppercase tracking-widest text-slate-400">
                  {idx + 1}
                </span>
              </button>

              <input
                value={r.title}
                onChange={(e) => setRows((prev) => prev.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x)))}
                placeholder={t("placeholder")}
                className="w-full flex-1 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-slate-200/60"
              />

              <div className="flex flex-wrap items-center gap-2">
                {(r.photoUrls ?? []).slice(0, 8).map((url) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => removePhoto(idx, url)}
                    className="relative h-12 w-16 overflow-hidden rounded-xl border border-slate-200 bg-white"
                    title={t("removePhoto")}
                    aria-label={t("removePhoto")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition" />
                  </button>
                ))}
                <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 transition">
                  {t("addPhoto")}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      e.target.value = "";
                      try {
                        await uploadPhoto(idx, f);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : t("saveError"));
                      }
                    }}
                  />
                </label>
              </div>

              <div className="flex items-center gap-1 justify-end">
                <button
                  type="button"
                  onClick={() => move(idx, -1)}
                  className="rounded-xl p-2 hover:bg-white transition"
                  aria-label="Move up"
                >
                  <ChevronUp className="h-5 w-5 text-slate-500" />
                </button>
                <button
                  type="button"
                  onClick={() => move(idx, 1)}
                  className="rounded-xl p-2 hover:bg-white transition"
                  aria-label="Move down"
                >
                  <ChevronDown className="h-5 w-5 text-slate-500" />
                </button>
                <button
                  type="button"
                  onClick={() => removeRow(idx)}
                  className="rounded-xl p-2 hover:bg-white transition"
                  aria-label="Remove"
                >
                  <Trash2 className="h-5 w-5 text-red-500" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 flex justify-end">
          <button
            onClick={() => void save()}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#1E3A8A] px-6 py-4 text-sm font-black text-white shadow-lg shadow-blue-900/20 hover:bg-[#223ea2] transition disabled:opacity-60"
            type="button"
            disabled={saving || loading || !projectId}
          >
            <Save className="h-5 w-5" />
            {saving ? t("saving") : t("save")}
          </button>
        </div>
      </div>
    </div>
  );
}

