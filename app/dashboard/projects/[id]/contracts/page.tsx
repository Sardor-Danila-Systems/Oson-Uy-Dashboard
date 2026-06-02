"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Search,
  Plus,
  RefreshCw,
  ChevronRight,
  FileText,
  Download,
} from "lucide-react";
import {
  contractsApi,
  ContractListItem,
  ContractStatus,
} from "@/lib/crm-api";
import * as XLSX from "xlsx";

const STATUS_LABEL: Record<ContractStatus, string> = {
  ACTIVE: "Активный",
  BOOKED: "Забронирован",
  COMPLETED: "Завершён",
  CANCELED: "Отменён",
};

const STATUS_STYLE: Record<ContractStatus, string> = {
  ACTIVE:    "bg-emerald-100 text-emerald-700",
  BOOKED:    "bg-amber-100 text-amber-700",
  COMPLETED: "bg-blue-100 text-blue-700",
  CANCELED:  "bg-red-100 text-red-700",
};

function fmt(v: string | number | null | undefined) {
  if (v == null) return "0";
  return Number(v).toLocaleString("ru-RU");
}

export default function ContractsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = Number(params.id);

  const [contracts, setContracts] = useState<ContractListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ContractStatus | "">("");
  const [page, setPage] = useState(1);
  const LIMIT = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p: Record<string, string> = {
        page: String(page),
        limit: String(LIMIT),
      };
      if (search) p.search = search;
      if (statusFilter) p.status = statusFilter;
      const r = await contractsApi.list(projectId, p);
      setContracts(r.items);
      setTotal(r.total);
    } catch {
      // handled by auth guard in layout
    } finally {
      setLoading(false);
    }
  }, [projectId, page, search, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / LIMIT);

  const summaryTotal = contracts.reduce((s, c) => s + Number(c.totalPriceUzs), 0);
  const summaryPaid  = contracts.reduce((s, c) => s + Number(c.paidUzs), 0);

  const exportXlsx = () => {
    const rows = contracts.map((c) => ({
      "№ договора": c.number,
      "ФИО":        c.customer.name,
      "Телефон":    c.customer.phone,
      "Квартира":   `№${c.apartment.number}`,
      "Блок":       c.apartment.sectionKey || "—",
      "Этаж":       c.apartment.floor,
      "Сумма":      fmt(c.totalPriceUzs),
      "Скидка, %":  c.discountPercent,
      "Оплачено":   fmt(c.paidUzs),
      "Остаток":    fmt(c.remainingUzs),
      "Статус":     STATUS_LABEL[c.status],
      "Менеджер":   c.manager?.name ?? "—",
      "Дата":       new Date(c.contractDate).toLocaleDateString("ru-RU"),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Договоры");
    XLSX.writeFile(wb, `contracts_${projectId}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <Link
          href={`/dashboard/projects/${projectId}`}
          className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-[#1E3A8A] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Проект
        </Link>
        <span className="text-slate-300">/</span>
        <span className="text-sm font-black text-[#1E3A8A]">Договоры</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Договоры</h1>
          <p className="text-sm text-slate-500 mt-0.5">{total} договоров</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportXlsx}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition"
          >
            <Download className="h-4 w-4" /> Excel
          </button>
          <Link
            href={`/dashboard/projects/${projectId}/contracts/new`}
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[#F97316] text-white text-sm font-black shadow-lg shadow-orange-900/20 hover:bg-orange-600 transition"
          >
            <Plus className="h-4 w-4" /> Новый договор
          </Link>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Сумма договоров",  value: `${fmt(summaryTotal)} сум`,              color: "text-slate-900" },
          { label: "Оплачено",         value: `${fmt(summaryPaid)} сум`,               color: "text-emerald-600" },
          { label: "Остаток",          value: `${fmt(summaryTotal - summaryPaid)} сум`, color: "text-[#F97316]" },
        ].map((c) => (
          <div key={c.label} className="rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{c.label}</p>
            <p className={`mt-1 text-lg font-black ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 rounded-[1.5rem] border border-slate-100 bg-white p-4 shadow-sm">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Поиск по №, клиенту, квартире…"
            className="w-full pl-10 pr-4 h-10 text-sm font-medium border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#1E3A8A]/20 focus:border-[#1E3A8A]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as ContractStatus | ""); setPage(1); }}
          className="h-10 px-3 text-sm font-bold border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#1E3A8A]/20 focus:border-[#1E3A8A]"
        >
          <option value="">Все статусы</option>
          {(Object.keys(STATUS_LABEL) as ContractStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
        <button onClick={load} className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500 transition">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Table */}
      <div className="rounded-[2rem] border border-slate-100 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-slate-400 text-sm font-bold">
            Загрузка…
          </div>
        ) : contracts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-400">
            <FileText className="h-8 w-8" />
            <p className="text-sm font-bold">Договоры не найдены</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {["№", "Клиент", "Дата", "Сумма", "Квартира", "Скидка", "Оплачено", "Статус", "Менеджер", ""].map((h) => (
                    <th key={h} className="px-5 py-3.5 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {contracts.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/dashboard/projects/${projectId}/contracts/${c.id}`)}
                    className="hover:bg-orange-50/60 cursor-pointer transition group"
                  >
                    <td className="px-5 py-4 font-black text-[#1E3A8A]">{c.number}</td>
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-900 truncate max-w-[150px]">{c.customer.name}</p>
                      <p className="text-xs text-slate-400">{c.customer.phone}</p>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(c.contractDate).toLocaleDateString("ru-RU")}
                    </td>
                    <td className="px-5 py-4 font-bold text-slate-900 whitespace-nowrap">
                      {fmt(c.totalPriceUzs)} сум
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-slate-700 font-medium">№{c.apartment.number}</p>
                      <p className="text-xs text-slate-400">{c.apartment.sectionKey || "—"} / {c.apartment.floor} эт.</p>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-500">
                      {c.discountPercent > 0 ? `${c.discountPercent}%` : "—"}
                    </td>
                    <td className="px-5 py-4 font-bold text-emerald-600 whitespace-nowrap">
                      {fmt(c.paidUzs)} сум
                    </td>
                    <td className="px-5 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${STATUS_STYLE[c.status]}`}>
                        {STATUS_LABEL[c.status]}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-500 truncate max-w-[100px]">
                      {c.manager?.name ?? "—"}
                    </td>
                    <td className="px-5 py-4">
                      <ChevronRight className="h-4 w-4 text-slate-200 group-hover:text-[#F97316] transition" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
            className="px-4 py-2 rounded-xl text-sm font-bold border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition">
            ← Назад
          </button>
          <span className="text-sm font-bold text-slate-500">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
            className="px-4 py-2 rounded-xl text-sm font-bold border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition">
            Вперёд →
          </button>
        </div>
      )}
    </div>
  );
}
