"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  X,
  User,
  CreditCard,
  Layers,
  LayoutGrid,
  Plus,
  Trash2,
  Users,
  SlidersHorizontal,
  ExternalLink,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { API_URL, apiFetch, getToken } from "@/lib/api";
import {
  formatMoneyInput,
  formatUzs,
  formatUzsPerM2,
  parseMoneyInput,
} from "@/lib/currency";
import { formatPhoneNumber } from "@/lib/format";
import { hasUltimateWorkspaceAccess } from "@/lib/subscription-access";
import ContractCreateModal from "@/components/crm/ContractCreateModal";

type AptStatus = "AVAILABLE" | "RESERVED" | "SOLD" | "INSTALLMENT" | "MORTGAGE" | "UNAVAILABLE";

type Apartment = {
  id: number;
  sectionKey?: string;
  number: string;
  floor: number;
  rooms: number;
  areaSqm: number;
  priceUzs: number | null;
  status: AptStatus;
  layoutImageUrl?: string | null;
  model3dUrl?: string | null;
  sortOrder?: number;
};

type ApartmentDetail = Apartment & {
  customers: Array<{
    id: number;
    name: string;
    phone: string;
    accessCode: string;
    payments: Array<{
      id: number;
      amountUzs: number;
      paidAt: string;
      comment: string | null;
      type: string;
    }>;
  }>;
  leads: Array<{
    id: number;
    name: string;
    phone: string;
    status: string;
    createdAt: string;
  }>;
};

type BulkSectionForm = {
  sectionKey: string;
  sectionLabel: string;
  /** Строки — чтобы можно было очистить поле и ввести заново */
  floorFrom: string;
  floorTo: string;
  unitsPerFloor: string;
  rooms: string;
  areaSqm: string;
  priceUzs: string;
  layoutVariantId: string;
};

const bulkInputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-[#1E3A8A]/15";

const bulkLabelClass = "text-[10px] font-black uppercase tracking-widest text-slate-700";

function defaultBulkSection(): BulkSectionForm {
  return {
    sectionKey: "",
    sectionLabel: "",
    floorFrom: "1",
    floorTo: "9",
    unitsPerFloor: "4",
    rooms: "2",
    areaSqm: "55",
    priceUzs: "",
    layoutVariantId: "",
  };
}

function countBulkUnits(sections: BulkSectionForm[]): number {
  let n = 0;
  for (const sec of sections) {
    const a = parseInt(sec.floorFrom.trim(), 10);
    const b = parseInt(sec.floorTo.trim(), 10);
    const u = parseInt(sec.unitsPerFloor.trim(), 10);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(u)) continue;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (hi >= lo && u >= 1) {
      n += (hi - lo + 1) * u;
    }
  }
  return n;
}

function previewNumbers(sections: BulkSectionForm[], max = 8): string[] {
  const out: string[] = [];
  for (const sec of sections) {
    const sk = sec.sectionKey.trim();
    const a = parseInt(sec.floorFrom.trim(), 10);
    const b = parseInt(sec.floorTo.trim(), 10);
    const uf = parseInt(sec.unitsPerFloor.trim(), 10);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(uf) || uf < 1)
      continue;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    for (let f = lo; f <= hi && out.length < max; f++) {
      for (let u = 1; u <= uf && out.length < max; u++) {
        const num = sk
          ? `${sk}-${f}-${String(u).padStart(2, "0")}`
          : `${f}-${String(u).padStart(2, "0")}`;
        out.push(num);
      }
    }
  }
  return out;
}

const statusStyle: Record<AptStatus, string> = {
  AVAILABLE:   "bg-emerald-500/90 text-white border-emerald-600",
  RESERVED:    "bg-amber-400/95 text-slate-900 border-amber-500",
  SOLD:        "bg-red-500/90 text-white border-red-600",
  INSTALLMENT: "bg-blue-500/90 text-white border-blue-600",
  MORTGAGE:    "bg-purple-500/90 text-white border-purple-600",
  UNAVAILABLE: "bg-slate-400/90 text-white border-slate-500",
};

const STATUS_LABEL: Record<AptStatus, string> = {
  AVAILABLE:   "Свободна",
  RESERVED:    "Забронирована",
  SOLD:        "Продана",
  INSTALLMENT: "В рассрочке",
  MORTGAGE:    "В ипотеке",
  UNAVAILABLE: "Недоступна",
};

/** Колонка шахматки: полный sectionKey в БД; «блок|подъезд» для двухрядной шапки. */
function parseSectionColumn(fullKey: string): { block: string; entrance: string } {
  const k = fullKey ?? "";
  if (!k) return { block: "", entrance: "" };
  const pipe = k.indexOf("|");
  if (pipe !== -1) {
    return {
      block: k.slice(0, pipe).trim(),
      entrance: k.slice(pipe + 1).trim(),
    };
  }
  return { block: k, entrance: "" };
}

