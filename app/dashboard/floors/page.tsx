"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  API_URL,
  ApiAuthError,
  apiFetch,
  clearSession,
  getToken,
} from "@/lib/api";
import { formatMoneyInput, formatUzs, parseMoneyInput } from "@/lib/currency";
import {
  Plus,
  Layers,
  Maximize2,
  DollarSign,
  Image as ImageIcon,
  FileText,
  ExternalLink,
  Loader2,
  Edit2,
  Trash2,
  Building2,
} from "lucide-react";
import { useTranslations } from "next-intl";

type ProjectOption = { id: number; name: string; developerId: number };

type ProjectFloorAreaOption = {
  id?: number;
  areaSqm: number;
  sortOrder?: number;
};
type ProjectFloorLayout = {
  id?: number;
  imageUrl: string;
  title?: string | null;
  sortOrder?: number;
};

const isPdfUrl = (url: string) => {
  try {
    return new URL(url).pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return url.toLowerCase().endsWith(".pdf");
  }
};

type ProjectFloor = {
  id: number;
  projectId: number;
  floor: number;
  pricePerM2: number;
  title?: string | null;
  areaOptions: ProjectFloorAreaOption[];
  layouts: ProjectFloorLayout[];
  project?: { id: number; name: string };
};

type LayoutLine = {
  imageUrl: string;
  title: string;
  fileName?: string;
};

type FloorForm = {
  projectId: number;
  floor: string;
  pricePerM2: string;
  title: string;
  areaLines: string[];
  layoutLines: LayoutLine[];
};

const adminHeaders = (contentType = true) => ({
  ...(contentType ? { "Content-Type": "application/json" } : {}),
  ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
});

const emptyForm = (projectId: number): FloorForm => ({
  projectId,
  floor: "1",
  pricePerM2: "",
  title: "",
  areaLines: [""],
  layoutLines: [{ imageUrl: "", title: "", fileName: "" }],
});

