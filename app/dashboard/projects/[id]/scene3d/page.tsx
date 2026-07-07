"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Upload,
  Loader2,
  Box,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Wand2,
  Rocket,
  ExternalLink,
} from "lucide-react";
import {
  scenes3dApi,
  Scene3DInfo,
  Scene3DMapping,
  Asset3DKind,
} from "@/lib/crm-api";
import { apiFetch } from "@/lib/api";
import { hasUltimateWorkspaceAccess } from "@/lib/subscription-access";

// Public marketplace site (NOT the dashboard) — the 3D viewer lives there.
const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://oson-uy.uz"
).replace(/\/$/, "");

const STATUS_STYLE: Record<string, string> = {
  UPLOADED: "bg-slate-100 text-slate-600",
  PROCESSING: "bg-amber-100 text-amber-700",
  READY: "bg-emerald-100 text-emerald-700",
  FAILED: "bg-red-100 text-red-700",
};

function fmtMB(bytes: number | null) {
  if (!bytes) return "—";
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

export default function Scene3DPage() {
  const params = useParams();
  const projectId = Number(params.id);

  const [info, setInfo] = useState<Scene3DInfo | null>(null);
  const [mapping, setMapping] = useState<Scene3DMapping | null>(null);
  const [loading, setLoading] = useState(true);
  const [planLocked, setPlanLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [buildingKey, setBuildingKey] = useState("");
  const [kind, setKind] = useState<Asset3DKind>("EXTERIOR");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try {
      const proj = await apiFetch<{
        subscription?: { plan: string; status: string };
      }>(`/projects/${projectId}`);
      if (!hasUltimateWorkspaceAccess(proj.subscription)) {
        setPlanLocked(true);
        return;
      }
      const i = await scenes3dApi.info(projectId);
      setInfo(i);
      if (i.assets.some((a) => a.status === "READY")) {
        try {
          setMapping(await scenes3dApi.mapping(projectId));
        } catch {
          /* manifest not ready */
        }
      }
    } catch {
      setError("Не удалось загрузить данные 3D-сцены");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll while any asset is processing
  const hasProcessing = info?.assets.some((a) => a.status === "PROCESSING");
  useEffect(() => {
    if (!hasProcessing) return;
    const t = setInterval(() => void load(), 4000);
    return () => clearInterval(t);
  }, [hasProcessing, load]);

  const flash = (m: string) => {
    setNotice(m);
    setTimeout(() => setNotice(null), 2500);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Выберите файл .glb / .gltf");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await scenes3dApi.upload(projectId, file, {
        kind,
        buildingKey: buildingKey.trim() || undefined,
      });
      setFile(null);
      setBuildingKey("");
      if (fileRef.current) fileRef.current.value = "";
      await load();
      flash("Модель загружена — идёт обработка. Дождитесь статуса READY и нажмите «Опубликовать».");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setUploading(false);
    }
  };

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await load();
      if (ok) flash(ok);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка операции");
    } finally {
      setBusy(null);
    }
  };

  const nodeOptions = useMemo(
    () => mapping?.nodes.filter((n) => n.kind === "apartment").map((n) => n.node) ?? [],
    [mapping],
  );
  const allNodeOptions = useMemo(
    () => mapping?.nodes.map((n) => n.node) ?? [],
    [mapping],
  );
  const usableNodes = nodeOptions.length ? nodeOptions : allNodeOptions;

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-[#1E3A8A]" />
      </div>
    );
  }

  if (planLocked) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-6 px-4 py-20 text-center">
        <Box className="h-12 w-12 text-[#1E3A8A]" />
        <h1 className="text-2xl font-black text-[#1E3A8A] md:text-3xl">
          3D-модель — только на тарифе Ultra
        </h1>
        <p className="text-sm font-medium leading-relaxed text-slate-600 md:text-base">
          Загрузка и публикация 3D-модели ЖК доступна на тарифе Ultra (ULTIMATE).
          Перейдите на Ultra, чтобы показать покупателям интерактивную 3D-модель
          на сайте.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/dashboard/subscriptions"
            className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#1E3A8A] px-8 text-sm font-black uppercase tracking-widest text-white shadow-lg hover:bg-[#172554]"
          >
            Перейти на Ultra
          </Link>
          <Link
            href="/dashboard/projects"
            className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-8 text-sm font-black uppercase tracking-widest text-slate-800 hover:bg-slate-50"
          >
            Назад
          </Link>
        </div>
      </div>
    );
  }

  const published = info?.scene?.status === "READY";

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/projects"
          className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-[#1E3A8A]"
        >
          <ArrowLeft className="h-4 w-4" /> Проекты
        </Link>
        <span className="text-slate-300">/</span>
        <span className="text-sm font-black text-[#1E3A8A]">3D-модель</span>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-slate-900">
            <Box className="h-6 w-6 text-[#1E3A8A]" /> 3D-модель проекта
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Загрузите .glb, привяжите квартиры к объектам сцены и опубликуйте.
          </p>
        </div>
        {published ? (
          <a
            href={`${SITE_URL}/3d/${projectId}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-2xl bg-[#1E3A8A] px-4 py-2.5 text-sm font-black text-white shadow-lg hover:bg-[#172554]"
          >
            <ExternalLink className="h-4 w-4" /> Открыть 3D
          </a>
        ) : null}
      </div>

      {notice && (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {error}
        </div>
      )}

      {/* Upload */}
      <form
        onSubmit={handleUpload}
        className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm space-y-4"
      >
        <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-[#1E3A8A]">
          <Upload className="h-3.5 w-3.5" /> Загрузить модель
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">
              Тип
            </label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as Asset3DKind)}
              className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-900 outline-none focus:border-[#1E3A8A]"
            >
              <option value="EXTERIOR">Экстерьер (здание)</option>
              <option value="INTERIOR">Интерьер</option>
              <option value="SITE">Территория</option>
            </select>
          </div>
          <div className="sm:col-span-1">
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">
              Блок (необяз.)
            </label>
            <input
              value={buildingKey}
              onChange={(e) => setBuildingKey(e.target.value)}
              placeholder="напр. 1"
              className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-900 outline-none focus:border-[#1E3A8A]"
            />
          </div>
          <div className="sm:col-span-1">
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">
              Файл .glb
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".glb,.gltf,model/gltf-binary"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-xs font-medium text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-[#1E3A8A] file:px-4 file:py-2 file:text-xs file:font-black file:uppercase file:text-white"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={uploading || !file}
          className="flex items-center justify-center gap-2 rounded-2xl bg-[#F97316] px-6 py-3 text-sm font-black text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? "Загрузка…" : "Загрузить"}
        </button>
        <p className="text-xs text-slate-400">
          Совет: называйте объекты квартир в модели как{" "}
          <code className="rounded bg-slate-100 px-1">APT_1_3_07</code> или задайте{" "}
          <code className="rounded bg-slate-100 px-1">extras.osonly</code> — тогда привязка
          подставится автоматически.
        </p>
      </form>

      {/* Assets */}
      <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
        <p className="mb-3 text-[11px] font-black uppercase tracking-widest text-slate-500">
          Загруженные модели
        </p>
        {!info?.assets.length ? (
          <p className="py-6 text-center text-sm text-slate-400">Моделей пока нет</p>
        ) : (
          <ul className="space-y-2">
            {info.assets.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3"
              >
                <Box className="h-5 w-5 shrink-0 text-[#1E3A8A]" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-slate-900">
                    {a.kind} · #{a.id}
                    {info.scene?.publishedAssetId === a.id ? (
                      <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-black uppercase text-blue-700">
                        Опубликовано
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-slate-400">
                    {fmtMB(a.sizeBytes)}
                    {a.triangles ? ` · ${a.triangles.toLocaleString("ru-RU")} тр.` : ""}
                    {a.error ? ` · ${a.error}` : ""}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${STATUS_STYLE[a.status]}`}
                >
                  {a.status === "PROCESSING" ? "Обработка…" : a.status}
                </span>
                {(a.status === "UPLOADED" || a.status === "FAILED") && (
                  <button
                    onClick={() =>
                      run(`p${a.id}`, () => scenes3dApi.process(projectId, a.id), "Обработка запущена")
                    }
                    disabled={busy === `p${a.id}`}
                    className="rounded-xl bg-[#1E3A8A] px-3 py-1.5 text-[10px] font-black uppercase text-white hover:bg-blue-900 disabled:opacity-50"
                  >
                    {busy === `p${a.id}` ? "…" : "Обработать"}
                  </button>
                )}
                {a.status === "READY" && info.scene?.publishedAssetId !== a.id && (
                  <button
                    onClick={() =>
                      run(`pub${a.id}`, () => scenes3dApi.publish(projectId, a.id), "Опубликовано")
                    }
                    disabled={busy === `pub${a.id}`}
                    className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-[10px] font-black uppercase text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Rocket className="h-3 w-3" /> Опубликовать
                  </button>
                )}
                <button
                  onClick={() =>
                    run(`d${a.id}`, () => scenes3dApi.removeAsset(projectId, a.id))
                  }
                  disabled={busy === `d${a.id}`}
                  className="rounded-xl p-2 text-slate-300 hover:bg-red-50 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Model has no apartment objects → nothing will be clickable */}
      {mapping && nodeOptions.length === 0 ? (
        <div className="rounded-[2rem] border-2 border-amber-200 bg-amber-50 p-6">
          <p className="flex items-center gap-2 text-sm font-black text-amber-900">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            В модели не найдено объектов квартир
          </p>
          <p className="mt-2 text-sm font-medium leading-relaxed text-amber-800">
            Загруженная модель состоит из {mapping.nodes.length || 1} объекта(ов)
            без разметки квартир — поэтому в 3D <b>нельзя будет кликать по
            квартирам</b>. Чтобы это работало, подготовьте модель в 3D-редакторе:
            каждую квартиру сделайте <b>отдельным объектом</b> и назовите{" "}
            <code className="rounded bg-amber-100 px-1">APT_блок_этаж_номер</code>{" "}
            (например <code className="rounded bg-amber-100 px-1">APT_1_3_07</code>),
            затем перезалейте .glb. Само здание при этом отображается корректно.
          </p>
        </div>
      ) : null}

      {/* Mapping */}
      {mapping ? (
        <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                Привязка квартир к объектам
              </p>
              <p className="text-sm font-black text-slate-900">
                {info?.mappedCount ?? 0} / {info?.totalApartments ?? 0} привязано
              </p>
            </div>
            <button
              onClick={() =>
                run("auto", async () => {
                  const r = await scenes3dApi.autoMap(projectId);
                  flash(`Автопривязка: ${r.mapped} квартир`);
                  setMapping(await scenes3dApi.mapping(projectId));
                })
              }
              disabled={busy === "auto"}
              className="inline-flex items-center gap-2 rounded-2xl bg-[#1E3A8A] px-4 py-2.5 text-xs font-black uppercase text-white hover:bg-blue-900 disabled:opacity-50"
            >
              {busy === "auto" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              Авто-привязка
            </button>
          </div>

          <div className="max-h-[28rem] overflow-y-auto rounded-2xl border border-slate-100">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-4 py-3">Квартира</th>
                  <th className="px-4 py-3">Объект в сцене (mesh)</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {mapping.apartments.map((apt) => (
                  <tr key={apt.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 font-bold text-slate-800">
                      {apt.sectionKey ? `${apt.sectionKey} · ` : ""}№{apt.number}
                      <span className="ml-1 text-xs font-medium text-slate-400">
                        {apt.floor} эт.
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <select
                        value={apt.meshNode ?? ""}
                        onChange={(e) =>
                          run(`m${apt.id}`, async () => {
                            await scenes3dApi.map(projectId, apt.id, e.target.value || null);
                            setMapping(await scenes3dApi.mapping(projectId));
                          })
                        }
                        className="h-9 w-full max-w-xs rounded-xl border border-slate-200 px-2 text-sm font-medium text-slate-800 outline-none focus:border-[#1E3A8A]"
                      >
                        <option value="">— не привязано —</option>
                        {apt.meshNode && !usableNodes.includes(apt.meshNode) ? (
                          <option value={apt.meshNode}>{apt.meshNode}</option>
                        ) : null}
                        {usableNodes.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {apt.meshMapped ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-amber-400" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : info?.assets.some((a) => a.status === "READY") ? (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
          Манифест модели ещё готовится… обновите страницу через несколько секунд.
        </div>
      ) : null}
    </div>
  );
}
