"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Copy,
  Loader2,
  RefreshCw,
  Users,
  Pencil,
  X,
  CreditCard,
  Search,
  AlertTriangle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { formatMoneyInput, formatUzs, parseMoneyInput } from "@/lib/currency";
import { formatPhoneInput, formatPhoneNumber, phoneDigitsOnly } from "@/lib/format";
import { hasUltimateWorkspaceAccess } from "@/lib/subscription-access";
import { contractsApi } from "@/lib/crm-api";

type ApartmentOpt = {
  id: number;
  number: string;
  floor: number;
  sectionKey?: string | null;
};

type CustomerFinance = {
  contractId: number;
  contractNumber: string;
  status: string;
  totalPriceUzs: number;
  paidUzs: number;
  remainingUzs: number;
  debtUzs: number;
};

type CustomerRow = {
  id: number;
  name: string;
  phone: string;
  accessCode: string;
  apartmentId: number | null;
  totalPriceUzs: number | null;
  monthlyDueUzs: number | null;
  notes: string | null;
  apartment: {
    id: number;
    number: string;
    floor: number;
    sectionKey?: string | null;
  } | null;
  finance?: CustomerFinance | null;
};

type CustomerFilter = "all" | "debtors" | "installment" | "paid";

type ListResponse = {
  items: CustomerRow[];
  total: number;
};

type CustomerPayment = {
  id: number;
  amountUzs: number;
  paidAt: string;
  comment: string | null;
  type: string;
};

type CustomerDetail = CustomerRow & {
  payments: CustomerPayment[];
};

function aptLabel(a: ApartmentOpt) {
  const sk = (a.sectionKey ?? "").trim();
  return sk ? `${sk} · №${a.number} (${a.floor} эт.)` : `№${a.number} (${a.floor} эт.)`;
}

