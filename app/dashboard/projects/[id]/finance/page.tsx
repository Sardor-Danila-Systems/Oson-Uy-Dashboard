"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Wallet,
  TrendingUp,
  TrendingDown,
  PiggyBank,
  ArrowRightLeft,
  Trash2,
  Plus,
  AlertTriangle,
  History,
} from "lucide-react";
import {
  financeApi,
  KassaSummary,
  ExpenseRow,
  IncomeRow,
  DebtorsResponse,
  AuditRow,
  PayMethod,
} from "@/lib/crm-api";
import { apiFetch } from "@/lib/api";
import { hasUltimateWorkspaceAccess } from "@/lib/subscription-access";
import { formatMoneyInput, parseMoneyInput } from "@/lib/currency";

const METHOD_LABEL: Record<PayMethod, string> = {
  CASH: "Наличные",
  CARD: "Карта",
  P2P: "P2P",
  BANK: "Банк",
};
const METHOD_STYLE: Record<PayMethod, string> = {
  CASH: "bg-emerald-600",
  CARD: "bg-teal-600",
  P2P: "bg-blue-600",
  BANK: "bg-orange-600",
};
const KASSA_COLOR: Record<PayMethod, string> = {
  CASH: "text-emerald-700",
  CARD: "text-teal-700",
  P2P: "text-blue-700",
  BANK: "text-orange-700",
};
const EXPENSE_CATS = ["Стройматериалы", "Работы", "Техника", "ФОТ", "Хозяйственные", "Прочее"];

function fmt(v: string | number | null | undefined) {
  if (v == null) return "0";
  return Number(v).toLocaleString("ru-RU");
}
function shortB(v: string | number) {
  const n = Number(v);
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} млрд`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн`;
  return fmt(n);
}

type Tab = "kassa" | "income" | "expense" | "debtors" | "audit";

