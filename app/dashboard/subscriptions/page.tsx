"use client";

import React, { useState, useEffect } from "react";
import { CheckCircle2, Star, ShieldCheck, Zap, Info, ArrowRight, CreditCard, Loader2, ChevronDown } from "lucide-react";
import { API_URL, apiFetch, getToken } from "@/lib/api";
import { formatUzs } from "@/lib/currency";
import { useTranslations } from "next-intl";

type Project = { id: number; name: string; plan?: string; subscriptionStatus?: string };

const PLANS_CONFIG = [
  {
    id: "START",
    icon: <Zap className="h-6 w-6 text-blue-500" />,
    color: "blue",
    price: 0,
  },
  {
    id: "PRO",
    icon: <ShieldCheck className="h-6 w-6 text-orange-500" />,
    color: "orange",
    isPopular: true,
    price: 0,
  },
  {
    id: "ULTIMATE",
    icon: <Star className="h-6 w-6 text-yellow-500" />,
    color: "yellow",
    price: 0,
  }
];

export default function SubscriptionsPage() {
  const t = useTranslations("Dashboard.subscriptions");
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePayment, setActivePayment] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [selectedProjectForPlan, setSelectedProjectForPlan] = useState<Record<string, number>>({});
  const [promoCode, setPromoCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [promoProjectId, setPromoProjectId] = useState<number>(0);

  const loadData = React.useCallback(async () => {
    try {
      setLoading(true);
      const projectsData = await apiFetch<any[]>("/projects/mine");
      const currentDeveloper = await apiFetch<any>("/developers");
      setProjects(projectsData.filter(p => p.developerId === currentDeveloper.id));
    } catch (err) {
      setError("Error loading data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleUpgrade = async (projectId: number, plan: string) => {
    if (!projectId) {
      alert(t("chooseProject"));
      return;
    }

    try {
      setIsProcessing(`${projectId}-${plan}`);
      setError(null);
      
      const response = await fetch(`${API_URL}/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ projectId, plan, paymentMethod: "CARD_TRANSFER" }),
      });
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      const data = await response.json();
      
      setActivePayment({
        plan,
        externalRef: data.externalRef,
        amountUzs: data.amountUzs || 0,
        instructions: data.instructions?.comment || "Pay according to details",
      });
    } catch (err) {
      setError("Subscription error. Try later.");
    } finally {
      setIsProcessing(null);
    }
  };

  const redeemPromo = async (projectId: number) => {
    const code = promoCode.trim();
    if (!code) return;
    if (!projectId) {
      alert(t("chooseProject"));
      return;
    }
    try {
      setRedeeming(true);
      setError(null);
      const res = await fetch(`${API_URL}/promo/redeem`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ code, projectId }),
      });
      if (!res.ok) throw new Error(`Error: ${res.status}`);
      setPromoCode("");
      await loadData();
    } catch (e) {
      setError("Promo code error");
    } finally {
      setRedeeming(false);
    }
  };

  if (loading) return (
    <div className="flex h-[60vh] items-center justify-center">
      <Loader2 className="h-12 w-12 animate-spin text-[#1E3A8A]" />
    </div>
  );

  return (
    <div className="space-y-10 animate-in fade-in duration-500 pb-20">
      <div className="space-y-2">
        <h1 className="text-4xl font-black text-[#1E3A8A] tracking-tight">{t("title")}</h1>
        <p className="text-slate-500 font-medium max-w-2xl">
          {t("subtitle")}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {PLANS_CONFIG.map((plan) => (
          <div key={plan.id} className={`relative group rounded-[2rem] sm:rounded-[3rem] border border-slate-100 bg-white p-6 sm:p-10 shadow-sm transition-all hover:shadow-2xl hover:-translate-y-2 flex flex-col ${plan.isPopular ? 'ring-4 ring-orange-500/10' : ''}`}>
            {plan.isPopular && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-orange-500 text-white text-[10px] font-black uppercase px-6 py-2 rounded-full shadow-lg z-10 tracking-[0.2em]">
                {t("popular")}
              </div>
            )}
            
            <div className={`h-16 w-16 rounded-3xl mb-8 flex items-center justify-center bg-${plan.color}-50 text-${plan.color}-600 border border-${plan.color}-100`}>
              {plan.icon}
            </div>

            <h2 className="text-3xl font-black text-slate-900 mb-2 uppercase italic">{t(`plans.${plan.id}.name`)}</h2>
            <div className="flex items-baseline gap-1 mb-8">
              <span className="text-4xl font-black text-slate-900">{formatUzs(plan.price)}</span>
              <span className="text-slate-400 font-bold text-sm uppercase">{t("perMonth")}</span>
            </div>

            <div className="flex-1 space-y-4 mb-10">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-2">{t("features")}</p>
              <ul className="space-y-4">
                {(t.raw(`plans.${plan.id}.features`) as string[]).map((feature, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm font-bold text-slate-600">
                    <CheckCircle2 className={`h-5 w-5 shrink-0 text-${plan.color}-500`} />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">{t("selectProject")}</p>
              <div className="relative">
                <select 
                  className="w-full h-14 rounded-2xl bg-slate-50 border border-slate-100 px-6 text-sm font-bold outline-none focus:ring-4 focus:ring-blue-600/10 focus:border-blue-600 transition-all appearance-none cursor-pointer text-slate-900 pr-12"
                  onChange={(e) => setSelectedProjectForPlan({ ...selectedProjectForPlan, [plan.id]: Number(e.target.value) })}
                  defaultValue=""
                >
                  <option value="" disabled>{t("chooseProject")}</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.plan === plan.id ? t("alreadyConnected") : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 pointer-events-none" />
              </div>
              <button 
                onClick={() => handleUpgrade(selectedProjectForPlan[plan.id], plan.id)}
                disabled={isProcessing === `${selectedProjectForPlan[plan.id]}-${plan.id}`}
                className={`w-full h-16 rounded-2xl font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-xl active:scale-[0.98] disabled:opacity-50 ${
                  plan.color === 'orange' ? 'bg-[#F97316] text-white shadow-orange-900/20 hover:bg-orange-600' : 'bg-slate-900 text-white shadow-slate-900/20 hover:bg-blue-900'
                }`}
              >
                {isProcessing === `${selectedProjectForPlan[plan.id]}-${plan.id}` ? (
                   <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>{t("select")} <ArrowRight className="h-4 w-4" /></>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Promo code */}
      <div className="rounded-[2.5rem] border border-slate-100 bg-white p-6 md:p-10 shadow-sm">
        <h2 className="text-xl md:text-2xl font-black text-[#1E3A8A] uppercase tracking-tight mb-4">{t("promoTitle")}</h2>
        <p className="text-sm text-slate-500 font-medium mb-6">{t("promoSubtitle")}</p>
        <div className="flex flex-col md:flex-row gap-3">
          <select
            className="h-14 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-slate-200/60 md:w-[320px]"
            value={promoProjectId || ""}
            onChange={(e) => setPromoProjectId(Number(e.target.value))}
          >
            <option value="" disabled>
              {t("chooseProject")}
            </option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value)}
            placeholder={t("promoPlaceholder")}
            className="flex-1 h-14 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-slate-200/60"
          />
          <button
            type="button"
            disabled={redeeming}
            onClick={() => redeemPromo(promoProjectId)}
            className="h-14 rounded-2xl bg-[#1E3A8A] px-6 text-sm font-black text-white shadow-lg shadow-blue-900/20 disabled:opacity-60"
          >
            {redeeming ? <Loader2 className="h-5 w-5 animate-spin" /> : t("promoApply")}
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-400 font-semibold">{t("promoHint")}</p>
      </div>

      {activePayment && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="w-full max-w-xl rounded-[3rem] bg-white p-10 shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="flex items-center gap-4 mb-8">
              <div className="h-16 w-16 rounded-3xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                <CreditCard className="h-8 w-8" />
              </div>
              <div>
                <h3 className="text-2xl font-black text-slate-900 uppercase">{t("billing.title")}</h3>
                <p className="text-sm font-medium text-slate-500">{t("billing.order")} #{activePayment.externalRef}</p>
              </div>
            </div>

            <div className="space-y-6 bg-slate-50 p-8 rounded-[2rem] border border-slate-100 mb-8">
              <div className="flex justify-between border-b border-slate-200 pb-4">
                <span className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">{t("billing.plan")}</span>
                <span className="font-black text-slate-900">{t(`plans.${activePayment.plan}.name`)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-4">
                <span className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">{t("billing.amount")}</span>
                <span className="font-black text-slate-900 text-xl">{formatUzs(activePayment.amountUzs)}</span>
              </div>
              <div className="space-y-2 pt-2">
                <span className="text-slate-500 font-bold uppercase text-[10px] tracking-widest block">{t("billing.instructions")}</span>
                <p className="text-sm font-medium text-slate-700 leading-relaxed italic">&quot;{activePayment.instructions}&quot;</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => setActivePayment(null)}
                className="h-14 rounded-2xl bg-slate-100 text-slate-500 font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
              >
                {t("billing.close")}
              </button>
              <button 
                onClick={() => {
                  setActivePayment(null);
                  loadData();
                }}
                className="h-14 rounded-2xl bg-emerald-500 text-white font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-500/20"
              >
                {t("billing.paid")}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="fixed bottom-10 right-10 bg-red-500 text-white px-8 py-4 rounded-2xl font-bold shadow-2xl animate-in slide-in-from-right-10">
          {error}
        </div>
      )}
    </div>
  );
}
