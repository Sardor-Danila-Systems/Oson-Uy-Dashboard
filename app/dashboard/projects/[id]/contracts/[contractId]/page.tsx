"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Download,
  ChevronDown,
  Trash2,
  CheckCircle2,
  Clock,
  Plus,
} from "lucide-react";
import { contractsApi, Contract, PaymentMethod } from "@/lib/crm-api";

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Активный", BOOKED: "Забронирован",
  COMPLETED: "Завершён", CANCELED: "Отменён",
};
const STATUS_STYLE: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700 border-emerald-200",
  BOOKED: "bg-amber-100 text-amber-700 border-amber-200",
  COMPLETED: "bg-blue-100 text-blue-700 border-blue-200",
  CANCELED: "bg-red-100 text-red-700 border-red-200",
};
const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Наличные", INSTALLMENT: "Рассрочка",
  MORTGAGE: "Ипотека", FULL: "Полная оплата",
};

function fmt(v: string | number | null | undefined) {
  if (v == null) return "0";
  return Number(v).toLocaleString("ru-RU");
}
function pct(paid: string, total: string) {
  const t = Number(total);
  return t ? Math.min(100, Math.round((Number(paid) / t) * 100)) : 0;
}

export default function ContractDetailPage() {
  const params = useParams();
  const projectId = Number(params.id);
  const contractId = Number(params.contractId);

  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"history" | "schedule">("history");
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().split("T")[0]);
  const [payComment, setPayComment] = useState("");
  const [payLoading, setPayLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setContract(await contractsApi.findOne(projectId, contractId));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId, contractId]);

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payAmount || !contract) return;
    setPayLoading(true);
    try {
      const updated = await contractsApi.addPayment(projectId, contractId, {
        amountUzs: Number(payAmount.replace(/\s/g, "")),
        paidAt: payDate,
        comment: payComment || undefined,
        type: "INSTALLMENT",
      });
      setContract(updated);
      setPayAmount("");
      setPayComment("");
    } finally {
      setPayLoading(false);
    }
  };

  const handleDeletePayment = async (paymentId: number) => {
    if (!confirm("Удалить платёж?")) return;
    setContract(await contractsApi.removePayment(projectId, contractId, paymentId));
  };

  const handleDownload = (type: string, lang = "uz") => {
    const url = contractsApi.downloadUrl(
      projectId, contractId,
      type as "contract" | "guarantee-letter" | "payment-schedule",
      lang as "uz" | "uz_cyrillic" | "ru",
    );
    window.open(url, "_blank");
    setDownloadOpen(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#1E3A8A] border-t-transparent" />
      </div>
    );
  }
  if (!contract) return null;

  const progress = pct(contract.paidUzs, contract.totalPriceUzs);

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
        <span className="text-sm font-black text-[#1E3A8A]">№{contract.number}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-black text-slate-900">№{contract.number}</h1>
          <span className={`px-3 py-1 rounded-full text-xs font-black uppercase border ${STATUS_STYLE[contract.status]}`}>
            {STATUS_LABEL[contract.status]}
          </span>
        </div>

        {/* Download */}
        <div className="relative">
          <button
            onClick={() => setDownloadOpen((v) => !v)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-slate-200 text-sm font-bold hover:bg-slate-50 transition"
          >
            <Download className="h-4 w-4" />
            Скачать
            <ChevronDown className={`h-3 w-3 transition-transform ${downloadOpen ? "rotate-180" : ""}`} />
          </button>
          {downloadOpen && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-2xl border border-slate-100 shadow-xl z-20 py-2">
              {[
                { label: "Договор (uz)", type: "contract", lang: "uz" },
                { label: "Договор (uz-кириллица)", type: "contract", lang: "uz_cyrillic" },
                { label: "Договор (ru)", type: "contract", lang: "ru" },
                null,
                { label: "Гарантийное письмо", type: "guarantee-letter", lang: "uz" },
                { label: "График платежей", type: "payment-schedule", lang: "uz" },
              ].map((item, i) =>
                item === null ? (
                  <div key={i} className="my-1 border-t border-slate-100" />
                ) : (
                  <button
                    key={i}
                    onClick={() => handleDownload(item.type, item.lang)}
                    className="w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-slate-50 text-slate-700 transition"
                  >
                    {item.label}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      </div>

      {/* Financial cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Сумма договора",  value: `${fmt(contract.totalPriceUzs)} сум`, style: "border-[#1E3A8A]/20 bg-blue-50" },
          { label: "Первый взнос",    value: `${fmt(contract.firstPaymentUzs)} сум`, style: "" },
          { label: "Срок",            value: `${contract.termMonths} мес.`, style: "" },
          { label: "Оплачено",        value: `${fmt(contract.paidUzs)} сум`, style: "border-emerald-200 bg-emerald-50" },
          { label: "Остаток",         value: `${fmt(contract.remainingUzs)} сум`, style: "border-orange-200 bg-orange-50" },
          { label: "Долг тек. мес.",  value: `${fmt(contract.debtUzs)} сум`, style: Number(contract.debtUzs) > 0 ? "border-red-200 bg-red-50" : "" },
        ].map((c) => (
          <div key={c.label} className={`rounded-2xl border px-3 py-3 bg-white ${c.style || "border-slate-100"}`}>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">{c.label}</p>
            <p className="text-xs font-black text-slate-900 leading-tight">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Progress */}
      <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold text-slate-600">Прогресс оплаты</span>
          <span className="text-sm font-black text-slate-900">{progress}%</span>
        </div>
        <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#1E3A8A] to-[#F97316] transition-all duration-700"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-slate-400 font-bold">
          <span>{METHOD_LABEL[contract.paymentMethod]}</span>
          <span>Скидка: {contract.discountPercent > 0 ? `${contract.discountPercent}%` : "—"}</span>
        </div>
      </div>

      {/* 2-col layout */}
      <div className="grid md:grid-cols-2 gap-5">
        {/* Payments */}
        <div className="rounded-[2rem] border border-slate-100 bg-white shadow-sm overflow-hidden">
          <div className="flex border-b border-slate-100">
            {(["history", "schedule"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-3.5 text-sm font-black uppercase tracking-wide transition ${
                  activeTab === tab
                    ? "text-[#1E3A8A] border-b-2 border-[#1E3A8A]"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                {tab === "history" ? "История" : "График"}
              </button>
            ))}
          </div>

          <div className="p-5 space-y-3">
            {activeTab === "history" && (
              <>
                {contract.status === "ACTIVE" && (
                  <form onSubmit={handleAddPayment} className="rounded-2xl bg-slate-50 border border-slate-100 p-4 space-y-2.5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Внести платёж</p>
                    <div className="flex gap-2">
                      <input
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        placeholder="Сумма (сум)"
                        required
                        className="flex-1 h-9 px-3 text-sm font-bold border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#1E3A8A]/20 focus:border-[#1E3A8A]"
                      />
                      <input
                        type="date"
                        value={payDate}
                        onChange={(e) => setPayDate(e.target.value)}
                        className="h-9 px-2 text-sm border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#1E3A8A]/20 focus:border-[#1E3A8A]"
                      />
                    </div>
                    <input
                      value={payComment}
                      onChange={(e) => setPayComment(e.target.value)}
                      placeholder="Комментарий (необязательно)"
                      className="w-full h-9 px-3 text-sm border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#1E3A8A]/20 focus:border-[#1E3A8A]"
                    />
                    <button
                      type="submit"
                      disabled={payLoading}
                      className="w-full py-2.5 rounded-xl bg-[#F97316] text-white text-sm font-black disabled:opacity-50 hover:bg-orange-600 transition"
                    >
                      {payLoading ? "Сохранение…" : "Добавить платёж"}
                    </button>
                  </form>
                )}

                {contract.payments.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6">Платежей нет</p>
                ) : (
                  contract.payments.map((p, i) => (
                    <div key={p.id} className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50">
                      <span className="text-xs text-slate-400 w-5 text-center">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-slate-900 text-sm">{fmt(p.amountUzs)} сум</p>
                        <p className="text-xs text-slate-400">
                          {new Date(p.paidAt).toLocaleDateString("ru-RU")}
                          {p.comment ? ` · ${p.comment}` : ""}
                        </p>
                      </div>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 uppercase">
                        Оплачено
                      </span>
                      <button
                        onClick={() => handleDeletePayment(p.id)}
                        className="p-1.5 rounded-xl hover:bg-red-50 text-slate-300 hover:text-red-500 transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </>
            )}

            {activeTab === "schedule" && (
              contract.paymentSchedule.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">График не сформирован</p>
              ) : (
                contract.paymentSchedule.map((item) => (
                  <div key={item.id} className={`flex items-center gap-3 p-3 rounded-2xl text-sm ${item.isPaid ? "bg-emerald-50" : "bg-slate-50"}`}>
                    {item.isPaid
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      : <Clock className="h-4 w-4 text-slate-300 shrink-0" />}
                    <span className="text-slate-400 text-xs w-20 shrink-0">
                      {new Date(item.dueDate).toLocaleDateString("ru-RU", { month: "short", year: "numeric" })}
                    </span>
                    <span className={`flex-1 font-black ${item.isPaid ? "text-emerald-600" : "text-slate-900"}`}>
                      {fmt(item.amountUzs)} сум
                    </span>
                    {item.isPaid && item.paidAt && (
                      <span className="text-xs text-slate-400">{new Date(item.paidAt).toLocaleDateString("ru-RU")}</span>
                    )}
                  </div>
                ))
              )
            )}
          </div>
        </div>

        {/* Client + Apartment + Meta */}
        <div className="space-y-4">
          {/* Client */}
          <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Информация о клиенте</p>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-11 w-11 rounded-full bg-[#1E3A8A]/10 flex items-center justify-center font-black text-[#1E3A8A]">
                {contract.customer.name.charAt(0)}
              </div>
              <div>
                <p className="font-black text-slate-900">{contract.customer.name}</p>
                <p className="text-sm text-slate-500">{contract.customer.phone}</p>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              {contract.customer.passportSeries && (
                <InfoRow label="Паспорт" value={`${contract.customer.passportSeries} ${contract.customer.passportNumber ?? ""}`} />
              )}
              {contract.customer.pinfl && <InfoRow label="ПИНФЛ" value={contract.customer.pinfl} />}
              {contract.customer.address && <InfoRow label="Адрес" value={contract.customer.address} />}
              {contract.customer.region && (
                <InfoRow label="Регион" value={`${contract.customer.region}${contract.customer.city ? ", " + contract.customer.city : ""}`} />
              )}
            </div>
          </div>

          {/* Apartment */}
          <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Информация о квартире</p>
            {contract.apartment.layoutImageUrl && (
              <img src={contract.apartment.layoutImageUrl} alt="Планировка"
                className="w-full max-h-36 object-contain rounded-2xl bg-slate-50 border border-slate-100 mb-4" />
            )}
            <div className="space-y-2 text-sm">
              <InfoRow label="Здание"   value={contract.apartment.project.name} />
              <InfoRow label="Блок"     value={contract.apartment.sectionKey || "—"} />
              <InfoRow label="Этаж"     value={String(contract.apartment.floor)} />
              <InfoRow label="Квартира" value={`№${contract.apartment.number}`} />
              <InfoRow label="Комнат"   value={String(contract.apartment.rooms)} />
              <InfoRow label="Площадь"  value={`${contract.apartment.areaSqm} м²`} />
              {contract.apartment.pricePerM2Uzs && (
                <InfoRow label="Цена 1 м²" value={`${fmt(contract.apartment.pricePerM2Uzs)} сум`} />
              )}
            </div>
          </div>

          {/* Contract meta */}
          <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Данные договора</p>
            <div className="space-y-2 text-sm">
              <InfoRow label="Дата создания" value={new Date(contract.contractDate).toLocaleDateString("ru-RU")} />
              <InfoRow label="Ответственный" value={contract.manager?.name ?? "—"} />
              {contract.broker && <InfoRow label="Посредник" value={contract.broker.name} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-slate-400 shrink-0">{label}</span>
      <span className="font-bold text-slate-800 text-right">{value}</span>
    </div>
  );
}
