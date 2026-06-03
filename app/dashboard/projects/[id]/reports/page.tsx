"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
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

function fmt(v: string | number) {
  const n = Number(v);
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} млрд`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(0)} млн`;
  return n.toLocaleString("ru-RU");
}

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

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/projects"
          className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-[#1E3A8A] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Проекты
        </Link>
        <span className="text-slate-300">/</span>
        <span className="text-sm font-black text-[#1E3A8A]">Отчёты</span>
      </div>

      <h1 className="text-2xl font-black text-slate-900">Аналитика</h1>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Продажи",          value: `${fmt(stats.totalSalesUzs)} сум`,      sub: `${stats.contractsCount} договоров`,  color: "text-slate-900" },
          { label: "Собрано",          value: `${fmt(stats.totalCollectedUzs)} сум`,  sub: `${Math.round(Number(stats.totalCollectedUzs) / Math.max(1, Number(stats.totalSalesUzs)) * 100)}% от суммы`, color: "text-emerald-600" },
          { label: "Задолженность",    value: `${fmt(stats.totalDebtUzs)} сум`,       sub: "Просроченные платежи",               color: "text-red-500" },
          { label: "Свободных квартир",value: String(stats.apartmentsByStatus["AVAILABLE"] ?? 0), sub: "Доступны к продаже",     color: "text-[#1E3A8A]" },
        ].map((c) => (
          <div key={c.label} className="rounded-[2rem] border border-slate-100 bg-white px-5 py-5 shadow-sm">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">{c.label}</p>
            <p className={`text-xl font-black ${c.color}`}>{c.value}</p>
            <p className="text-xs text-slate-400 mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Pie */}
        <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-black text-slate-900 mb-4 uppercase tracking-wide">Статусы квартир</h2>
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

        {/* Forecast */}
        <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-black text-slate-900 mb-4 uppercase tracking-wide">Прогноз поступлений (6 мес.)</h2>
          {forecastData.length > 0 ? (
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={forecastData} barSize={30}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }}
                  tickFormatter={(v) => { const [y, m] = v.split("-"); return `${m}.${y.slice(2)}`; }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}M`} />
                <Tooltip formatter={(v) => [`${Number(v).toFixed(0)} млн сум`, "Сумма"]} />
                <Bar dataKey="amount" fill="#F97316" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-400 text-sm text-center py-12">Нет предстоящих платежей</p>
          )}
        </div>
      </div>

      {/* Sales by manager */}
      {stats.salesByManager.length > 0 && (
        <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-black text-slate-900 mb-5 uppercase tracking-wide">Продажи по менеджерам</h2>
          <div className="space-y-4">
            {stats.salesByManager.map((m) => {
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