export default function FinancePage() {
  const params = useParams();
  const projectId = Number(params.id);

  const [tab, setTab] = useState<Tab>("kassa");
  const [loading, setLoading] = useState(true);
  const [planLocked, setPlanLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [summary, setSummary] = useState<KassaSummary | null>(null);
  const [income, setIncome] = useState<IncomeRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [debtors, setDebtors] = useState<DebtorsResponse | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);

  // transfer form
  const [trFrom, setTrFrom] = useState<PayMethod>("CASH");
  const [trTo, setTrTo] = useState<PayMethod>("BANK");
  const [trSum, setTrSum] = useState("");
  const [trBusy, setTrBusy] = useState(false);

  // expense form
  const [exTitle, setExTitle] = useState("");
  const [exCat, setExCat] = useState(EXPENSE_CATS[0]);
  const [exSum, setExSum] = useState("");
  const [exMethod, setExMethod] = useState<PayMethod>("CASH");
  const [exDate, setExDate] = useState(new Date().toISOString().split("T")[0]);
  const [exBusy, setExBusy] = useState(false);

  const flash = (m: string) => {
    setNotice(m);
    setTimeout(() => setNotice(null), 2500);
  };

  const load = useCallback(async () => {
    try {
      const proj = await apiFetch<{ subscription?: { plan: string; status: string } }>(
        `/projects/${projectId}`,
      );
      if (!hasUltimateWorkspaceAccess(proj.subscription)) {
        setPlanLocked(true);
        return;
      }
      const [s, i, e, d, a] = await Promise.all([
        financeApi.summary(projectId),
        financeApi.income(projectId),
        financeApi.expenses(projectId),
        financeApi.debtors(projectId),
        financeApi.audit(projectId),
      ]);
      setSummary(s);
      setIncome(i);
      setExpenses(e);
      setDebtors(d);
      setAudit(a);
    } catch {
      setError("Не удалось загрузить финансовые данные");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const doTransfer = async () => {
    const amountUzs = parseMoneyInput(trSum);
    if (!amountUzs || trFrom === trTo) {
      setError("Выберите разные кассы и сумму");
      setTimeout(() => setError(null), 2500);
      return;
    }
    setTrBusy(true);
    try {
      await financeApi.transfer(projectId, { fromMethod: trFrom, toMethod: trTo, amountUzs });
      setTrSum("");
      setSummary(await financeApi.summary(projectId));
      setAudit(await financeApi.audit(projectId));
      flash(`Переведено ${fmt(amountUzs)} сум: ${METHOD_LABEL[trFrom]} → ${METHOD_LABEL[trTo]}`);
    } catch {
      setError("Ошибка перевода");
      setTimeout(() => setError(null), 2500);
    } finally {
      setTrBusy(false);
    }
  };

  const addExpense = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const amountUzs = parseMoneyInput(exSum);
    if (!exTitle.trim() || !amountUzs) return;
    setExBusy(true);
    try {
      await financeApi.addExpense(projectId, {
        title: exTitle.trim(),
        category: exCat,
        amountUzs,
        method: exMethod,
        spentAt: exDate,
      });
      setExTitle("");
      setExSum("");
      const [e2, s2, a2] = await Promise.all([
        financeApi.expenses(projectId),
        financeApi.summary(projectId),
        financeApi.audit(projectId),
      ]);
      setExpenses(e2);
      setSummary(s2);
      setAudit(a2);
      flash("Расход добавлен");
    } catch {
      setError("Не удалось добавить расход");
      setTimeout(() => setError(null), 2500);
    } finally {
      setExBusy(false);
    }
  };

  const removeExpense = async (id: number) => {
    if (!confirm("Удалить расход?")) return;
    await financeApi.removeExpense(projectId, id);
    setExpenses((p) => p.filter((e) => e.id !== id));
    setSummary(await financeApi.summary(projectId));
    flash("Расход удалён");
  };

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
        <Wallet className="h-12 w-12 text-[#1E3A8A]" />
        <h1 className="text-2xl font-black text-[#1E3A8A]">Финансы — только на тарифе Ultra</h1>
        <p className="text-sm font-medium text-slate-600">
          Кассы, расходы, должники и история изменений доступны на тарифе Ultra (ULTIMATE).
        </p>
        <Link
          href="/dashboard/subscriptions"
          className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#1E3A8A] px-8 text-sm font-black uppercase tracking-widest text-white"
        >
          Перейти на Ultra
        </Link>
      </div>
    );
  }

  const inputCls =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-[#1E3A8A]";
  const labelCls =
    "block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5";

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
        <span className="text-sm font-black text-[#1E3A8A]">Финансы</span>
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

      {/* Totals */}
      {summary && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
            <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <TrendingUp className="h-3.5 w-3.5" /> Доходы
            </p>
            <p className="mt-1 text-xl font-black text-slate-900">{shortB(summary.totalIncome)} сум</p>
          </div>
          <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
            <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <TrendingDown className="h-3.5 w-3.5" /> Расходы
            </p>
            <p className="mt-1 text-xl font-black text-red-600">{shortB(summary.totalExpense)} сум</p>
          </div>
          <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
            <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <PiggyBank className="h-3.5 w-3.5" /> Прибыль
            </p>
            <p className={`mt-1 text-xl font-black ${Number(summary.profit) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {shortB(summary.profit)} сум
            </p>
          </div>
          <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
            <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <AlertTriangle className="h-3.5 w-3.5" /> Просроченный долг
            </p>
            <p className="mt-1 text-xl font-black text-orange-600">
              {debtors ? shortB(debtors.totalDebt) : "0"} сум
            </p>
            <p className="text-[11px] font-bold text-slate-400">{debtors?.count ?? 0} должников</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="inline-flex flex-wrap gap-1 rounded-2xl border border-slate-100 bg-white p-1.5 shadow-sm">
        {(
          [
            ["kassa", "Кассы", Wallet],
            ["income", "Доходы", TrendingUp],
            ["expense", "Расходы", TrendingDown],
            ["debtors", "Должники", AlertTriangle],
            ["audit", "История изменений", History],
          ] as [Tab, string, typeof Wallet][]
        ).map(([t, label, Icon]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wide transition ${
              tab === t ? "bg-[#1E3A8A] text-white shadow" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Kassa ── */}
      {tab === "kassa" && summary && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {(Object.keys(METHOD_LABEL) as PayMethod[]).map((m) => (
              <div key={m} className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
                <p className={`text-xs font-black uppercase tracking-widest ${KASSA_COLOR[m]}`}>
                  ● {METHOD_LABEL[m]}
                </p>
                <p className="mt-2 text-lg font-black text-slate-900">
                  {fmt(summary.kassa[m]?.balance)} <span className="text-xs text-slate-400">сум</span>
                </p>
                <p className="mt-1 text-[11px] font-bold text-slate-400">
                  приход {shortB(summary.kassa[m]?.income ?? 0)} · расход {shortB(summary.kassa[m]?.expense ?? 0)}
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
            <p className="mb-4 flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-[#1E3A8A]">
              <ArrowRightLeft className="h-4 w-4" /> Перевод между кассами
            </p>
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <label className={labelCls}>Из кассы</label>
                <select className={inputCls} value={trFrom} onChange={(e) => setTrFrom(e.target.value as PayMethod)}>
                  {(Object.keys(METHOD_LABEL) as PayMethod[]).map((m) => (
                    <option key={m} value={m}>{METHOD_LABEL[m]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>В кассу</label>
                <select className={inputCls} value={trTo} onChange={(e) => setTrTo(e.target.value as PayMethod)}>
                  {(Object.keys(METHOD_LABEL) as PayMethod[]).map((m) => (
                    <option key={m} value={m}>{METHOD_LABEL[m]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Сумма, сум</label>
                <input
                  className={inputCls}
                  inputMode="numeric"
                  value={trSum}
                  onChange={(e) => setTrSum(formatMoneyInput(e.target.value))}
                  placeholder="10 000 000"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => void doTransfer()}
                  disabled={trBusy}
                  className="h-[42px] w-full rounded-xl bg-[#1E3A8A] text-sm font-black text-white hover:bg-blue-900 disabled:opacity-50"
                >
                  {trBusy ? "…" : "Перевести"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Income ── */}
      {tab === "income" && (
        <div className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-4 py-3.5">Дата</th>
                  <th className="px-4 py-3.5">Клиент</th>
                  <th className="px-4 py-3.5">Договор</th>
                  <th className="px-4 py-3.5 text-right">Сумма</th>
                  <th className="px-4 py-3.5">Касса</th>
                  <th className="px-4 py-3.5">Комментарий</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {income.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(p.paidAt).toLocaleDateString("ru-RU")}
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-900">{p.customer?.name ?? "—"}</td>
                    <td className="px-4 py-3">
                      {p.contract ? (
                        <Link
                          href={`/dashboard/projects/${projectId}/contracts/${p.contract.id}`}
                          className="font-black text-[#1E3A8A] hover:underline"
                        >
                          №{p.contract.number}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-black text-emerald-600">
                      +{fmt(p.amountUzs)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-lg px-2 py-1 text-[10px] font-black text-white ${METHOD_STYLE[p.method] ?? "bg-slate-400"}`}>
                        {METHOD_LABEL[p.method] ?? p.method}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{p.comment ?? ""}</td>
                  </tr>
                ))}
                {income.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-14 text-center font-medium text-slate-400">Оплат пока нет</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Expenses ── */}
      {tab === "expense" && (
        <>
          <form
            onSubmit={addExpense}
            className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm"
          >
            <p className="mb-4 flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-[#1E3A8A]">
              <Plus className="h-4 w-4" /> Добавить расход
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="lg:col-span-2">
                <label className={labelCls}>Назначение</label>
                <input className={inputCls} value={exTitle} onChange={(e) => setExTitle(e.target.value)} placeholder="Бетон 300М · 38 куб" required />
              </div>
              <div>
                <label className={labelCls}>Категория</label>
                <select className={inputCls} value={exCat} onChange={(e) => setExCat(e.target.value)}>
                  {EXPENSE_CATS.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Сумма, сум</label>
                <input className={inputCls} inputMode="numeric" value={exSum} onChange={(e) => setExSum(formatMoneyInput(e.target.value))} placeholder="19 950 000" required />
              </div>
              <div>
                <label className={labelCls}>Касса</label>
                <select className={inputCls} value={exMethod} onChange={(e) => setExMethod(e.target.value as PayMethod)}>
                  {(Object.keys(METHOD_LABEL) as PayMethod[]).map((m) => (
                    <option key={m} value={m}>{METHOD_LABEL[m]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Дата</label>
                <input type="date" className={inputCls} value={exDate} onChange={(e) => setExDate(e.target.value)} />
              </div>
              <div className="flex items-end lg:col-span-2">
                <button
                  type="submit"
                  disabled={exBusy}
                  className="h-[42px] w-full rounded-xl bg-[#F97316] text-sm font-black text-white hover:bg-orange-600 disabled:opacity-50"
                >
                  {exBusy ? "Сохранение…" : "Добавить расход"}
                </button>
              </div>
            </div>
          </form>

          <div className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <tr>
                    <th className="px-4 py-3.5">Дата</th>
                    <th className="px-4 py-3.5">Назначение</th>
                    <th className="px-4 py-3.5">Категория</th>
                    <th className="px-4 py-3.5 text-right">Сумма</th>
                    <th className="px-4 py-3.5">Касса</th>
                    <th className="px-4 py-3.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {expenses.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 text-slate-500">
                        {new Date(e.spentAt).toLocaleDateString("ru-RU")}
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-900">{e.title}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase text-slate-600">
                          {e.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-black text-red-600">−{fmt(e.amountUzs)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-lg px-2 py-1 text-[10px] font-black text-white ${METHOD_STYLE[e.method]}`}>
                          {METHOD_LABEL[e.method]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => void removeExpense(e.id)}
                          className="rounded-xl p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {expenses.length === 0 && (
                    <tr><td colSpan={6} className="px-6 py-14 text-center font-medium text-slate-400">Расходов пока нет — добавьте первый выше</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Debtors ── */}
      {tab === "debtors" && debtors && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {(
              [
                ["0–30 дней", debtors.buckets.d30, "text-amber-600"],
                ["31–60 дней", debtors.buckets.d60, "text-orange-600"],
                ["61–90 дней", debtors.buckets.d90, "text-red-500"],
                ["Более 90 дней", debtors.buckets.d90p, "text-red-700"],
              ] as [string, string, string][]
            ).map(([t, v, c]) => (
              <div key={t} className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t}</p>
                <p className={`mt-1 text-lg font-black ${c}`}>{shortB(v)} сум</p>
              </div>
            ))}
          </div>
          <div className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <tr>
                    <th className="px-4 py-3.5">Клиент</th>
                    <th className="px-4 py-3.5">Договор</th>
                    <th className="px-4 py-3.5 text-right">Просроченный долг</th>
                    <th className="px-4 py-3.5">Просрочка</th>
                    <th className="px-4 py-3.5">Оплачено</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {debtors.rows.map((d) => {
                    const pct = Math.min(100, Math.round((Number(d.paidUzs) / Math.max(1, Number(d.totalUzs))) * 100));
                    return (
                      <tr key={d.contractId} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3">
                          <p className="font-bold text-slate-900">{d.customer.name}</p>
                          <p className="text-xs text-slate-400">{d.customer.phone}</p>
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/dashboard/projects/${projectId}/contracts/${d.contractId}`}
                            className="font-black text-[#1E3A8A] hover:underline"
                          >
                            №{d.number}
                          </Link>
                          <p className="text-xs text-slate-400">кв. {d.apartment}</p>
                        </td>
                        <td className="px-4 py-3 text-right font-black text-red-600">{fmt(d.debtUzs)}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${d.overdueDays > 30 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                            {d.overdueDays} дн.
                          </span>
                        </td>
                        <td className="px-4 py-3" style={{ minWidth: 140 }}>
                          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-[#F97316]" style={{ width: `${pct}%` }} />
                          </div>
                          <p className="mt-1 text-[10px] font-bold text-slate-400">{pct}%</p>
                        </td>
                      </tr>
                    );
                  })}
                  {debtors.rows.length === 0 && (
                    <tr><td colSpan={5} className="px-6 py-14 text-center font-medium text-slate-400">Просроченных платежей нет 🎉</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Audit ── */}
      {tab === "audit" && (
        <div className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-4 py-3.5">Когда</th>
                  <th className="px-4 py-3.5">Что изменилось</th>
                  <th className="px-4 py-3.5">Тип</th>
                  <th className="px-4 py-3.5">Сотрудник</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {audit.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/60">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                      {new Date(a.createdAt).toLocaleDateString("ru-RU")}{" "}
                      {new Date(a.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">{a.summary}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${
                        a.action === "DELETED" ? "bg-red-100 text-red-700"
                        : a.action === "CREATED" ? "bg-emerald-100 text-emerald-700"
                        : "bg-blue-100 text-blue-700"}`}>
                        {a.action === "CREATED" ? "Создание" : a.action === "DELETED" ? "Удаление" : "Изменение"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-bold text-slate-600">{a.developer?.name ?? "—"}</td>
                  </tr>
                ))}
                {audit.length === 0 && (
                  <tr><td colSpan={4} className="px-6 py-14 text-center font-medium text-slate-400">История пуста — изменения появятся здесь автоматически</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