export default function ChessboardPage() {
  const params = useParams();
  const projectId = Number(params.id);
  const t = useTranslations("Dashboard.chessboard");
  const tc = useTranslations("Common");

  const [projectName, setProjectName] = useState<string>("");
  const [list, setList] = useState<Apartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [planLocked, setPlanLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ApartmentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSections, setBulkSections] = useState<BulkSectionForm[]>([
    defaultBulkSection(),
  ]);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const [fSection, setFSection] = useState("");
  const [fRooms, setFRooms] = useState("");
  const [fPriceMin, setFPriceMin] = useState("");
  const [fPriceMax, setFPriceMax] = useState("");
  const [fAreaMin, setFAreaMin] = useState("");
  const [fAreaMax, setFAreaMax] = useState("");
  const [fFloorMin, setFFloorMin] = useState("");
  const [fFloorMax, setFFloorMax] = useState("");

  const [planTab, setPlanTab] = useState<"2d" | "3d">("2d");
  const [editOpen, setEditOpen] = useState(false);
  const [editNumber, setEditNumber] = useState("");
  const [editFloor, setEditFloor] = useState("");
  const [editRooms, setEditRooms] = useState("");
  const [editArea, setEditArea] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editLayoutUrl, setEditLayoutUrl] = useState("");
  const [editModelUrl, setEditModelUrl] = useState("");
  const [unitSaving, setUnitSaving] = useState(false);
  const [contractModalOpen, setContractModalOpen] = useState(false);

  const load = useCallback(async () => {
    if (!projectId || Number.isNaN(projectId)) return;
    setLoading(true);
    setError(null);
    setPlanLocked(false);
    try {
      const proj = await apiFetch<{
        name: string;
        subscription?: { plan: string; status: string };
      }>(`/projects/${projectId}`);
      setProjectName(proj.name);
      if (!hasUltimateWorkspaceAccess(proj.subscription)) {
        setPlanLocked(true);
        setList([]);
        return;
      }
      const res = await apiFetch<{ items: Apartment[] }>(
        `/projects/${projectId}/apartments?limit=500`,
      );
      setList(res.items ?? []);
    } catch {
      setError(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [projectId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const parseNum = (s: string) => {
    const t = s.trim().replace(/\s/g, "").replace(",", ".");
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  const filteredList = useMemo(() => {
    return list.filter((a) => {
      if (fSection && (a.sectionKey ?? "") !== fSection) return false;
      if (fRooms && String(a.rooms) !== fRooms) return false;
      const p = a.priceUzs;
      const pmin = parseNum(fPriceMin);
      const pmax = parseNum(fPriceMax);
      if (pmin != null && (p == null || p < pmin)) return false;
      if (pmax != null && (p == null || p > pmax)) return false;
      const amin = parseNum(fAreaMin);
      const amax = parseNum(fAreaMax);
      if (amin != null && a.areaSqm < amin) return false;
      if (amax != null && a.areaSqm > amax) return false;
      const fmin = parseNum(fFloorMin);
      const fmax = parseNum(fFloorMax);
      if (fmin != null && a.floor < fmin) return false;
      if (fmax != null && a.floor > fmax) return false;
      return true;
    });
  }, [
    list,
    fSection,
    fRooms,
    fPriceMin,
    fPriceMax,
    fAreaMin,
    fAreaMax,
    fFloorMin,
    fFloorMax,
  ]);

  const sectionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const a of list) set.add(a.sectionKey ?? "");
    return [...set].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
  }, [list]);

  const roomOptions = useMemo(() => {
    const set = new Set<number>();
    for (const a of list) set.add(a.rooms);
    return [...set].sort((a, b) => a - b);
  }, [list]);

  const matrixColumns = useMemo(() => {
    const set = new Set<string>();
    for (const a of filteredList) set.add(a.sectionKey ?? "");
    const keys = [...set].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
    const cols = keys.map((fullKey) => ({
      fullKey,
      ...parseSectionColumn(fullKey),
    }));
    cols.sort((a, b) => {
      const ab = (a.block || "\uffff").localeCompare(b.block || "\uffff", undefined, {
        numeric: true,
      });
      if (ab !== 0) return ab;
      const ae = (a.entrance || "").localeCompare(b.entrance || "", undefined, {
        numeric: true,
      });
      if (ae !== 0) return ae;
      return a.fullKey.localeCompare(b.fullKey, undefined, { numeric: true });
    });
    return cols;
  }, [filteredList]);

  const blockHeaderGroups = useMemo(() => {
    const groups: { block: string; count: number }[] = [];
    for (const col of matrixColumns) {
      const b = col.block;
      const last = groups[groups.length - 1];
      if (last && last.block === b) last.count += 1;
      else groups.push({ block: b, count: 1 });
    }
    return groups;
  }, [matrixColumns]);

  const matrixFloors = useMemo(() => {
    const set = new Set<number>();
    for (const a of filteredList) set.add(a.floor);
    return [...set].sort((a, b) => b - a);
  }, [filteredList]);

  // Группировка колонок по блокам для горизонтальной шахматки (как в UySot)
  const blocks = useMemo(() => {
    const map = new Map<string, typeof matrixColumns>();
    for (const col of matrixColumns) {
      if (!map.has(col.block)) map.set(col.block, []);
      map.get(col.block)!.push(col);
    }
    return [...map.entries()].map(([block, cols]) => ({ block, cols }));
  }, [matrixColumns]);

  const unitsByCell = useMemo(() => {
    const map = new Map<string, Apartment[]>();
    for (const a of filteredList) {
      const sk = a.sectionKey ?? "";
      const k = `${a.floor}::${sk}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(a);
    }
    for (const arr of map.values()) {
      arr.sort((x, y) => {
        const so = (x.sortOrder ?? 0) - (y.sortOrder ?? 0);
        if (so !== 0) return so;
        return x.number.localeCompare(y.number, undefined, { numeric: true });
      });
    }
    return map;
  }, [filteredList]);

  const bulkPreviewCount = useMemo(
    () => countBulkUnits(bulkSections),
    [bulkSections],
  );

  const bulkPreviewNums = useMemo(
    () => previewNumbers(bulkSections),
    [bulkSections],
  );

  const openDetail = async (apt: Apartment) => {
    setDetailLoading(true);
    setSelected({ ...apt, customers: [], leads: [] });
    try {
      const d = await apiFetch<ApartmentDetail>(
        `/projects/${projectId}/apartments/${apt.id}`,
      );
      setSelected(d);
    } catch {
      setSelected(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const patchStatus = async (aptId: number, status: AptStatus) => {
    await fetch(`${API_URL}/projects/${projectId}/apartments/${aptId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ status }),
    });
    await load();
    if (selected?.id === aptId) {
      const d = await apiFetch<ApartmentDetail>(
        `/projects/${projectId}/apartments/${aptId}`,
      );
      setSelected(d);
    }
  };

  useEffect(() => {
    if (!selected) {
      setEditOpen(false);
      return;
    }
    setEditNumber(selected.number);
    setEditFloor(String(selected.floor));
    setEditRooms(String(selected.rooms));
    setEditArea(String(selected.areaSqm));
    setEditPrice(
      selected.priceUzs != null
        ? formatMoneyInput(String(selected.priceUzs))
        : "",
    );
    setEditLayoutUrl(selected.layoutImageUrl ?? "");
    setEditModelUrl(selected.model3dUrl ?? "");
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    if (selected.layoutImageUrl) setPlanTab("2d");
    else if (selected.model3dUrl) setPlanTab("3d");
  }, [selected?.id, selected?.layoutImageUrl, selected?.model3dUrl]);

  const resetFilters = () => {
    setFSection("");
    setFRooms("");
    setFPriceMin("");
    setFPriceMax("");
    setFAreaMin("");
    setFAreaMax("");
    setFFloorMin("");
    setFFloorMax("");
  };

  const cellUnits = (floor: number, sectionKey: string) =>
    unitsByCell.get(`${floor}::${sectionKey}`) ?? [];

  const uploadLayoutFile = async (file: File) => {
    const token = getToken();
    if (!token) return;
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_URL}/upload/image`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!res.ok) throw new Error("upload");
    const data = (await res.json()) as { url?: string };
    if (data?.url) setEditLayoutUrl(data.url);
  };

  const saveUnitEdit = async () => {
    if (!selected) return;
    setUnitSaving(true);
    try {
      const res = await fetch(
        `${API_URL}/projects/${projectId}/apartments/${selected.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({
            number: editNumber.trim(),
            floor: Number(editFloor),
            rooms: Number(editRooms),
            areaSqm: Number(editArea.replace(",", ".")),
            priceUzs: editPrice.trim() ? parseMoneyInput(editPrice) : null,
            layoutImageUrl: editLayoutUrl.trim() || null,
            model3dUrl: editModelUrl.trim() || null,
          }),
        },
      );
      if (!res.ok) throw new Error("patch");
      await load();
      const d = await apiFetch<ApartmentDetail>(
        `/projects/${projectId}/apartments/${selected.id}`,
      );
      setSelected(d);
      setEditOpen(false);
    } finally {
      setUnitSaving(false);
    }
  };

  const updateBulkRow = (
    index: number,
    patch: Partial<BulkSectionForm>,
  ) => {
    setBulkSections((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  };

  const submitBulk = async () => {
    setBulkError(null);
    const trimmed = bulkSections.map((s) => ({
      ...s,
      sectionKey: s.sectionKey.trim(),
    }));

    if (trimmed.length > 1) {
      for (const s of trimmed) {
        if (!s.sectionKey) {
          setBulkError(t("bulk.warnMultiKeys"));
          return;
        }
      }
    }

    const parsedSections = trimmed.map((s) => {
      const floorFrom = parseInt(s.floorFrom.trim(), 10);
      const floorTo = parseInt(s.floorTo.trim(), 10);
      const unitsPerFloor = parseInt(s.unitsPerFloor.trim(), 10);
      const rooms = parseInt(s.rooms.trim(), 10);
      const areaSqm = parseFloat(s.areaSqm.trim().replace(",", "."));
      return {
        s,
        floorFrom,
        floorTo,
        unitsPerFloor,
        rooms,
        areaSqm,
      };
    });

    for (const p of parsedSections) {
      if (
        !Number.isFinite(p.floorFrom) ||
        !Number.isFinite(p.floorTo) ||
        !Number.isFinite(p.unitsPerFloor) ||
        p.unitsPerFloor < 1 ||
        !Number.isFinite(p.rooms) ||
        p.rooms < 1 ||
        !Number.isFinite(p.areaSqm) ||
        p.areaSqm < 1
      ) {
        setBulkError(t("bulk.invalidNumbers"));
        return;
      }
    }

    if (bulkPreviewCount <= 0 || bulkPreviewCount > 2500) {
      setBulkError(t("bulk.badCount"));
      return;
    }

    setBulkSubmitting(true);
    try {
      const body = {
        sections: parsedSections.map(({ s, ...n }) => ({
          sectionKey: s.sectionKey,
          sectionLabel: s.sectionLabel.trim() || undefined,
          floorFrom: n.floorFrom,
          floorTo: n.floorTo,
          unitsPerFloor: n.unitsPerFloor,
          rooms: n.rooms,
          areaSqm: n.areaSqm,
          ...(s.priceUzs.trim()
            ? { priceUzs: Number(s.priceUzs.replace(/\s/g, "")) }
            : {}),
          ...(s.layoutVariantId.trim()
            ? { layoutVariantId: Number(s.layoutVariantId) }
            : {}),
        })),
      };

      const res = await fetch(
        `${API_URL}/projects/${projectId}/apartments/bulk`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify(body),
        },
      );

      if (!res.ok) {
        let msg = t("bulk.error");
        try {
          const j = (await res.json()) as {
            message?: string | string[];
          };
          if (typeof j.message === "string") msg = j.message;
          else if (Array.isArray(j.message)) msg = j.message.join(", ");
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }

      setBulkOpen(false);
      setBulkSections([defaultBulkSection()]);
      await load();
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : t("bulk.error"));
    } finally {
      setBulkSubmitting(false);
    }
  };

  if (!projectId || Number.isNaN(projectId)) {
    return (
      <div className="p-10 text-slate-500 font-medium">{t("badProject")}</div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-[#1E3A8A]" />
      </div>
    );
  }

  if (planLocked) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-6 px-4 py-20 text-center animate-in fade-in duration-500">
        <h1 className="text-2xl font-black text-[#1E3A8A] md:text-3xl">{t("ultraRequiredTitle")}</h1>
        <p className="text-sm font-medium leading-relaxed text-slate-600 md:text-base">
          {t("ultraRequiredBody")}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/dashboard/subscriptions"
            className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#1E3A8A] px-8 text-sm font-black uppercase tracking-widest text-white shadow-lg hover:bg-[#172554]"
          >
            {t("ultraRequiredCta")}
          </Link>
          <Link
            href="/dashboard/projects"
            className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-8 text-sm font-black uppercase tracking-widest text-slate-800 hover:bg-slate-50"
          >
            {t("back")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-24 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/projects"
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            aria-label={t("back")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-[#1E3A8A]">
              {t("title")}
            </h1>
            <p className="text-slate-500 font-medium">
              {projectName} · {t("subtitle")}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
          <Link
            href={`/dashboard/projects/${projectId}/customers`}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black uppercase tracking-widest text-slate-800 shadow-sm transition hover:bg-slate-50"
          >
            <Users className="h-4 w-4" />
            {t("customersLink")}
          </Link>
          <button
            type="button"
            onClick={() => {
              setBulkError(null);
              setBulkOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#1E3A8A] px-5 py-3 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-blue-900/15 transition hover:bg-[#172554]"
          >
            <LayoutGrid className="h-4 w-4" />
            {t("bulk.open")}
          </button>
          <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-widest">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Свободна
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-amber-900">
              <span className="h-2 w-2 rounded-full bg-amber-400" /> Забронирована
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-red-800">
              <span className="h-2 w-2 rounded-full bg-red-500" /> Продана
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-1 text-blue-800">
              <span className="h-2 w-2 rounded-full bg-blue-500" /> В рассрочке
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-100 px-2.5 py-1 text-purple-800">
              <span className="h-2 w-2 rounded-full bg-purple-500" /> В ипотеке
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
              <span className="h-2 w-2 rounded-full bg-slate-400" /> Недоступна
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-red-700 font-bold">
          {error}
        </div>
      )}

      <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm md:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <SlidersHorizontal className="h-5 w-5 shrink-0 text-[#1E3A8A]" />
          <span className="text-sm font-black uppercase tracking-widest text-slate-800">
            {t("filters.title")}
          </span>
          <button
            type="button"
            onClick={resetFilters}
            className="ml-auto rounded-xl border border-slate-200 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50"
          >
            {t("filters.reset")}
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          <label className="space-y-1">
            <span className={bulkLabelClass}>{t("filters.section")}</span>
            <select
              className={bulkInputClass}
              value={fSection}
              onChange={(e) => setFSection(e.target.value)}
            >
              <option value="">{t("filters.sectionAll")}</option>
              {sectionOptions.map((sk) => (
                <option key={sk || "__empty"} value={sk}>
                  {sk ? t("blockTitle", { code: sk }) : t("blockDefault")}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className={bulkLabelClass}>{t("filters.rooms")}</span>
            <select
              className={bulkInputClass}
              value={fRooms}
              onChange={(e) => setFRooms(e.target.value)}
            >
              <option value="">{t("filters.roomsAll")}</option>
              {roomOptions.map((r) => (
                <option key={r} value={String(r)}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className={bulkLabelClass}>{t("filters.priceFrom")}</span>
            <input
              className={bulkInputClass}
              inputMode="numeric"
              value={fPriceMin}
              onChange={(e) =>
                setFPriceMin(formatMoneyInput(e.target.value))
              }
              placeholder="—"
            />
          </label>
          <label className="space-y-1">
            <span className={bulkLabelClass}>{t("filters.priceTo")}</span>
            <input
              className={bulkInputClass}
              inputMode="numeric"
              value={fPriceMax}
              onChange={(e) =>
                setFPriceMax(formatMoneyInput(e.target.value))
              }
              placeholder="—"
            />
          </label>
          <label className="space-y-1">
            <span className={bulkLabelClass}>{t("filters.areaFrom")}</span>
            <input
              className={bulkInputClass}
              inputMode="decimal"
              value={fAreaMin}
              onChange={(e) => setFAreaMin(e.target.value)}
              placeholder="—"
            />
          </label>
          <label className="space-y-1">
            <span className={bulkLabelClass}>{t("filters.areaTo")}</span>
            <input
              className={bulkInputClass}
              inputMode="decimal"
              value={fAreaMax}
              onChange={(e) => setFAreaMax(e.target.value)}
              placeholder="—"
            />
          </label>
          <label className="space-y-1">
            <span className={bulkLabelClass}>{t("filters.floorFrom")}</span>
            <input
              className={bulkInputClass}
              inputMode="numeric"
              value={fFloorMin}
              onChange={(e) => setFFloorMin(e.target.value)}
              placeholder="—"
            />
          </label>
          <label className="space-y-1">
            <span className={bulkLabelClass}>{t("filters.floorTo")}</span>
            <input
              className={bulkInputClass}
              inputMode="numeric"
              value={fFloorMax}
              onChange={(e) => setFFloorMax(e.target.value)}
              placeholder="—"
            />
          </label>
        </div>
        <p className="mt-3 text-xs font-medium text-slate-500">
          {t("filters.matrixHint")}
        </p>
      </div>

      <div className="space-y-8">
        {list.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-12 text-center text-slate-500 font-medium">
            <p className="mb-4">{t("empty")}</p>
            <button
              type="button"
              onClick={() => setBulkOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-[#F97316] px-5 py-2.5 text-sm font-black uppercase tracking-widest text-white"
            >
              <LayoutGrid className="h-4 w-4" />
              {t("bulk.open")}
            </button>
          </div>
        ) : filteredList.length === 0 ? (
          <div className="rounded-3xl border border-amber-100 bg-amber-50/80 p-10 text-center text-amber-950 font-medium">
            <p className="mb-3">{t("filters.noMatch")}</p>
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-xl bg-white px-5 py-2 text-xs font-black uppercase tracking-widest text-amber-900 shadow-sm"
            >
              {t("filters.reset")}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[2rem] border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex gap-4">
              {/* Ось этажей (липкая слева) */}
              <div className="sticky left-0 z-10 shrink-0 bg-white">
                <div className="h-11" />
                {matrixFloors.map((floor) => (
                  <div
                    key={floor}
                    className="flex h-10 items-center justify-end pr-2 text-[11px] font-black text-slate-400"
                  >
                    {floor}
                  </div>
                ))}
              </div>

              {/* Блоки рядом по горизонтали */}
              {blocks.map(({ block, cols }) => (
                <div key={block || "__root__"} className="shrink-0">
                  {/* Заголовок блока */}
                  <div className="mb-0.5 flex h-6 items-center justify-center rounded-lg bg-slate-100 px-3 text-[10px] font-black uppercase tracking-wider text-[#1E3A8A]">
                    {block ? t("blockTitle", { code: block }) : t("blockDefault")}
                  </div>

                  {/* Подзаголовок: подъезды */}
                  <div className="mb-1 flex gap-3">
                    {cols.map((col) => (
                      <div
                        key={col.fullKey || "__"}
                        className="flex-1 text-center text-[8px] font-bold uppercase leading-none text-slate-400"
                      >
                        {col.entrance ? t("entranceCol", { n: col.entrance }) : ""}
                      </div>
                    ))}
                  </div>

                  {/* Этажи */}
                  {matrixFloors.map((floor) => (
                    <div key={floor} className="flex h-10 items-center gap-3">
                      {cols.map((col) => {
                        const units = cellUnits(floor, col.fullKey);
                        return (
                          <div
                            key={`${floor}-${col.fullKey || ""}`}
                            className="flex justify-center gap-1"
                          >
                            {units.map((a) => {
                              const tipPrice =
                                a.priceUzs != null && a.priceUzs > 0
                                  ? formatMoneyInput(String(a.priceUzs)) + " сум"
                                  : tc("negotiablePrice");
                              return (
                                <button
                                  key={a.id}
                                  type="button"
                                  onClick={() => void openDetail(a)}
                                  title={t("unitTooltip", {
                                    n: a.number,
                                    rooms: a.rooms,
                                    area: a.areaSqm,
                                    price: tipPrice,
                                  })}
                                  className={`flex h-8 w-14 shrink-0 items-center justify-center rounded-md text-center text-[9px] font-black leading-[1.05] shadow-sm transition hover:z-10 hover:scale-110 hover:shadow-md hover:ring-2 hover:ring-offset-1 hover:ring-[#1E3A8A]/50 ${statusStyle[a.status]}`}
                                >
                                  {a.number}
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {bulkOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 p-6">
              <div>
                <h2 className="text-xl font-black text-[#1E3A8A]">
                  {t("bulk.title")}
                </h2>
                <p className="mt-1 text-xs font-medium text-slate-700">
                  {t("bulk.hint")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => !bulkSubmitting && setBulkOpen(false)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
                aria-label={t("close")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-6 space-y-6">
              {bulkSections.map((row, idx) => (
                <div
                  key={idx}
                  className="rounded-2xl border border-slate-100 bg-slate-50/80 p-5 space-y-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black uppercase tracking-widest text-slate-800">
                      {t("bulk.blockHeading", { n: idx + 1 })}
                    </span>
                    {bulkSections.length > 1 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setBulkSections((s) =>
                            s.filter((_, i) => i !== idx),
                          )
                        }
                        className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                        aria-label={t("bulk.removeBlock")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1">
                      <span className={bulkLabelClass}>
                        {t("bulk.sectionKey")}
                      </span>
                      <input
                        value={row.sectionKey}
                        onChange={(e) =>
                          updateBulkRow(idx, { sectionKey: e.target.value })
                        }
                        placeholder="A"
                        className={bulkInputClass}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className={bulkLabelClass}>
                        {t("bulk.sectionLabel")}
                      </span>
                      <input
                        value={row.sectionLabel}
                        onChange={(e) =>
                          updateBulkRow(idx, { sectionLabel: e.target.value })
                        }
                        placeholder={t("bulk.sectionLabelPh")}
                        className={bulkInputClass}
                      />
                    </label>
                  </div>

                  <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                    <label className="space-y-1">
                      <span className={bulkLabelClass}>
                        {t("bulk.floorFrom")}
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={row.floorFrom}
                        onChange={(e) =>
                          updateBulkRow(idx, { floorFrom: e.target.value })
                        }
                        className={bulkInputClass}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className={bulkLabelClass}>
                        {t("bulk.floorTo")}
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={row.floorTo}
                        onChange={(e) =>
                          updateBulkRow(idx, { floorTo: e.target.value })
                        }
                        className={bulkInputClass}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className={bulkLabelClass}>
                        {t("bulk.unitsPerFloor")}
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={row.unitsPerFloor}
                        onChange={(e) =>
                          updateBulkRow(idx, {
                            unitsPerFloor: e.target.value,
                          })
                        }
                        className={bulkInputClass}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className={bulkLabelClass}>
                        {t("bulk.rooms")}
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={row.rooms}
                        onChange={(e) =>
                          updateBulkRow(idx, { rooms: e.target.value })
                        }
                        className={bulkInputClass}
                      />
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="space-y-1">
                      <span className={bulkLabelClass}>
                        {t("bulk.areaSqm")}
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.areaSqm}
                        onChange={(e) =>
                          updateBulkRow(idx, { areaSqm: e.target.value })
                        }
                        className={bulkInputClass}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className={bulkLabelClass}>
                        {t("bulk.priceUzs")}
                      </span>
                      <input
                        value={row.priceUzs}
                        onChange={(e) =>
                          updateBulkRow(idx, {
                            priceUzs: formatMoneyInput(e.target.value),
                          })
                        }
                        placeholder="—"
                        className={bulkInputClass}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className={bulkLabelClass}>
                        {t("bulk.layoutVariantId")}
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={row.layoutVariantId}
                        onChange={(e) =>
                          updateBulkRow(idx, {
                            layoutVariantId: e.target.value,
                          })
                        }
                        placeholder="—"
                        className={bulkInputClass}
                      />
                    </label>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() =>
                  setBulkSections((s) => [...s, defaultBulkSection()])
                }
                className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 py-4 text-sm font-black uppercase tracking-widest text-slate-800 hover:border-[#1E3A8A] hover:text-[#1E3A8A]"
              >
                <Plus className="h-4 w-4" />
                {t("bulk.addBlock")}
              </button>

              <div className="rounded-2xl border border-blue-100 bg-blue-50/80 p-4">
                <p className="text-sm font-black text-slate-900">
                  {t("bulk.previewCount", { count: bulkPreviewCount })}
                </p>
                <p className="mt-2 text-xs font-medium text-slate-800">
                  {t("bulk.previewSample")}: {bulkPreviewNums.join(", ")}
                  {bulkPreviewCount > bulkPreviewNums.length ? "…" : ""}
                </p>
              </div>

              {bulkError && (
                <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-bold text-red-700">
                  {bulkError}
                </div>
              )}
            </div>

            <div className="flex shrink-0 gap-3 border-t border-slate-100 p-6">
              <button
                type="button"
                onClick={() => !bulkSubmitting && setBulkOpen(false)}
                className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-black uppercase tracking-widest text-slate-600"
              >
                {t("bulk.cancel")}
              </button>
              <button
                type="button"
                disabled={bulkSubmitting || bulkPreviewCount <= 0}
                onClick={() => void submitBulk()}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#F97316] py-3 text-sm font-black uppercase tracking-widest text-white shadow-lg disabled:opacity-50"
              >
                {bulkSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {t("bulk.submit")}
              </button>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-[100] flex justify-end bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-200 lg:pointer-events-none lg:bg-transparent lg:backdrop-blur-none">
          <div className="pointer-events-auto flex h-full w-full max-w-lg flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-300 lg:h-[calc(100vh-5.5rem)] lg:max-w-[420px] lg:rounded-2xl lg:border lg:border-slate-200 lg:shadow-2xl lg:slide-in-from-bottom-0 lg:m-4">
            <div className="flex items-center justify-between border-b border-slate-100 p-6">
              <div>
                <h2 className="text-xl font-black text-slate-900">
                  {t("drawerTitle", { n: selected.number })}
                </h2>
                <p className="text-xs font-bold text-slate-400">
                  {(() => {
                    const s = parseSectionColumn(selected.sectionKey ?? "");
                    const parts: string[] = [];
                    if (s.block) parts.push(t("blockShort", { code: s.block }));
                    if (s.entrance)
                      parts.push(t("entranceCol", { n: s.entrance }));
                    parts.push(
                      `${t("floor", { n: selected.floor })} · ${selected.rooms} ${t("rooms")} · ${selected.areaSqm} м²`,
                    );
                    return parts.join(" · ");
                  })()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
                aria-label={t("close")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {detailLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-[#1E3A8A]" />
                </div>
              ) : (
                <>
                  {(() => {
                    const sec = parseSectionColumn(selected.sectionKey ?? "");
                    const priceM2 =
                      selected.priceUzs != null &&
                      selected.areaSqm > 0 &&
                      Number.isFinite(selected.areaSqm)
                        ? selected.priceUzs / selected.areaSqm
                        : null;
                    return (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full border-2 px-3 py-1 text-[10px] font-black uppercase tracking-wider ${statusStyle[selected.status]}`}
                          >
                            {STATUS_LABEL[selected.status]}
                          </span>
                        </div>

                        {(selected.status === "AVAILABLE" ||
                          selected.status === "RESERVED") && (
                          <button
                            type="button"
                            onClick={() => setContractModalOpen(true)}
                            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#F97316] py-3.5 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-orange-900/20 hover:bg-orange-600 transition active:scale-[0.98]"
                          >
                            <CreditCard className="h-4 w-4" />
                            Оформить договор
                          </button>
                        )}
                        {selected.priceUzs != null && selected.priceUzs > 0 ? (
                          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-800">
                              {t("priceHighlight")}
                            </p>
                            <p className="text-xl font-black text-emerald-950">
                              {formatUzs(selected.priceUzs)}
                            </p>
                            {priceM2 != null && Number.isFinite(priceM2) ? (
                              <p className="mt-1 text-xs font-bold text-emerald-800">
                                {formatUzsPerM2(priceM2)}
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                              {t("priceHighlight")}
                            </p>
                            <p className="text-lg font-black text-slate-700">
                              {tc("negotiablePrice")}
                            </p>
                          </div>
                        )}
                        <div>
                          <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                            {t("infoTableTitle")}
                          </p>
                          <table className="w-full text-xs">
                            <tbody className="divide-y divide-slate-100">
                              <tr>
                                <td className="py-1.5 font-bold text-slate-500">
                                  {t("infoBuilding")}
                                </td>
                                <td className="py-1.5 text-right font-black text-slate-900">
                                  {sec.block || t("blockDefault")}
                                </td>
                              </tr>
                              <tr>
                                <td className="py-1.5 font-bold text-slate-500">
                                  {t("infoEntrance")}
                                </td>
                                <td className="py-1.5 text-right font-black text-slate-900">
                                  {sec.entrance
                                    ? t("entranceCol", { n: sec.entrance })
                                    : t("entranceDash")}
                                </td>
                              </tr>
                              <tr>
                                <td className="py-1.5 font-bold text-slate-500">
                                  {t("infoFloor")}
                                </td>
                                <td className="py-1.5 text-right font-black">
                                  {selected.floor}
                                </td>
                              </tr>
                              <tr>
                                <td className="py-1.5 font-bold text-slate-500">
                                  {t("infoNumber")}
                                </td>
                                <td className="py-1.5 text-right font-black">
                                  {selected.number}
                                </td>
                              </tr>
                              <tr>
                                <td className="py-1.5 font-bold text-slate-500">
                                  {t("infoRooms")}
                                </td>
                                <td className="py-1.5 text-right font-black">
                                  {selected.rooms}
                                </td>
                              </tr>
                              <tr>
                                <td className="py-1.5 font-bold text-slate-500">
                                  {t("infoArea")}
                                </td>
                                <td className="py-1.5 text-right font-black">
                                  {selected.areaSqm} м²
                                </td>
                              </tr>
                              <tr>
                                <td className="py-1.5 font-bold text-slate-500">
                                  {t("infoPriceTotal")}
                                </td>
                                <td className="py-1.5 text-right font-black">
                                  {selected.priceUzs != null &&
                                  selected.priceUzs > 0
                                    ? formatUzs(selected.priceUzs)
                                    : tc("negotiablePrice")}
                                </td>
                              </tr>
                              {priceM2 != null && Number.isFinite(priceM2) ? (
                                <tr>
                                  <td className="py-1.5 font-bold text-slate-500">
                                    {t("infoPriceM2")}
                                  </td>
                                  <td className="py-1.5 text-right font-black">
                                    {formatUzsPerM2(priceM2)}
                                  </td>
                                </tr>
                              ) : null}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}

                  {(selected.layoutImageUrl || selected.model3dUrl) && (
                    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
                      <div className="flex border-b border-slate-100 bg-white">
                        <button
                          type="button"
                          onClick={() => setPlanTab("2d")}
                          className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest ${
                            planTab === "2d"
                              ? "bg-[#1E3A8A] text-white"
                              : "text-slate-500 hover:bg-slate-50"
                          }`}
                          disabled={!selected.layoutImageUrl}
                        >
                          {t("plan2d")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPlanTab("3d")}
                          className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest ${
                            planTab === "3d"
                              ? "bg-[#1E3A8A] text-white"
                              : "text-slate-500 hover:bg-slate-50"
                          }`}
                          disabled={!selected.model3dUrl}
                        >
                          {t("plan3d")}
                        </button>
                      </div>
                      <div className="p-3">
                        {planTab === "2d" && selected.layoutImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={selected.layoutImageUrl}
                            alt=""
                            className="mx-auto max-h-56 w-full rounded-xl object-contain"
                          />
                        ) : planTab === "3d" && selected.model3dUrl ? (
                          <div className="flex flex-col items-center justify-center gap-3 py-8">
                            <a
                              href={selected.model3dUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg"
                            >
                              <ExternalLink className="h-4 w-4" />
                              {t("open3d")}
                            </a>
                          </div>
                        ) : (
                          <p className="py-6 text-center text-xs text-slate-400">
                            —
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setEditOpen((v) => !v)}
                    className="w-full rounded-2xl border border-slate-200 py-3 text-xs font-black uppercase tracking-widest text-slate-800 hover:bg-slate-50"
                  >
                    {editOpen ? t("close") : t("editUnit")}
                  </button>

                  {editOpen && (
                    <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                        {t("editUnit")}
                      </p>
                      <label className="block space-y-1">
                        <span className="text-[10px] font-black uppercase text-slate-400">
                          {t("number")}
                        </span>
                        <input
                          className={bulkInputClass}
                          value={editNumber}
                          onChange={(e) => setEditNumber(e.target.value)}
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="space-y-1">
                          <span className="text-[10px] font-black uppercase text-slate-400">
                            {t("floorLabel")}
                          </span>
                          <input
                            type="text"
                            inputMode="numeric"
                            className={bulkInputClass}
                            value={editFloor}
                            onChange={(e) => setEditFloor(e.target.value)}
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-[10px] font-black uppercase text-slate-400">
                            {t("bulk.rooms")}
                          </span>
                          <input
                            type="text"
                            inputMode="numeric"
                            className={bulkInputClass}
                            value={editRooms}
                            onChange={(e) => setEditRooms(e.target.value)}
                          />
                        </label>
                      </div>
                      <label className="block space-y-1">
                        <span className="text-[10px] font-black uppercase text-slate-400">
                          {t("areaSqm")}
                        </span>
                        <input
                          className={bulkInputClass}
                          inputMode="decimal"
                          value={editArea}
                          onChange={(e) => setEditArea(e.target.value)}
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-[10px] font-black uppercase text-slate-400">
                          {t("bulk.priceUzs")}
                        </span>
                        <input
                          className={bulkInputClass}
                          inputMode="numeric"
                          value={editPrice}
                          onChange={(e) =>
                            setEditPrice(formatMoneyInput(e.target.value))
                          }
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-[10px] font-black uppercase text-slate-400">
                          {t("layoutUrl")}
                        </span>
                        <input
                          className={bulkInputClass}
                          value={editLayoutUrl}
                          onChange={(e) => setEditLayoutUrl(e.target.value)}
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-[10px] font-black uppercase text-slate-400">
                          {t("uploadLayout")}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="text-xs font-medium text-slate-600"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void uploadLayoutFile(f).catch(() => {});
                          }}
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-[10px] font-black uppercase text-slate-400">
                          {t("modelUrl")}
                        </span>
                        <input
                          className={bulkInputClass}
                          value={editModelUrl}
                          onChange={(e) => setEditModelUrl(e.target.value)}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={unitSaving}
                        onClick={() => void saveUnitEdit()}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1E3A8A] py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50"
                      >
                        {unitSaving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : null}
                        {unitSaving ? t("savingUnit") : t("saveUnit")}
                      </button>
                    </div>
                  )}

                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                      {t("status")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(
                        ["AVAILABLE", "RESERVED", "SOLD", "INSTALLMENT", "MORTGAGE", "UNAVAILABLE"] as AptStatus[]
                      ).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => void patchStatus(selected.id, s)}
                          className={`rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-wider border-2 ${
                            selected.status === s
                              ? statusStyle[s]
                              : "border-slate-200 text-slate-500 bg-white"
                          }`}
                        >
                          {STATUS_LABEL[s]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1">
                      <User className="h-3 w-3" /> {t("clients")}
                    </p>
                    {selected.customers?.length ? (
                      <ul className="space-y-3">
                        {selected.customers.map((c) => (
                          <li
                            key={c.id}
                            className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4"
                          >
                            <div className="font-bold text-slate-900">
                              {c.name}
                            </div>
                            <div className="text-xs text-slate-500">
                              {formatPhoneNumber(c.phone)}
                            </div>
                            <div className="mt-2 space-y-1">
                              <p className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-1">
                                <CreditCard className="h-3 w-3" />{" "}
                                {t("payments")}
                              </p>
                              {c.payments?.length ? (
                                c.payments.map((p) => (
                                  <div
                                    key={p.id}
                                    className="text-xs font-medium text-slate-600"
                                  >
                                    {formatUzs(p.amountUzs)} ·{" "}
                                    {new Date(p.paidAt).toLocaleDateString()} ·{" "}
                                    {p.type}
                                  </div>
                                ))
                              ) : (
                                <span className="text-xs text-slate-400">
                                  —
                                </span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-slate-400">{t("noClients")}</p>
                    )}
                  </div>

                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                      {t("recentLeads")}
                    </p>
                    {selected.leads?.length ? (
                      <ul className="space-y-2 text-xs">
                        {selected.leads.map((l) => (
                          <li
                            key={l.id}
                            className="flex justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2"
                          >
                            <span className="font-bold text-slate-800 truncate">
                              {l.name}
                            </span>
                            <span className="shrink-0 text-slate-500">
                              {l.status}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-slate-400">{t("noLeads")}</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {contractModalOpen && selected && (
        <ContractCreateModal
          projectId={projectId}
          apartment={{
            id: selected.id,
            number: selected.number,
            floor: selected.floor,
            sectionKey: selected.sectionKey,
            rooms: selected.rooms,
            areaSqm: selected.areaSqm,
            priceUzs: selected.priceUzs,
          }}
          onClose={() => setContractModalOpen(false)}
          onCreated={() => {
            setContractModalOpen(false);
            setSelected(null);
            void load();
          }}
        />
      )}
    </div>
  );
}
