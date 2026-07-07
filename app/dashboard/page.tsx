"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiAuthError, clearSession } from "@/lib/api";
import { 
  Users, 
  Building2, 
  Star, 
  TrendingUp, 
  ArrowUpRight, 
  Clock,
  CheckCircle2,
  PhoneCall
} from "lucide-react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { formatPhoneNumber } from "@/lib/format";

type DashboardStats = {
  totalLeads: number;
  newLeads: number;
  totalProjects: number;
  avgRating: number | null;
  totalFeedbacks: number;
};

type RecentLead = {
  id: number;
  name: string;
  phone: string;
  status: string;
  createdAt: string;
  project: { name: string } | null;
};

export default function DashboardOverview() {
  const t = useTranslations("Dashboard.overview");
  const locale = useLocale();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentLeads, setRecentLeads] = useState<RecentLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true);
        const leads = await apiFetch<any[]>("/leads");
        const feedbacks = await apiFetch<any>("/leads/feedback/summary");
        const projects = await apiFetch<any[]>("/projects/mine");

        // /leads и /projects/mine уже возвращают данные по проектам пользователя (owner+member)
        // (владелец + участник) — доп. фильтр по владельцу убран, чтобы сотрудники
        // видели назначенные объекты и заявки.
        const devLeads = Array.isArray(leads) ? leads : [];
        const devProjects = Array.isArray(projects) ? projects : [];

        setStats({
          totalLeads: devLeads.length,
          newLeads: devLeads.filter(l => l.status === "NEW").length,
          totalProjects: devProjects.length,
          avgRating: feedbacks.avgRating,
          totalFeedbacks: feedbacks.totalFeedbacks
        });

        setRecentLeads(devLeads.slice(0, 5));
      } catch (err) {
        if (err instanceof ApiAuthError) {
          clearSession();
        }
        setError(err instanceof Error ? err.message : "Error loading data");
      } finally {
        setLoading(false);
      }
    };

    void loadDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#1E3A8A] border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-black text-[#1E3A8A] tracking-tight">{t("title")}</h1>
        <p className="text-slate-500 font-medium">{t("welcome")}</p>
      </div>

      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          title={t("totalLeads")} 
          value={stats?.totalLeads ?? 0} 
          icon={<Users className="h-6 w-6 text-blue-600" />}
          trend={stats?.newLeads ? `+${stats.newLeads}` : t("active")}
          color="bg-blue-50"
        />
        <StatCard 
          title={t("projects")} 
          value={stats?.totalProjects ?? 0} 
          icon={<Building2 className="h-6 w-6 text-orange-600" />}
          trend={t("inCatalog")}
          color="bg-orange-50"
        />
        <StatCard 
          title={t("avgRating")} 
          value={stats?.avgRating ? stats.avgRating.toFixed(1) : "—"} 
          icon={<Star className="h-6 w-6 text-yellow-500" />}
          trend={`${stats?.totalFeedbacks ?? 0} ${t("reviews")}`}
          color="bg-yellow-50"
        />
        <StatCard 
          title={t("conversion")} 
          value={stats?.totalLeads ? Math.round(( (stats.totalLeads - stats.newLeads) / stats.totalLeads) * 100) + "%" : "0%"} 
          icon={<TrendingUp className="h-6 w-6 text-emerald-600" />}
          trend={t("processed")}
          color="bg-emerald-50"
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Clock className="h-5 w-5 text-slate-400" />
              {t("recentLeads")}
            </h2>
            <Link href="/dashboard/leads" className="text-sm font-bold text-blue-600 hover:underline flex items-center gap-1">
              {t("allLeads")} <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="md:hidden space-y-3">
            {recentLeads.map((lead) => (
              <div
                key={lead.id}
                className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-slate-900">{lead.name}</p>
                    <p className="mt-0.5 text-xs font-medium text-slate-500">
                      {formatPhoneNumber(lead.phone)}
                    </p>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-[10px] font-black uppercase ${
                      lead.status === "NEW"
                        ? "bg-orange-100 text-orange-700"
                        : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {lead.status === "NEW" ? (
                      <PhoneCall className="h-3 w-3" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3" />
                    )}
                    {t(`statusLabel.${lead.status}`)}
                  </span>
                </div>
                <p className="mt-2 text-sm font-medium text-slate-700">
                  {lead.project?.name ?? "—"}
                </p>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  {new Date(lead.createdAt).toLocaleDateString(
                    locale === "ru" ? "ru-RU" : "uz-UZ",
                  )}
                </p>
              </div>
            ))}
            {recentLeads.length === 0 && (
              <div className="rounded-3xl border border-slate-100 bg-white py-10 text-center text-sm text-slate-400">
                {t("noLeads")}
              </div>
            )}
          </div>

          <div className="hidden overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-black tracking-widest">
                  <tr>
                    <th className="px-6 py-4">{t("client")}</th>
                    <th className="px-6 py-4">{t("project")}</th>
                    <th className="px-6 py-4">{t("status")}</th>
                    <th className="px-6 py-4">{t("date")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {recentLeads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900">{lead.name}</div>
                        <div className="text-xs text-slate-500 font-medium">{formatPhoneNumber(lead.phone)}</div>
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-700">{lead.project?.name ?? "—"}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-black uppercase ${
                          lead.status === "NEW" 
                            ? "bg-orange-100 text-orange-700" 
                            : "bg-emerald-100 text-emerald-700"
                        }`}>
                          {lead.status === "NEW" ? <PhoneCall className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                          {t(`statusLabel.${lead.status}`)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-500 font-medium">
                        {new Date(lead.createdAt).toLocaleDateString(locale === "ru" ? 'ru-RU' : 'uz-UZ')}
                      </td>
                    </tr>
                  ))}
                  {recentLeads.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-10 text-center text-slate-400 font-medium">
                        {t("noLeads")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-bold text-slate-900">{t("quickActions")}</h2>
          <div className="grid gap-4">
            <QuickActionCard 
              title={t("addProject")} 
              desc={t("addProjectDesc")} 
              href="/dashboard/projects"
              color="bg-blue-600"
              btnText={t("goTo")}
            />
            <QuickActionCard 
              title={t("manageFloors")} 
              desc={t("manageFloorsDesc")} 
              href="/dashboard/floors"
              color="bg-orange-500"
              btnText={t("goTo")}
            />
            <QuickActionCard 
              title={t("setupProfile")} 
              desc={t("setupProfileDesc")} 
              href="/dashboard/profile"
              color="bg-emerald-600"
              btnText={t("goTo")}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, trend, color }: any) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-2xl ${color}`}>{icon}</div>
        <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{trend}</span>
      </div>
      <div className="space-y-1">
        <p className="text-3xl font-black text-slate-900">{value}</p>
        <p className="text-sm font-bold text-slate-500 uppercase tracking-tight">{title}</p>
      </div>
    </div>
  );
}

function QuickActionCard({ title, desc, href, btnText }: any) {
  return (
    <Link href={href} className="group block rounded-3xl border border-slate-100 bg-white p-6 shadow-sm hover:border-transparent hover:shadow-xl transition-all">
      <h3 className={`text-lg font-bold group-hover:text-blue-600 transition-colors`}>{title}</h3>
      <p className="text-sm text-slate-500 font-medium mt-1">{desc}</p>
      <div className="mt-4 flex items-center text-xs font-black uppercase tracking-widest text-slate-400 group-hover:text-blue-600 transition-colors">
        {btnText} <ArrowUpRight className="ml-1 h-3 w-3" />
      </div>
    </Link>
  );
}
