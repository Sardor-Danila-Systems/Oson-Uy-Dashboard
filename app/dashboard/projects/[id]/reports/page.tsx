"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
  Area, AreaChart,
} from "recharts";
import { contractsApi, ProjectStats, ForecastItem, ApartmentStatus } from "@/lib/crm-api";

const STATUS_LABEL: Record<ApartmentStatus, string> = {
  AVAILABLE:   "Свободна",
  RESERVED:    "Забронирована",
  SOLD:        "Продана",
  INSTALLMENT: "В рассрочке",
  MORTGAGE:    "В ипотеке",
  UNAVAILABLE: "Недоступна",
};
const PIE_COLORS: Record<ApartmentStatus, string> = {
  AVAILABLE:   "#10b981",
  RESERVED:    "#f59e0b",
  SOLD:        "#ef4444",
  INSTALLMENT: "#3b82f6",
  MORTGAGE:    "#8b5cf6",
  UNAVAILABLE: "#94a3b8",
};
const METHOD_META: Record<string, { label: string; color: string }> = {
  CASH: { label: "Наличные", color: "#10b981" },
  P2P:  { label: "Карта / P2P", color: "#3b82f6" },
  BANK: { label: "Банк", color: "#F97316" },
};

function fmt(v: string | number) {
  const n = Number(v);
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} млрд`;
  if (Math.abs(n) >= 1_000_000)     return `${(n / 1_000_000).toFixed(0)} млн`;
  return n.toLocaleString("ru-RU");
}
const mLabel = (v: unknown) => {
  const [y, m] = String(v ?? "").split("-");
  return y && m ? `${m}.${y.slice(2)}` : String(v ?? "");
};

const card = "rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm";
const h2 = "text-sm font-black text-slate-900 mb-4 uppercase tracking-wide";

export default function ReportsPage() {
  const params = useParams();
  const projectId = Number(params.id);

  const [stats, setStats]       = useState<ProjectStats | null>(null);
  const [forecast, setForecast] = useState<ForecastItem[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([
      contractsApi.stats(projectId),
      contractsApi.forecast(projectId, 6),
    ]).then(([s, f]) => {
      setStats(s);
      setForecast(f);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#1E3A8A] border-t-transparent" />
      </div>
    );
  }
  if (!stats) return null;

  const pieData = (Object.keys(stats.apartmentsByStatus) as ApartmentStatus[])
    .filter((s) => (stats.apartmentsByStatus[s] ?? 0) > 0)
    .map((s) => ({
      name:  STATUS_LABEL[s] ?? s,
      value: stats.apartmentsByStatus[s] ?? 0,
      color: PIE_COLORS[s] ?? "#94a3b8",
    }));

  const forecastData = forecast.map((f) => ({
    month:  f.month,
    amount: Number(f.amountUzs) / 1_000_000,
  }));

  const salesData = (stats.monthlySales ?? []).map((m) => ({
    month: m.month,
    sum: Number(m.sumUzs) / 1_000_000,
    count: m.count,
  }));

  const methodData = Object.entries(stats.paymentMethods ?? {})
    .filter(([, v]) => Number(v) > 0)
    .map(([k, v]) => ({
      name: METHOD_META[k]?.label ?? k,
      value: Number(v) / 1_000_000,
      raw: Number(v),
      color: METHOD_META[k]?.color ?? "#94a3b8",
    }));

  const collected = Number(stats.totalCollectedUzs);
  const debt = Math.max(0, Number(stats.totalDebtUzs));
  const collectPct = Math.round((collected / Math.max(1, Number(stats.totalSalesUzs))) * 100);
  const collectData = [
    { name: "Собрано", value: collected, color: "#10b981" },
    { name: "Остаток", value: debt, color: "#e2e8f0" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black text-slate-900">Аналитика проекта</h1>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Сумма продаж",     value: `${fmt(stats.totalSalesUzs)} сум`,     sub: `${stats.contractsCount} договоров`,  color: "text-slate-900" },
          { label: "Собрано",          value: `${fmt(stats.totalCollectedUzs)} сум`, sub: `${collectPct}% от суммы`,            color: "text-emerald-600" },
          { label: "Задолженность",    value: `${fmt(stats.totalDebtUzs)} сум`,      sub: "Остаток к оплате",                   color: "text-red-500" },
          { label: "Свободных квартир",value: String(stats.apartmentsByStatus["AVAILABLE"] ?? 0), sub: "Доступны к продаже",    color: "text-[#1E3A8A]" },
        ].map((c) => (
          <div key={c.label} className={card.replace("p-6", "px-5 py-5")}>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">{c.label}</p>
            <p className={`text-xl font-black ${c.color}`}>{c.value}</p>
            <p className="text-xs text-slate-400 mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Динамика продаж — сумма по месяцам (кол-во договоров в подсказке) */}
      <div className={card}>
        <h2 className={h2}>Динамика продаж (6 мес.)</h2>
        {salesData.some((d) => d.sum > 0 || d.count > 0) ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={salesData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={mLabel} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}M`} />
              <Tooltip
                labelFormatter={mLabel}
                formatter={(v, _n, p) => [
                  `${Number(v).toFixed(0)} млн сум · ${p?.payload?.count ?? 0} дог.`,
                  "Продажи",
                ]}
              />
              <Bar dataKey="sum" fill="#1E3A8A" radius={[6, 6, 0, 0]} barSize={34} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-slate-400 text-sm text-center py-12">Пока нет продаж за период</p>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Статусы квартир */}
        <div className={card}>
          <h2 className={h2}>Статусы квартир</h2>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={95} paddingAngle={3} dataKey="value">
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip />
                <Legend iconType="circle" iconSize={10} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-400 text-sm text-center py-12">Данных нет</p>
          )}
        </div>

        {/* Оплаты по кассам */}
        <div className={card}>
          <h2 className={h2}>Оплаты по кассам</h2>
          {methodData.length > 0 ? (
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={methodData} cx="50%" cy="50%" innerRadius={60} outerRadius={95} paddingAngle={3} dataKey="value">
                  {methodData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v) => [`${Number(v).toFixed(0)} млн сум`, ""]} />
                <Legend iconType="circle" iconSize={10} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-400 text-sm text-center py-12">Оплат пока нет</p>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Прогноз поступлений */}
        <div className={card}>
          <h2 className={h2}>Прогноз поступлений (6 мес.)</h2>
          {forecastData.length > 0 ? (
            <ResponsiveContainer width="100%" height={230}>
              <AreaChart data={forecastData}>
                <defs>
                  <linearGradient id="fc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F97316" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#F97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={mLabel} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}M`} />
                <Tooltip formatter={(v) => [`${Number(v).toFixed(0)} млн сум`, "Ожидается"]} labelFormatter={mLabel} />
                <Area dataKey="amount" stroke="#F97316" strokeWidth={2.5} fill="url(#fc)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-400 text-sm text-center py-12">Нет предстоящих платежей</p>
          )}
        </div>

        {/* Сбор оплат */}
        <div className={card}>
          <h2 className={h2}>Сбор оплат</h2>
          <div className="flex items-center gap-5">
            <ResponsiveContainer width="50%" height={200}>
              <PieChart>
                <Pie data={collectData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2} dataKey="value" stroke="none">
                  {collectData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v) => [`${fmt(Number(v))} сум`, ""]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Собрано</p>
                <p className="text-lg font-black text-emerald-600">{fmt(collected)} сум</p>
                <p className="text-xs text-slate-400">{collectPct}% от суммы договоров</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Остаток</p>
                <p className="text-lg font-black text-slate-700">{fmt(debt)} сум</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sales by manager */}
      {stats.salesByManager.length > 0 && (
        <div className={card}>
          <h2 className={h2}>Продажи по менеджерам</h2>
          <div className="space-y-4">
            {stats.salesByManager
              .slice()
              .sort((a, b) => Number(b.totalUzs) - Number(a.totalUzs))
              .map((m) => {
                const maxTotal = Math.max(...stats.salesByManager.map((x) => Number(x.totalUzs)));
                const pct = maxTotal ? Math.round((Number(m.totalUzs) / maxTotal) * 100) : 0;
                return (
                  <div key={m.managerId}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-bold text-slate-700">{m.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400">{m.count} дог.</span>
                        <span className="text-sm font-black text-slate-900">{fmt(m.totalUzs)} сум</span>
                      </div>
                    </div>
                    <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full bg-[#1E3A8A] transition-all duration-700"
                        style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
