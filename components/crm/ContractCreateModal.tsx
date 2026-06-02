"use client";

import { useMemo, useState } from "react";
import {
  X,
  Loader2,
  CheckCircle2,
  Download,
  FileText,
  User,
  Home,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import {
  contractsApi,
  customersApi,
  Contract,
  PaymentMethod,
} from "@/lib/crm-api";
import { formatPhoneInput, phoneDigitsOnly } from "@/lib/format";

export interface ContractApartmentInput {
  id: number;
  number: string;
  floor: number;
  sectionKey?: string | null;
  rooms: number;
  areaSqm: number;
  priceUzs: number | null;
}

interface Props {
  projectId: number;
  apartment: ContractApartmentInput;
  onClose: () => void;
  onCreated?: (contract: Contract) => void;
}

const METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "INSTALLMENT", label: "Рассрочка" },
  { value: "MORTGAGE", label: "Ипотека" },
  { value: "CASH", label: "Наличные" },
  { value: "FULL", label: "Полная оплата" },
];

function maskMoney(raw: string) {
  const digits = raw.replace(/\D/g, "");
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
function parseMoney(masked: string) {
  return Number(masked.replace(/\s/g, "")) || 0;
}
function fmt(v: number) {
  return v.toLocaleString("ru-RU");
}

export default function ContractCreateModal({
  projectId,
  apartment,
  onClose,
  onCreated,
}: Props) {
  // ── Customer fields ───────────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+998 ");
  const [passportSeries, setPassportSeries] = useState("");
  const [passportNumber, setPassportNumber] = useState("");
  const [pinfl, setPinfl] = useState("");
  const [address, setAddress] = useState("");
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");

  // ── Contract fields ───────────────────────────────────────────────────────
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("INSTALLMENT");
  const [totalPrice, setTotalPrice] = useState(
    apartment.priceUzs != null ? maskMoney(String(apartment.priceUzs)) : "",
  );
  const [firstPayment, setFirstPayment] = useState("");
  const [termMonths, setTermMonths] = useState("12");
  const [discount, setDiscount] = useState("0");
  const [contractDate, setContractDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Contract | null>(null);

  const isInstallment = paymentMethod === "INSTALLMENT" || paymentMethod === "MORTGAGE";

  const monthly = useMemo(() => {
    const total = parseMoney(totalPrice);
    const first = parseMoney(firstPayment);
    const term = Math.max(1, parseInt(termMonths || "1", 10));
    if (!isInstallment) return 0;
    const rem = total - first;
    return rem > 0 ? Math.round(rem / term) : 0;
  }, [totalPrice, firstPayment, termMonths, isInstallment]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (name.trim().length < 2) {
      setError("Укажите ФИО покупателя");
      return;
    }
    if (phoneDigitsOnly(phone).length < 9) {
      setError("Укажите корректный телефон");
      return;
    }
    const total = parseMoney(totalPrice);
    if (total <= 0) {
      setError("Укажите стоимость квартиры");
      return;
    }

    setLoading(true);
    try {
      // 1. Create customer (auto buyer)
      const customer = await customersApi.create(projectId, {
        name: name.trim(),
        phone: phoneDigitsOnly(phone) || phone.trim(),
        apartmentId: apartment.id,
        passportSeries: passportSeries.trim() || undefined,
        passportNumber: passportNumber.trim() || undefined,
        pinfl: pinfl.trim() || undefined,
        address: address.trim() || undefined,
        region: region.trim() || undefined,
        city: city.trim() || undefined,
        totalPriceUzs: total,
      });

      // 2. Create contract linking apartment + customer
      const contract = await contractsApi.create(projectId, {
        apartmentId: apartment.id,
        customerId: customer.id,
        paymentMethod,
        totalPriceUzs: total,
        firstPaymentUzs: parseMoney(firstPayment),
        termMonths: isInstallment ? Math.max(1, parseInt(termMonths || "1", 10)) : 1,
        discountPercent: Number(discount) || 0,
        contractDate,
        notes: notes.trim() || undefined,
      });

      setCreated(contract);
      onCreated?.(contract);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка создания договора");
    } finally {
      setLoading(false);
    }
  };

  const download = (type: "contract" | "guarantee-letter" | "payment-schedule", lang: "uz" | "uz_cyrillic" | "ru" = "uz") => {
    if (!created) return;
    window.open(contractsApi.downloadUrl(projectId, created.id, type, lang), "_blank");
  };

  const inputCls =
    "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-900 placeholder:text-slate-400 placeholder:font-medium outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-[#1E3A8A]/15 transition";
  const labelCls = "block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5";

  // ── Success screen ──────────────────────────────────────────────────────────
  if (created) {
    return (
      <Overlay onClose={onClose}>
        <div className="p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-9 w-9 text-emerald-600" />
          </div>
          <h2 className="text-xl font-black text-slate-900">Договор создан</h2>
          <p className="mt-1 text-sm text-slate-500">
            № <span className="font-black text-[#1E3A8A]">{created.number}</span> ·
            Квартира №{apartment.number} · {created.customer.name}
          </p>

          <div className="mt-6 space-y-2">
            <button
              onClick={() => download("contract", "uz")}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1E3A8A] py-3 text-sm font-black text-white hover:bg-blue-900 transition"
            >
              <FileText className="h-4 w-4" /> Скачать договор (uz)
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => download("contract", "ru")}
                className="flex items-center justify-center gap-1.5 rounded-2xl border border-slate-200 py-2.5 text-xs font-black text-slate-600 hover:bg-slate-50 transition"
              >
                <Download className="h-3.5 w-3.5" /> Договор (ru)
              </button>
              <button
                onClick={() => download("payment-schedule", "uz")}
                className="flex items-center justify-center gap-1.5 rounded-2xl border border-slate-200 py-2.5 text-xs font-black text-slate-600 hover:bg-slate-50 transition"
              >
                <Download className="h-3.5 w-3.5" /> График
              </button>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-2">
            <button
              onClick={onClose}
              className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-black text-slate-600 hover:bg-slate-50 transition"
            >
              Закрыть
            </button>
            <Link
              href={`/dashboard/projects/${projectId}/contracts/${created.id}`}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl bg-[#F97316] py-3 text-sm font-black text-white hover:bg-orange-600 transition"
            >
              Открыть <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </Overlay>
    );
  }

  // ── Form screen ──────────────────────────────────────────────────────────────
  return (
    <Overlay onClose={onClose}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <div>
          <h2 className="text-lg font-black text-slate-900">Оформление договора</h2>
          <p className="text-xs font-bold text-slate-400">
            Квартира №{apartment.number} ·{" "}
            {apartment.sectionKey ? `${apartment.sectionKey} · ` : ""}
            {apartment.floor} этаж · {apartment.rooms}-комн · {apartment.areaSqm} м²
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 transition"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="max-h-[70vh] overflow-y-auto px-6 py-5 space-y-6">
        {error && (
          <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
            {error}
          </div>
        )}

        {/* Buyer block */}
        <section className="space-y-3">
          <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-[#1E3A8A]">
            <User className="h-3.5 w-3.5" /> Покупатель
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>ФИО *</label>
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Иванов Иван Иванович" />
            </div>
            <div>
              <label className={labelCls}>Телефон *</label>
              <input className={inputCls} value={phone} onChange={(e) => setPhone(formatPhoneInput(e.target.value))} placeholder="+998 __ ___ __ __" autoComplete="tel" />
            </div>
            <div>
              <label className={labelCls}>ПИНФЛ</label>
              <input className={inputCls} value={pinfl} onChange={(e) => setPinfl(e.target.value)} placeholder="12345678901234" />
            </div>
            <div>
              <label className={labelCls}>Серия паспорта</label>
              <input className={inputCls} value={passportSeries} onChange={(e) => setPassportSeries(e.target.value.toUpperCase())} placeholder="AD" />
            </div>
            <div>
              <label className={labelCls}>Номер паспорта</label>
              <input className={inputCls} value={passportNumber} onChange={(e) => setPassportNumber(e.target.value)} placeholder="1234567" />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Адрес</label>
              <input className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="ул. Навои, д. 1" />
            </div>
            <div>
              <label className={labelCls}>Регион</label>
              <input className={inputCls} value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Самаркандская обл." />
            </div>
            <div>
              <label className={labelCls}>Город</label>
              <input className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Самарканд" />
            </div>
          </div>
        </section>

        {/* Contract block */}
        <section className="space-y-3">
          <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-[#1E3A8A]">
            <FileText className="h-3.5 w-3.5" /> Условия договора
          </p>

          <div>
            <label className={labelCls}>Способ оплаты</label>
            <div className="grid grid-cols-4 gap-2">
              {METHOD_OPTIONS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setPaymentMethod(m.value)}
                  className={`rounded-xl py-2.5 text-xs font-black transition ${
                    paymentMethod === m.value
                      ? "bg-[#1E3A8A] text-white"
                      : "border border-slate-200 text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>Стоимость квартиры (сум) *</label>
              <input className={inputCls} value={totalPrice} onChange={(e) => setTotalPrice(maskMoney(e.target.value))} placeholder="850 000 000" />
            </div>

            {isInstallment && (
              <>
                <div>
                  <label className={labelCls}>Первоначальный взнос (сум)</label>
                  <input className={inputCls} value={firstPayment} onChange={(e) => setFirstPayment(maskMoney(e.target.value))} placeholder="85 000 000" />
                </div>
                <div>
                  <label className={labelCls}>Срок (месяцев)</label>
                  <input type="number" min={1} className={inputCls} value={termMonths} onChange={(e) => setTermMonths(e.target.value)} />
                </div>
              </>
            )}

            <div>
              <label className={labelCls}>Скидка (%)</label>
              <input type="number" min={0} max={100} className={inputCls} value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Дата договора</label>
              <input type="date" className={inputCls} value={contractDate} onChange={(e) => setContractDate(e.target.value)} />
            </div>
          </div>

          {isInstallment && monthly > 0 && (
            <div className="rounded-2xl bg-orange-50 border border-orange-100 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-orange-700">
                Ежемесячный платёж
              </p>
              <p className="text-lg font-black text-orange-900">{fmt(monthly)} сум</p>
              <p className="text-xs font-bold text-orange-700/70">
                на {termMonths} мес. после взноса {fmt(parseMoney(firstPayment))} сум
              </p>
            </div>
          )}

          <div>
            <label className={labelCls}>Примечание</label>
            <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Необязательно" />
          </div>
        </section>
      </form>

      {/* Footer */}
      <div className="flex items-center gap-3 border-t border-slate-100 px-6 py-4">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-black text-slate-600 hover:bg-slate-50 transition"
        >
          Отмена
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          className="flex-[2] flex items-center justify-center gap-2 rounded-2xl bg-[#F97316] py-3 text-sm font-black text-white shadow-lg shadow-orange-900/20 hover:bg-orange-600 disabled:opacity-50 transition"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {loading ? "Создание…" : "Создать договор и покупателя"}
        </button>
      </div>
    </Overlay>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-[2rem] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