export default function ProjectCustomersPage() {
  const params = useParams();
  const projectId = Number(params.id);
  const t = useTranslations("Dashboard.customers");

  const [projectName, setProjectName] = useState("");
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [searchText, setSearchText] = useState("");
  const [filterMode, setFilterMode] = useState<CustomerFilter>("all");
  const [apartments, setApartments] = useState<ApartmentOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [planLocked, setPlanLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [createName, setCreateName] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createAptId, setCreateAptId] = useState<string>("");
  const [createTotal, setCreateTotal] = useState("");
  const [createMonthly, setCreateMonthly] = useState("");
  const [createNotes, setCreateNotes] = useState("");

  const [editId, setEditId] = useState<number | null>(null);
  const editRow = useMemo(
    () => rows.find((r) => r.id === editId) ?? null,
    [rows, editId],
  );

  const debtorsCount = useMemo(
    () => rows.filter((r) => (r.finance?.debtUzs ?? 0) > 0).length,
    [rows],
  );

  const filteredRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return rows.filter((r) => {
      if (q) {
        const matchName = r.name.toLowerCase().includes(q);
        const matchPhone = digits
          ? r.phone.replace(/\D/g, "").includes(digits)
          : false;
        const matchApt = r.apartment
          ? String(r.apartment.number).toLowerCase().includes(q)
          : false;
        if (!matchName && !matchPhone && !matchApt) return false;
      }
      const f = r.finance;
      if (filterMode === "debtors") return !!f && f.debtUzs > 0;
      if (filterMode === "paid") return !!f && f.remainingUzs <= 0;
      if (filterMode === "installment")
        return !!f && f.remainingUzs > 0 && f.status !== "COMPLETED";
      return true;
    });
  }, [rows, searchText, filterMode]);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editAptId, setEditAptId] = useState<string>("");
  const [editTotal, setEditTotal] = useState("");
  const [editMonthly, setEditMonthly] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const [payOpenId, setPayOpenId] = useState<number | null>(null);
  const [payDetail, setPayDetail] = useState<CustomerDetail | null>(null);
  const [payLoading, setPayLoading] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [payComment, setPayComment] = useState("");
  const [payContractId, setPayContractId] = useState<number | null>(null);
  const [payContractNumber, setPayContractNumber] = useState<string | null>(null);

  useEffect(() => {
    if (!editRow) return;
    setEditName(editRow.name);
    setEditPhone(formatPhoneInput(editRow.phone));
    setEditAptId(editRow.apartmentId != null ? String(editRow.apartmentId) : "");
    setEditTotal(
      editRow.totalPriceUzs != null
        ? formatMoneyInput(String(editRow.totalPriceUzs))
        : "",
    );
    setEditMonthly(
      editRow.monthlyDueUzs != null
        ? formatMoneyInput(String(editRow.monthlyDueUzs))
        : "",
    );
    setEditNotes(editRow.notes ?? "");
  }, [editRow]);

  const loadPayDetail = useCallback(
    async (customerId: number) => {
      setPayLoading(true);
      try {
        const d = await apiFetch<CustomerDetail>(
          `/projects/${projectId}/customers/${customerId}`,
        );
        setPayDetail(d);
      } catch {
        setError(t("loadError"));
      } finally {
        setPayLoading(false);
      }
    },
    [projectId, t],
  );

  useEffect(() => {
    if (payOpenId == null) {
      setPayDetail(null);
      setPayContractId(null);
      setPayContractNumber(null);
      return;
    }
    void loadPayDetail(payOpenId);

    // Find linked contract for this customer's apartment to sync payments
    const customer = rows.find((r) => r.id === payOpenId);
    if (customer?.apartmentId) {
      void (async () => {
        try {
          const res = await contractsApi.list(projectId, { limit: "200" });
          const linked = res.items.find(
            (c) => c.apartment?.id === customer.apartmentId,
          );
          if (linked) {
            setPayContractId(linked.id);
            setPayContractNumber(linked.number);
          }
        } catch {
          /* non-fatal */
        }
      })();
    }
  }, [payOpenId, loadPayDetail, rows, projectId]);

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
        setRows([]);
        setApartments([]);
        return;
      }
      const [listRes, aptRes] = await Promise.all([
        apiFetch<ListResponse>(`/projects/${projectId}/customers?limit=200`),
        apiFetch<{ items: ApartmentOpt[] }>(
          `/projects/${projectId}/apartments?limit=500`,
        ),
      ]);
      setRows(listRes.items ?? []);
      setApartments(aptRes.items ?? []);
    } catch {
      setError(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [projectId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setNotice(t("copied"));
      setTimeout(() => setNotice(null), 2500);
    } catch {
      setNotice(t("copyFail"));
      setTimeout(() => setNotice(null), 2500);
    }
  };

  const regenerate = async (customerId: number) => {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch<{ accessCode: string }>(
        `/projects/${projectId}/customers/${customerId}/access-code`,
        { method: "POST", body: "{}" },
      );
      setRows((prev) =>
        prev.map((r) =>
          r.id === customerId ? { ...r, accessCode: res.accessCode } : r,
        ),
      );
      setNotice(t("regenerated"));
      setTimeout(() => setNotice(null), 2500);
    } catch {
      setError(t("regenerateError"));
    } finally {
      setSaving(false);
    }
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name: createName.trim(),
        phone: phoneDigitsOnly(createPhone) || createPhone.trim(),
        ...(createAptId ? { apartmentId: Number(createAptId) } : {}),
        ...(createTotal.trim()
          ? { totalPriceUzs: parseMoneyInput(createTotal) }
          : {}),
        ...(createMonthly.trim()
          ? { monthlyDueUzs: parseMoneyInput(createMonthly) }
          : {}),
        ...(createNotes.trim() ? { notes: createNotes.trim() } : {}),
      };
      await apiFetch(`/projects/${projectId}/customers`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setCreateName("");
      setCreatePhone("");
      setCreateAptId("");
      setCreateTotal("");
      setCreateMonthly("");
      setCreateNotes("");
      await load();
      setNotice(t("created"));
      setTimeout(() => setNotice(null), 2500);
    } catch {
      setError(t("saveError"));
    } finally {
      setSaving(false);
    }
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editId) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name: editName.trim(),
        phone: phoneDigitsOnly(editPhone) || editPhone.trim(),
        apartmentId: editAptId ? Number(editAptId) : null,
        totalPriceUzs: editTotal.trim() ? parseMoneyInput(editTotal) : null,
        monthlyDueUzs: editMonthly.trim()
          ? parseMoneyInput(editMonthly)
          : null,
        notes: editNotes.trim() || null,
      };
      await apiFetch(`/projects/${projectId}/customers/${editId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setEditId(null);
      await load();
      setNotice(t("saved"));
      setTimeout(() => setNotice(null), 2500);
    } catch {
      setError(t("saveError"));
    } finally {
      setSaving(false);
    }
  };

  const submitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (payOpenId == null || !payAmount.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const paidAt = new Date(payDate);
      paidAt.setHours(12, 0, 0, 0);
      const amountUzs = parseMoneyInput(payAmount);
      const paidAtIso = paidAt.toISOString();
      const commentBody = payComment.trim()
        ? { comment: payComment.trim() }
        : {};

      if (payContractId) {
        // Linked to a contract → record once through the contract so it is
        // counted in the contract balance, analytics AND the buyer cabinet
        // (the payment is tied to the same customer). Avoids double-counting.
        await contractsApi.addPayment(projectId, payContractId, {
          amountUzs,
          paidAt: paidAtIso,
          type: "INSTALLMENT",
          ...commentBody,
        });
      } else {
        // No linked contract → standalone customer payment.
        await apiFetch(
          `/projects/${projectId}/customers/${payOpenId}/payments`,
          {
            method: "POST",
            body: JSON.stringify({
              amountUzs,
              paidAt: paidAtIso,
              ...commentBody,
            }),
          },
        );
      }

      setPayAmount("");
      setPayComment("");
      await loadPayDetail(payOpenId);
      await load();
      setNotice(t("paymentAdded"));
      setTimeout(() => setNotice(null), 2500);
    } catch {
      setError(t("paymentError"));
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-[#1E3A8A]/15";

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
    <div className="mx-auto max-w-6xl space-y-10 pb-24 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
        <Link
          href={`/dashboard/projects/${projectId}/chessboard`}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50"
        >
          {t("openChessboard")}
        </Link>
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

      <section className="rounded-[2rem] border border-slate-100 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <Users className="h-6 w-6 text-[#1E3A8A]" />
          <h2 className="text-lg font-black text-slate-900">{t("createTitle")}</h2>
        </div>
        <form onSubmit={submitCreate} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1 sm:col-span-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              {t("name")}
            </span>
            <input
              className={inputClass}
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              required
              minLength={2}
            />
          </label>
          <label className="space-y-1 sm:col-span-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              {t("phone")}
            </span>
            <input
              className={inputClass}
              value={createPhone}
              onChange={(e) => setCreatePhone(formatPhoneInput(e.target.value))}
              required
              placeholder="+998 __ ___ __ __"
              autoComplete="tel"
            />
          </label>
          <label className="space-y-1 sm:col-span-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              {t("apartment")}
            </span>
            <select
              className={inputClass}
              value={createAptId}
              onChange={(e) => setCreateAptId(e.target.value)}
            >
              <option value="">{t("apartmentOptional")}</option>
              {apartments.map((a) => (
                <option key={a.id} value={a.id}>
                  {aptLabel(a)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              {t("totalPrice")}
            </span>
            <input
              className={inputClass}
              inputMode="numeric"
              value={createTotal}
              onChange={(e) =>
                setCreateTotal(formatMoneyInput(e.target.value))
              }
              placeholder="0"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              {t("monthlyDue")}
            </span>
            <input
              className={inputClass}
              inputMode="numeric"
              value={createMonthly}
              onChange={(e) =>
                setCreateMonthly(formatMoneyInput(e.target.value))
              }
              placeholder="0"
            />
          </label>
          <label className="space-y-1 sm:col-span-2 lg:col-span-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              {t("notes")}
            </span>
            <input
              className={inputClass}
              value={createNotes}
              onChange={(e) => setCreateNotes(e.target.value)}
            />
          </label>
          <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#1E3A8A] px-8 py-3 text-sm font-black uppercase tracking-widest text-white shadow-lg disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("createBtn")}
            </button>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-black text-slate-900">{t("listTitle")}</h2>
          <p className="text-xs font-medium text-slate-500">{t("listHint")}</p>

          {/* Search + filters */}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Поиск по имени, телефону, квартире…"
                className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm font-medium text-slate-900 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-[#1E3A8A]/15"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { key: "all", label: "Все" },
                  { key: "debtors", label: `Должники${debtorsCount ? ` (${debtorsCount})` : ""}` },
                  { key: "installment", label: "В рассрочке" },
                  { key: "paid", label: "Оплачено" },
                ] as { key: CustomerFilter; label: string }[]
              ).map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilterMode(f.key)}
                  className={`inline-flex items-center gap-1 rounded-xl px-3 py-2 text-[11px] font-black uppercase tracking-widest transition ${
                    filterMode === f.key
                      ? f.key === "debtors"
                        ? "bg-red-500 text-white"
                        : "bg-[#1E3A8A] text-white"
                      : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {f.key === "debtors" ? (
                    <AlertTriangle className="h-3 w-3" />
                  ) : null}
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
              <tr>
                <th className="px-4 py-4">{t("name")}</th>
                <th className="px-4 py-4">{t("phone")}</th>
                <th className="px-4 py-4">{t("apartmentShort")}</th>
                <th className="px-4 py-4">Финансы</th>
                <th className="px-4 py-4">{t("accessCode")}</th>
                <th className="px-4 py-4">{t("monthlyDueShort")}</th>
                <th className="px-4 py-4 text-right">{t("actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredRows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-bold text-slate-900">{r.name}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatPhoneNumber(r.phone)}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {r.apartment
                      ? `${(r.apartment.sectionKey ?? "").trim() ? `${r.apartment.sectionKey} · ` : ""}№${r.apartment.number}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {r.finance ? (
                      <div className="space-y-0.5">
                        {r.finance.debtUzs > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2 py-0.5 text-[11px] font-black text-red-600">
                            <AlertTriangle className="h-3 w-3" />
                            Долг {formatUzs(r.finance.debtUzs)}
                          </span>
                        ) : r.finance.remainingUzs <= 0 ? (
                          <span className="inline-flex rounded-lg bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-700">
                            Оплачено
                          </span>
                        ) : (
                          <span className="inline-flex rounded-lg bg-amber-50 px-2 py-0.5 text-[11px] font-black text-amber-700">
                            Остаток {formatUzs(r.finance.remainingUzs)}
                          </span>
                        )}
                        <p className="text-[10px] text-slate-400">
                          №{r.finance.contractNumber}
                        </p>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-black tracking-wider">
                        {r.accessCode}
                      </code>
                      <button
                        type="button"
                        onClick={() => void copyCode(r.accessCode)}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                        title={t("copy")}
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {r.monthlyDueUzs != null ? formatUzs(r.monthlyDueUzs) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setPayOpenId(r.id)}
                        className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-900 hover:bg-emerald-100"
                      >
                        <CreditCard className="h-3 w-3" /> {t("payments")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditId(r.id)}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50"
                      >
                        <Pencil className="h-3 w-3" /> {t("edit")}
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void regenerate(r.id)}
                        className="inline-flex items-center gap-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                      >
                        <RefreshCw className="h-3 w-3" /> {t("regenerate")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-16 text-center text-slate-400 font-medium"
                  >
                    {rows.length === 0 ? t("empty") : "Ничего не найдено"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {payOpenId != null && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[2rem] bg-white p-8 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-xl font-black text-[#1E3A8A]">
                {t("paymentsTitle")}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setPayOpenId(null);
                  setPayDetail(null);
                }}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
                aria-label={t("close")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {payLoading || !payDetail ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-10 w-10 animate-spin text-[#1E3A8A]" />
              </div>
            ) : (
              <>
                <p className="mb-4 text-sm font-bold text-slate-800">
                  {payDetail.name}{" "}
                  <span className="font-medium text-slate-500">
                    · {formatPhoneNumber(payDetail.phone)}
                  </span>
                </p>
                <p className="mb-6 text-xs font-medium text-slate-500">
                  {t("paymentsHint")}
                </p>
                <form onSubmit={submitPayment} className="mb-8 space-y-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                    {t("paymentAdd")}
                  </p>
                  {payContractNumber && (
                    <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-800">
                      Оплата будет учтена в договоре №{payContractNumber} и отразится в аналитике
                    </p>
                  )}
                  <label className="block space-y-1">
                    <span className="text-[10px] font-black uppercase text-slate-500">
                      {t("paymentAmount")}
                    </span>
                    <input
                      className={inputClass}
                      inputMode="numeric"
                      value={payAmount}
                      onChange={(e) =>
                        setPayAmount(formatMoneyInput(e.target.value))
                      }
                      required
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[10px] font-black uppercase text-slate-500">
                      {t("paymentDate")}
                    </span>
                    <input
                      type="date"
                      className={inputClass}
                      value={payDate}
                      onChange={(e) => setPayDate(e.target.value)}
                      required
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[10px] font-black uppercase text-slate-500">
                      {t("paymentComment")}
                    </span>
                    <input
                      className={inputClass}
                      value={payComment}
                      onChange={(e) => setPayComment(e.target.value)}
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1E3A8A] py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    {t("paymentSubmit")}
                  </button>
                </form>
                <div>
                  <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                    {t("paymentsList")}
                  </p>
                  {payDetail.payments?.length ? (
                    <ul className="max-h-48 space-y-2 overflow-y-auto">
                      {payDetail.payments.map((p) => (
                        <li
                          key={p.id}
                          className="flex justify-between gap-2 rounded-xl border border-slate-100 bg-white px-3 py-2 text-sm"
                        >
                          <span className="font-black text-slate-900">
                            {formatUzs(p.amountUzs)}
                          </span>
                          <span className="shrink-0 text-xs text-slate-500">
                            {new Date(p.paidAt).toLocaleDateString()}{" "}
                            {p.comment ? `· ${p.comment}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-400">{t("paymentsEmpty")}</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {editId != null && editRow && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[2rem] bg-white p-8 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-xl font-black text-[#1E3A8A]">{t("editTitle")}</h3>
              <button
                type="button"
                onClick={() => setEditId(null)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
                aria-label={t("close")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={submitEdit} className="space-y-4">
              <label className="block space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  {t("name")}
                </span>
                <input
                  className={inputClass}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  {t("phone")}
                </span>
                <input
                  className={inputClass}
                  value={editPhone}
                  onChange={(e) =>
                    setEditPhone(formatPhoneInput(e.target.value))
                  }
                  required
                  autoComplete="tel"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  {t("apartment")}
                </span>
                <select
                  className={inputClass}
                  value={editAptId}
                  onChange={(e) => setEditAptId(e.target.value)}
                >
                  <option value="">{t("apartmentClear")}</option>
                  {apartments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {aptLabel(a)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  {t("totalPrice")}
                </span>
                <input
                  className={inputClass}
                  inputMode="numeric"
                  value={editTotal}
                  onChange={(e) =>
                    setEditTotal(formatMoneyInput(e.target.value))
                  }
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  {t("monthlyDue")}
                </span>
                <input
                  className={inputClass}
                  inputMode="numeric"
                  value={editMonthly}
                  onChange={(e) =>
                    setEditMonthly(formatMoneyInput(e.target.value))
                  }
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  {t("notes")}
                </span>
                <input
                  className={inputClass}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                />
              </label>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditId(null)}
                  className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-black uppercase tracking-widest text-slate-600"
                >
                  {t("cancel")}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#1E3A8A] py-3 text-sm font-black uppercase tracking-widest text-white disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {t("save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