export default function FloorsPage() {
  const t = useTranslations("Dashboard.floors");
  const tc = useTranslations("Common");
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [floors, setFloors] = useState<ProjectFloor[]>([]);
  const [form, setForm] = useState<FloorForm>(emptyForm(0));
  const [uploadingLayoutIdx, setUploadingLayoutIdx] = useState<number | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  const floorsForList = useMemo(() => {
    if (!form.projectId) return [];
    return floors.filter((f) => f.projectId === form.projectId);
  }, [floors, form.projectId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [currentDeveloper, allProjects, allFloors] = await Promise.all([
        apiFetch<{ id: number; name: string }>("/developers"),
        apiFetch<ProjectOption[]>("/projects"),
        apiFetch<ProjectFloor[]>("/floors"),
      ]);

      const ownProjects = allProjects.filter(
        (project) => project.developerId === currentDeveloper.id,
      );
      const ownProjectIds = new Set(ownProjects.map((item) => item.id));
      const ownFloors = allFloors
        .filter((item) => ownProjectIds.has(item.projectId))
        .map((f) => ({
          ...f,
          areaOptions: f.areaOptions ?? [],
          layouts: f.layouts ?? [],
        }));

      setProjects(ownProjects);
      setFloors(ownFloors);
      setForm((current) =>
        emptyForm(current.projectId || ownProjects[0]?.id || 0),
      );
    } catch (err) {
      if (err instanceof ApiAuthError) {
        clearSession();
      }
      setError(err instanceof Error ? err.message : "Error loading data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const uploadLayoutFile = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`${API_URL}/upload/image`, {
      method: "POST",
      headers: adminHeaders(false),
      body: formData,
    });
    if (!response.ok) {
      throw new Error(`Ошибка загрузки файла (${response.status})`);
    }
    const data = (await response.json()) as { url: string };
    return data.url;
  };

  const applyLayoutFile = (file: File, url: string, index: number) => {
    setForm((current) => {
      const layoutLines = [...current.layoutLines];
      layoutLines[index] = {
        ...layoutLines[index],
        imageUrl: url,
        fileName: file.name,
      };
      return { ...current, layoutLines };
    });
  };

  const onLayoutPick = async (
    event: React.ChangeEvent<HTMLInputElement>,
    index: number,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setUploadingLayoutIdx(index);
      setError(null);
      const url = await uploadLayoutFile(file);
      applyLayoutFile(file, url, index);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setUploadingLayoutIdx(null);
      event.target.value = "";
    }
  };

  const onLayoutDrop = async (
    event: React.DragEvent<HTMLDivElement>,
    index: number,
  ) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "application/pdf",
    ];
    if (!allowed.includes(file.type)) {
      setError("Поддерживаются только изображения (JPG, PNG, WEBP) и PDF");
      return;
    }
    try {
      setUploadingLayoutIdx(index);
      setError(null);
      const url = await uploadLayoutFile(file);
      applyLayoutFile(file, url, index);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setUploadingLayoutIdx(null);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setSaving(true);
      setError(null);

      const areaOptions = form.areaLines
        .map((s) => Number(String(s).replace(",", ".")))
        .filter((n) => n > 0)
        .map((areaSqm, i) => ({ areaSqm, sortOrder: i }));

      if (!areaOptions.length) {
        setError(t("form.needOneArea"));
        setSaving(false);
        return;
      }

      const layouts = form.layoutLines
        .filter((l) => l.imageUrl.trim())
        .map((l, i) => ({
          imageUrl: l.imageUrl.trim(),
          title: l.title.trim() || undefined,
          sortOrder: i,
        }));

      const body: Record<string, unknown> = {
        projectId: form.projectId,
        floor: Number(form.floor),
        pricePerM2: parseMoneyInput(form.pricePerM2),
        title: form.title.trim() || undefined,
        areaOptions,
      };
      if (editingId) {
        body.layouts = layouts;
      } else if (layouts.length) {
        body.layouts = layouts;
      }

      const response = await fetch(
        editingId ? `${API_URL}/floors/${editingId}` : `${API_URL}/floors`,
        {
          method: editingId ? "PATCH" : "POST",
          headers: adminHeaders(),
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || `Failed to save floor (${response.status})`);
      }

      await loadData();
      setForm(emptyForm(form.projectId || projects[0]?.id || 0));
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: number) => {
    if (!confirm(t("confirmDelete"))) return;
    try {
      setError(null);
      const response = await fetch(`${API_URL}/floors/${id}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
      if (!response.ok) {
        throw new Error(`Failed to delete (${response.status})`);
      }
      await loadData();
      if (editingId === id) {
        setEditingId(null);
        setForm(emptyForm(projects[0]?.id || 0));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const areasLabel = (fl: ProjectFloor) => {
    const a = (fl.areaOptions ?? []).map((o) => o.areaSqm).filter((n) => n > 0);
    if (!a.length) return "—";
    return `${a.map((n) => (Number.isInteger(n) ? String(n) : n.toFixed(1))).join(", ")} м²`;
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#1E3A8A] border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-black tracking-tight text-[#1E3A8A]">
          {t("title")}
        </h1>
        <p className="font-medium text-slate-500">{t("subtitle")}</p>
      </div>

      <div className="grid gap-10 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <form
            onSubmit={onSubmit}
            className="sticky top-8 space-y-6 rounded-[2.5rem] border border-slate-100 bg-white p-8 shadow-sm"
          >
            <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-slate-900">
              {editingId ? (
                <Edit2 className="h-5 w-5 text-orange-500" />
              ) : (
                <Plus className="h-5 w-5 text-blue-600" />
              )}
              {editingId ? t("edit") : t("add")}
            </h2>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="ml-4 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {t("form.selectProject")}
                </label>
                <div className="relative">
                  <Building2 className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <select
                    value={form.projectId}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        projectId: Number(e.target.value),
                      }))
                    }
                    className="h-14 w-full appearance-none rounded-2xl border border-slate-100 bg-slate-50 pl-11 pr-4 text-sm font-bold text-black outline-none transition-all ring-blue-600/10 focus:border-blue-600 focus:bg-white focus:ring-4"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="ml-4 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {t("form.floor")}
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={form.floor}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, floor: e.target.value }))
                    }
                    className="h-14 w-full rounded-2xl border border-slate-100 bg-slate-50 px-6 text-sm font-bold text-black outline-none transition-all focus:border-blue-600 focus:bg-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="ml-4 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {t("form.pricePerM2")}
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={form.pricePerM2}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          pricePerM2: formatMoneyInput(e.target.value),
                        }))
                      }
                      placeholder="15 000 000"
                      className="h-14 w-full rounded-2xl border border-slate-100 bg-slate-50 pl-11 pr-4 text-sm font-bold text-black outline-none transition-all focus:border-blue-600 focus:bg-white"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="ml-4 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {t("form.areas")}
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        areaLines: [...f.areaLines, ""],
                      }))
                    }
                    className="text-[10px] font-black uppercase text-blue-600"
                  >
                    {t("form.addArea")}
                  </button>
                </div>
                {form.areaLines.map((line, i) => (
                  <div key={i} className="flex gap-2">
                    <div className="relative flex-1">
                      <Maximize2 className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        inputMode="decimal"
                        value={line}
                        onChange={(e) =>
                          setForm((f) => {
                            const areaLines = [...f.areaLines];
                            areaLines[i] = e.target.value;
                            return { ...f, areaLines };
                          })
                        }
                        placeholder="72"
                        className="h-12 w-full rounded-2xl border border-slate-100 bg-slate-50 pl-11 pr-4 text-sm font-bold text-black outline-none transition-all focus:border-blue-600 focus:bg-white"
                      />
                    </div>
                    {form.areaLines.length > 1 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            areaLines: f.areaLines.filter((_, j) => j !== i),
                          }))
                        }
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 hover:bg-slate-200"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="space-y-1.5">
                <label className="ml-4 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {t("form.titleOptional")}
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, title: e.target.value }))
                  }
                  className="h-14 w-full rounded-2xl border border-slate-100 bg-slate-50 px-6 text-sm font-bold text-black outline-none transition-all focus:border-blue-600 focus:bg-white"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="ml-4 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {t("form.layouts")}
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        layoutLines: [
                          ...f.layoutLines,
                          { imageUrl: "", title: "" },
                        ],
                      }))
                    }
                    className="text-[10px] font-black uppercase text-blue-600"
                  >
                    {t("form.addLayout")}
                  </button>
                </div>
                {form.layoutLines.map((line, i) => (
                  <div
                    key={i}
                    className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4"
                  >
                    <div
                      className="group relative mb-3 cursor-pointer"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => void onLayoutDrop(e, i)}
                    >
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                        onChange={(e) => void onLayoutPick(e, i)}
                        className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                      />
                      <div className="flex h-28 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-white transition-all group-hover:border-blue-300 group-hover:bg-blue-50/30">
                        {uploadingLayoutIdx === i ? (
                          <>
                            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                            <span className="text-xs font-bold text-blue-400">
                              Загрузка…
                            </span>
                          </>
                        ) : line.imageUrl && isPdfUrl(line.imageUrl) ? (
                          <div className="flex w-full flex-col items-center justify-center gap-1.5 px-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100">
                              <FileText className="h-5 w-5 text-red-600" />
                            </div>
                            <span className="line-clamp-1 max-w-full text-center text-[11px] font-bold text-slate-600">
                              {line.fileName ?? "PDF файл"}
                            </span>
                            <span className="text-[10px] font-black uppercase tracking-wider text-red-500">
                              PDF
                            </span>
                          </div>
                        ) : line.imageUrl ? (
                          <img
                            src={line.imageUrl}
                            className="h-full max-h-24 w-full rounded-lg object-contain p-1"
                            alt=""
                          />
                        ) : (
                          <>
                            <div className="flex gap-2">
                              <ImageIcon className="h-5 w-5 text-slate-300" />
                              <FileText className="h-5 w-5 text-slate-300" />
                            </div>
                            <span className="text-xs font-bold text-slate-400">
                              {t("form.uploadLayout")}
                            </span>
                            <span className="text-[10px] text-slate-300">
                              JPG · PNG · WEBP · PDF
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    {line.imageUrl && isPdfUrl(line.imageUrl) && (
                      <a
                        href={line.imageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-blue-600 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Открыть PDF
                      </a>
                    )}
                    <input
                      type="text"
                      value={line.title}
                      onChange={(e) =>
                        setForm((f) => {
                          const layoutLines = [...f.layoutLines];
                          layoutLines[i] = {
                            ...layoutLines[i],
                            title: e.target.value,
                          };
                          return { ...f, layoutLines };
                        })
                      }
                      placeholder={t("form.layoutTitlePlaceholder")}
                      className="h-11 w-full rounded-xl border border-slate-100 bg-white px-4 text-xs font-bold text-black outline-none"
                    />
                    {form.layoutLines.length > 1 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            layoutLines: f.layoutLines.filter(
                              (_, j) => j !== i,
                            ),
                          }))
                        }
                        className="mt-2 text-[10px] font-black uppercase text-red-500"
                      >
                        {t("form.removeLayout")}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            {error && (
              <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs font-bold text-red-600">
                {error}
              </p>
            )}

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={saving || uploadingLayoutIdx != null}
                className="h-16 flex-1 rounded-2xl bg-[#F97316] font-black uppercase tracking-widest text-white shadow-xl shadow-orange-900/10 transition-all hover:bg-orange-600 disabled:bg-slate-100 disabled:text-slate-400"
              >
                {saving
                  ? t("form.saving")
                  : editingId
                    ? t("form.save")
                    : t("form.addNew")}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setForm(emptyForm(projects[0]?.id || 0));
                  }}
                  className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 transition-all hover:bg-slate-200"
                >
                  <Trash2 className="h-6 w-6" />
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="space-y-6 lg:col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900">{t("list")}</h2>
            <span className="rounded-full bg-slate-50 px-3 py-1 text-[10px] font-black uppercase text-slate-400">
              {t("total")}: {floorsForList.length}
            </span>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            {floorsForList.map((fl) => (
              <div
                key={fl.id}
                className="group relative overflow-hidden rounded-3xl border border-slate-100 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl"
              >
                <div className="absolute right-4 top-4 rounded-lg bg-slate-900/5 px-2 py-1 backdrop-blur">
                  <span className="text-[10px] font-bold text-slate-600">
                    {t("floorBadge", { n: fl.floor })}
                  </span>
                </div>
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
                    {fl.layouts?.[0]?.imageUrl ? (
                      isPdfUrl(fl.layouts[0].imageUrl) ? (
                        <div className="flex flex-col items-center justify-center gap-1">
                          <FileText className="h-7 w-7 text-red-400" />
                          <span className="text-[9px] font-black uppercase tracking-wider text-red-400">
                            PDF
                          </span>
                        </div>
                      ) : (
                        <img
                          src={fl.layouts[0].imageUrl}
                          className="h-full w-full object-cover"
                          alt=""
                        />
                      )
                    ) : (
                      <Layers className="h-8 w-8 text-slate-200" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-bold text-slate-900">
                      {fl.project?.name}
                    </h3>
                    <p className="mt-1 text-xs font-black uppercase tracking-tight text-blue-600">
                      {fl.pricePerM2 > 0
                        ? `${formatUzs(Math.round(fl.pricePerM2))} / м²`
                        : tc("negotiablePrice")}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      {t("table.areas")}: {areasLabel(fl)}
                    </p>
                    {fl.layouts && fl.layouts.length > 1 ? (
                      <p className="mt-1 text-[10px] font-bold text-slate-400">
                        {t("table.layoutCount", { count: fl.layouts.length })}
                      </p>
                    ) : null}
                    {fl.title && (
                      <p className="mt-1 text-xs text-slate-500">{fl.title}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-end justify-end border-t border-slate-50 pt-4">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onDelete(fl.id)}
                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-500 transition-all hover:bg-red-100"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(fl.id);
                        setForm({
                          projectId: fl.projectId,
                          floor: String(fl.floor),
                          pricePerM2: formatMoneyInput(
                            String(Math.round(fl.pricePerM2)),
                          ),
                          title: fl.title ?? "",
                          areaLines:
                            fl.areaOptions?.length &&
                            fl.areaOptions.some((o) => o.areaSqm > 0)
                              ? fl.areaOptions.map((o) => String(o.areaSqm))
                              : [""],
                          layoutLines:
                            fl.layouts?.length > 0
                              ? fl.layouts.map((l) => ({
                                  imageUrl: l.imageUrl,
                                  title: l.title ?? "",
                                  fileName: isPdfUrl(l.imageUrl)
                                    ? (l.imageUrl.split("/").pop() ??
                                      "PDF файл")
                                    : "",
                                }))
                              : [{ imageUrl: "", title: "", fileName: "" }],
                        });
                      }}
                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-400 shadow-sm transition-all hover:bg-[#1E3A8A] hover:text-white"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {floorsForList.length === 0 && (
              <div className="col-span-full space-y-4 rounded-[3rem] border-2 border-dashed border-slate-100 py-20 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-50">
                  <Building2 className="h-8 w-8 text-slate-200" />
                </div>
                <p className="font-medium text-slate-400">{t("empty")}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
