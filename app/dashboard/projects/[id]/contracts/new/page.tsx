"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Search, Loader2, Home, CreditCard } from "lucide-react";
import { apartmentsApi, Apartment } from "@/lib/crm-api";
import { formatUzs } from "@/lib/currency";
import ContractCreateModal from "@/components/crm/ContractCreateModal";

const STATUS_LABEL: Record<string, string> = {
  AVAILABLE: "Свободна",
  RESERVED: "Забронирована",
  SOLD: "Продана",
  INSTALLMENT: "В рассрочке",
  MORTGAGE: "В ипотеке",
  UNAVAILABLE: "Недоступна",
};
const STATUS_STYLE: Record<string, string> = {
  AVAILABLE: "bg-emerald-100 text-emerald-700",
  RESERVED: "bg-amber-100 text-amber-700",
  SOLD: "bg-red-100 text-red-700",
  INSTALLMENT: "bg-blue-100 text-blue-700",
  MORTGAGE: "bg-purple-100 text-purple-700",
  UNAVAILABLE: "bg-slate-100 text-slate-500",
};

export default function NewContractPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = Number(params.id);

  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Apartment | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apartmentsApi.list(projectId, { limit: "500" });
      setApartments(res.items ?? []);
    } catch {
      /* handled by auth layout */
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Apartments available for a new contract first
    const sellable = apartments.filter(
      (a) => a.status === "AVAILABLE" || a.status === "RESERVED",
    );
    const list = sellable.length ? sellable : apartments;
    if (!q) return list.slice(0, 200);
    return list
      .filter(
        (a) =>
          a.number.toLowerCase().includes(q) ||
          (a.sectionKey ?? "").toLowerCase().includes(q) ||
          String(a.floor).includes(q),
      )
      .slice(0, 200);
  }, [apartments, search]);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <Link
          href={`/dashboard/projects/${projectId}/contracts`}
          className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-[#1E3A8A] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Договоры
        </Link>
        <span className="text-slate-300">/</span>
        <span className="text-sm font-black text-[#1E3A8A]">Новый договор</span>
      </div>

      <div>
        <h1 className="text-2xl font-black text-slate-900">Новый договор</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Выберите квартиру — затем заполните данные покупателя и условия
        </p>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 rounded-[1.5rem] border border-slate-100 bg-white p-4 shadow-sm">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по №, блоку, этажу…"
            className="w-full pl-10 pr-4 h-10 text-sm font-medium text-slate-900 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#1E3A8A]/20 focus:border-[#1E3A8A]"
          />
        </div>
        <Link
          href={`/dashboard/projects/${projectId}/chessboard`}
          className="text-xs font-bold text-slate-500 hover:text-[#1E3A8A]"
        >
          Открыть шахматку →
        </Link>
      </div>

      {/* Apartments */}
      <div className="rounded-[2rem] border border-slate-100 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-400">
            <Home className="h-8 w-8" />
            <p className="text-sm font-bold">Квартиры не найдены</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-4">
            {filtered.map((a) => (
              <button
                key={a.id}
                onClick={() => setPicked(a)}
                className="text-left rounded-2xl border border-slate-100 bg-white p-4 hover:border-[#1E3A8A] hover:shadow-md transition group"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-lg font-black text-[#1E3A8A]">
                    №{a.number}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${STATUS_STYLE[a.status]}`}
                  >
                    {STATUS_LABEL[a.status]}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium">
                  {a.sectionKey ? `Блок ${a.sectionKey} · ` : ""}
                  {a.floor} эт. · {a.rooms}-комн · {a.areaSqm} м²
                </p>
                <p className="mt-2 text-sm font-black text-slate-900">
                  {a.priceUzs && a.priceUzs > 0
                    ? formatUzs(a.priceUzs)
                    : "Цена договорная"}
                </p>
                <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[#F97316] opacity-0 group-hover:opacity-100 transition">
                  <CreditCard className="h-3 w-3" /> Оформить
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {picked && (
        <ContractCreateModal
          projectId={projectId}
          apartment={{
            id: picked.id,
            number: picked.number,
            floor: picked.floor,
            sectionKey: picked.sectionKey,
            rooms: picked.rooms,
            areaSqm: picked.areaSqm,
            priceUzs: picked.priceUzs,
          }}
          onClose={() => setPicked(null)}
          onCreated={(c) => {
            setPicked(null);
            router.push(
              `/dashboard/projects/${projectId}/contracts/${c.id}`,
            );
          }}
        />
      )}
    </div>
  );
}
