"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { API_URL, ApiAuthError, apiFetch, clearSession, getToken } from "@/lib/api";
import { 
  Users, 
  PhoneCall, 
  CheckCircle2, 
  Star, 
  ExternalLink, 
  Copy, 
  Search,
  Mail,
  X
} from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { formatPhoneNumber } from "@/lib/format";

type LeadStatus =
  | "NEW"
  | "CONTACTED"
  | "MEETING"
  | "RESERVED"
  | "SOLD"
  | "CANCELED";

const LEAD_COLUMNS: LeadStatus[] = [
  "NEW",
  "CONTACTED",
  "MEETING",
  "RESERVED",
  "SOLD",
  "CANCELED",
];

/** Отзыв доступен после первого контакта (не для новой и отменённой). */
function canRequestFeedback(status: LeadStatus) {
  return status !== "NEW" && status !== "CANCELED";
}

function leadStatusClass(status: LeadStatus) {
  switch (status) {
    case "NEW":
      return "bg-orange-100 text-orange-700";
    case "CONTACTED":
      return "bg-blue-100 text-blue-700";
    case "MEETING":
      return "bg-violet-100 text-violet-800";
    case "RESERVED":
      return "bg-amber-100 text-amber-900";
    case "SOLD":
      return "bg-emerald-100 text-emerald-800";
    case "CANCELED":
      return "bg-slate-100 text-slate-600";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

type Lead = {
  id: number;
  name: string;
  phone: string;
  project: string;
  projectId: number | null;
  createdAt: string;
  status: LeadStatus;
  feedbackUrl?: string;
};

type ApiLead = {
  id: number;
  name: string;
  phone: string;
  status: string;
  createdAt: string;
  project: { id: number; name: string; developerId: number } | null;
};

type FeedbackItem = {
  id: number;
  rating: number;
  comment: string | null;
  submittedAt: string;
  lead: {
    name: string;
    project: {
      name: string;
    };
  };
};

const STORAGE_KEY = "oson_uy_developer_name";
const adminHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${getToken()}`,
});

export default function LeadsPage() {
  const t = useTranslations("Dashboard.leadsPage");
  const locale = useLocale();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedbackStats, setFeedbackStats] = useState<{
    avgRating: number | null;
    totalFeedbacks: number;
    items: FeedbackItem[];
  } | null>(null);

  const [selectedLink, setSelectedLink] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState<number | "all">("all");
  const [projectOptions, setProjectOptions] = useState<
    { id: number; name: string }[]
  >([]);

  const loadLeads = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const currentDeveloper = await apiFetch<{ id: number; name: string }>(
        "/developers",
      );
      window.localStorage.setItem(STORAGE_KEY, currentDeveloper.name);
      const allProjects = await apiFetch<
        Array<{ id: number; name: string; developerId: number }>
      >("/projects/mine");
      // все проекты пользователя (владелец + участник), а не только собственные
      setProjectOptions(allProjects.map((p) => ({ id: p.id, name: p.name })));

      const leadsPath =
        projectFilter === "all"
          ? "/leads"
          : `/leads?projectId=${projectFilter}`;
      const data = await apiFetch<ApiLead[]>(leadsPath);
      const feedbackData = await apiFetch<{
        avgRating: number | null;
        totalFeedbacks: number;
        items: FeedbackItem[];
      }>("/leads/feedback/summary");
      setFeedbackStats(feedbackData);
      const rows = Array.isArray(data)
        ? data
        : (data as { items?: ApiLead[] }).items ?? [];
      setLeads(
        rows
          .map((lead) => ({
            id: lead.id,
            name: lead.name,
            phone: lead.phone,
            project: lead.project?.name ?? "—",
            projectId: lead.project?.id ?? null,
            createdAt: new Date(lead.createdAt).toISOString().slice(0, 10),
            status: (LEAD_COLUMNS.includes(lead.status as LeadStatus)
              ? lead.status
              : "NEW") as LeadStatus,
            feedbackUrl: undefined,
          })),
      );
    } catch (err) {
      if (err instanceof ApiAuthError) {
        clearSession();
      }
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [projectFilter]);

  useEffect(() => {
    void loadLeads();
  }, [loadLeads]);

  const leadsCount = useMemo(
    () => ({
      total: leads.length,
      new: leads.filter((item) => item.status === "NEW").length,
      contacted: leads.filter((item) => item.status === "CONTACTED").length,
    }),
    [leads],
  );

  const filteredLeads = useMemo(() => {
    return leads.filter(l => 
      l.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      l.phone.includes(searchQuery) ||
      l.project.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [leads, searchQuery]);

  const updateLeadStatus = async (id: number, status: LeadStatus) => {
    try {
      const response = await fetch(`${API_URL}/leads/${id}`, {
        method: "PATCH",
        headers: adminHeaders(),
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        throw new Error(`Failed to update lead (${response.status})`);
      }

      setLeads((current) =>
        current.map((lead) => (lead.id === id ? { ...lead, status } : lead)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const setContacted = (id: number) => updateLeadStatus(id, "CONTACTED");

  const createFeedbackLink = async (id: number) => {
    try {
      const response = await fetch(`${API_URL}/leads/${id}/feedback-request`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      });
      if (!response.ok) {
        throw new Error(`Failed to create feedback link (${response.status})`);
      }
      const data = (await response.json()) as { feedbackUrl: string };
      const finalUrl = data.feedbackUrl
        .replace(/^http:\/\/localhost:\d+/, "https://oson-uy.uz")
        .replace("https://oson-uy-website.vercel.app", "https://oson-uy.uz");
      setLeads((current) =>
        current.map((lead) =>
          lead.id === id ? { ...lead, feedbackUrl: finalUrl } : lead,
        ),
      );
      setSelectedLink(finalUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#1E3A8A] border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-8 px-4 animate-in fade-in duration-500 sm:px-6 lg:px-8">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div className="space-y-2">
          <h1 className="text-3xl font-black text-[#1E3A8A] tracking-tight">{t("title")}</h1>
          <p className="text-sm font-medium text-slate-500">{t("subtitle")}</p>
        </div>
        
        <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-stretch md:w-auto md:max-w-3xl md:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder={t("search")} 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-4 text-sm font-medium text-slate-900 outline-none transition-all focus:border-blue-600 focus:ring-4 focus:ring-blue-600/5"
            />
          </div>
          <select
            value={projectFilter === "all" ? "" : String(projectFilter)}
            onChange={(e) => {
              const v = e.target.value;
              setProjectFilter(v === "" ? "all" : Number(v));
            }}
            className="min-h-[48px] w-full shrink-0 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-800 outline-none focus:ring-4 focus:ring-blue-600/10 sm:w-auto md:min-w-[220px]"
            aria-label={t("projectFilter")}
          >
            <option value="">{t("projectFilterAll")}</option>
            {projectOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm font-bold flex items-center gap-2 italic">
          <X className="h-4 w-4" /> {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <LeadStatCard label={t("stats.all")} value={leadsCount.total} color="text-blue-600" />
        <LeadStatCard label={t("stats.new")} value={leadsCount.new} color="text-orange-600" />
        <LeadStatCard label={t("stats.contacted")} value={leadsCount.contacted} color="text-emerald-600" />
        <LeadStatCard label={t("stats.rating")} value={feedbackStats?.avgRating ? feedbackStats.avgRating.toFixed(1) : "—"} color="text-yellow-500" sub={`/ ${feedbackStats?.totalFeedbacks ?? 0}`} />
      </div>

      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-black text-slate-900">{t("kanbanTitle")}</h2>
          <p className="text-xs font-medium text-slate-500">{t("kanbanHint")}</p>
        </div>
        <div className="overflow-x-auto pb-3">
          <div className="flex min-w-max gap-4 sm:gap-5">
            {LEAD_COLUMNS.map((col) => (
              <div
                key={col}
                className="flex w-64 shrink-0 flex-col rounded-2xl border border-slate-100 bg-slate-50/90 p-4"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = Number(e.dataTransfer.getData("text/plain"));
                  if (id && !Number.isNaN(id)) {
                    void updateLeadStatus(id, col);
                  }
                }}
              >
                <div className="mb-3 flex items-center justify-between px-0.5">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${leadStatusClass(col)}`}>
                    {t(`status.${col}`)}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400">
                    {filteredLeads.filter((l) => l.status === col).length}
                  </span>
                </div>
                <div className="flex max-h-[420px] flex-col gap-3 overflow-y-auto">
                  {filteredLeads
                    .filter((l) => l.status === col)
                    .map((lead) => (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", String(lead.id));
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        className="cursor-grab rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md active:cursor-grabbing"
                      >
                        <p className="text-sm font-bold text-slate-900">{lead.name}</p>
                        <p className="text-[11px] text-slate-500">{lead.project}</p>
                        <p className="mt-1 text-[10px] font-medium text-slate-400">
                          {formatPhoneNumber(lead.phone)}
                        </p>
                        <div className="mt-2 flex flex-col gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void setContacted(lead.id);
                            }}
                            disabled={lead.status === "CONTACTED"}
                            className="h-8 w-full rounded-lg bg-slate-900 text-[10px] font-black uppercase tracking-wide text-white disabled:bg-slate-100 disabled:text-slate-400"
                          >
                            {t("btnContact")}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void createFeedbackLink(lead.id);
                            }}
                            disabled={!canRequestFeedback(lead.status)}
                            className="flex h-8 w-full items-center justify-center gap-1 rounded-lg border border-blue-200 bg-blue-50 text-[10px] font-black uppercase tracking-wide text-blue-800 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Star className="h-3 w-3 shrink-0" /> {t("btnFeedback")}
                          </button>
                          {lead.feedbackUrl ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedLink(lead.feedbackUrl!);
                              }}
                              className="text-[9px] font-black uppercase text-blue-600 underline"
                            >
                              {t("showLink")}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="md:hidden space-y-4">
        {filteredLeads.map((lead) => (
          <div
            key={lead.id}
            className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-bold text-slate-900">{lead.name}</p>
                <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-slate-500">
                  <PhoneCall className="h-3 w-3 shrink-0" />
                  {formatPhoneNumber(lead.phone)}
                </p>
              </div>
              <span
                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-[10px] font-black uppercase ${leadStatusClass(lead.status)}`}
              >
                {lead.status === "NEW" ? (
                  <Mail className="h-3 w-3" />
                ) : (
                  <CheckCircle2 className="h-3 w-3" />
                )}
                {t(`status.${lead.status}`)}
              </span>
            </div>
            <p className="mt-3 font-medium text-slate-700">{lead.project}</p>
            <p className="text-[10px] font-bold uppercase tracking-tight text-slate-400">
              {new Date(lead.createdAt).toLocaleDateString(
                locale === "ru" ? "ru-RU" : "uz-UZ",
              )}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setContacted(lead.id)}
                disabled={lead.status === "CONTACTED"}
                className="h-11 w-full rounded-xl bg-slate-900 text-xs font-black uppercase tracking-widest text-white transition-all hover:bg-slate-800 disabled:bg-slate-100 disabled:text-slate-400"
              >
                {t("btnContact")}
              </button>
              <button
                type="button"
                onClick={() => createFeedbackLink(lead.id)}
                disabled={!canRequestFeedback(lead.status)}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-50 text-xs font-black text-blue-700 transition-all hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Star className="h-3 w-3" /> {t("btnFeedback")}
              </button>
              {lead.feedbackUrl && (
                <button
                  type="button"
                  onClick={() => setSelectedLink(lead.feedbackUrl!)}
                  className="text-center text-[10px] font-black uppercase tracking-tighter text-blue-600 underline"
                >
                  {t("showLink")}
                </button>
              )}
            </div>
          </div>
        ))}
        {filteredLeads.length === 0 && (
          <div className="rounded-[2rem] border border-slate-100 bg-white py-16 text-center text-sm font-medium italic text-slate-400">
            {t("noResults")}
          </div>
        )}
      </div>

      <div className="hidden overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm sm:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-black tracking-widest border-b border-slate-100">
              <tr>
                <th className="px-6 py-5">{t("table.client")}</th>
                <th className="px-6 py-5">{t("table.project")}</th>
                <th className="px-6 py-5">{t("table.status")}</th>
                <th className="min-w-[220px] px-4 py-5 text-right">{t("table.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredLeads.map((lead) => (
                <tr key={lead.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{lead.name}</div>
                    <div className="text-xs text-slate-500 font-medium flex items-center gap-1.5 mt-0.5">
                      <PhoneCall className="h-3 w-3" /> {formatPhoneNumber(lead.phone)}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-700">{lead.project}</div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase mt-1 tracking-tight">
                      {new Date(lead.createdAt).toLocaleDateString(locale === "ru" ? 'ru-RU' : 'uz-UZ')}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-black uppercase ${leadStatusClass(lead.status)}`}>
                      {lead.status === "NEW" ? <Mail className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                      {t(`status.${lead.status}`)}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-col items-end gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                      <button
                        type="button"
                        onClick={() => setContacted(lead.id)}
                        disabled={lead.status === "CONTACTED"}
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 text-[10px] font-black uppercase tracking-wide text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        <PhoneCall className="h-3.5 w-3.5" />
                        {t("btnContact")}
                      </button>
                      <button
                        type="button"
                        onClick={() => createFeedbackLink(lead.id)}
                        disabled={!canRequestFeedback(lead.status)}
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 text-[10px] font-black uppercase tracking-wide text-blue-800 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Star className="h-3.5 w-3.5" />
                        {t("btnFeedback")}
                      </button>
                      {lead.feedbackUrl ? (
                        <button
                          type="button"
                          onClick={() => setSelectedLink(lead.feedbackUrl!)}
                          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wide text-blue-700 hover:bg-slate-50"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          {t("showLink")}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredLeads.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-20 text-center text-slate-400 font-medium italic">
                    {t("noResults")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {feedbackStats && feedbackStats.items && feedbackStats.items.length > 0 && (
        <div className="mt-16 space-y-8 animate-in slide-in-from-bottom-4 duration-700">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-black text-[#1E3A8A] tracking-tight">{t("lastFeedbacks")}</h2>
            <div className="flex items-center gap-2 bg-yellow-50 px-4 py-2 rounded-2xl border border-yellow-100">
              <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
              <span className="font-black text-yellow-700">{feedbackStats.avgRating?.toFixed(1)}</span>
            </div>
          </div>
          
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {feedbackStats.items.map((feedback) => (
              <div key={feedback.id} className="group relative rounded-3xl border border-slate-100 bg-white p-6 shadow-sm hover:shadow-xl transition-all hover:-translate-y-1">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex text-yellow-500">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star key={star} className={`h-4 w-4 ${star <= feedback.rating ? "fill-yellow-500" : "fill-slate-100 text-slate-100"}`} />
                    ))}
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-md">
                    {new Date(feedback.submittedAt).toLocaleDateString(locale === "ru" ? 'ru-RU' : 'uz-UZ')}
                  </span>
                </div>
                <p className="text-sm text-slate-700 font-medium leading-relaxed italic">
                  &quot;{feedback.comment || "..."}&quot;
                </p>
                <div className="mt-6 pt-4 border-t border-slate-50 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black text-slate-900">{feedback.lead?.name}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">{feedback.lead?.project?.name}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedLink && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="w-full max-w-md rounded-[2.5rem] bg-white p-8 shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-blue-50 p-3 rounded-2xl text-blue-600">
                <Mail className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-black text-slate-900 uppercase">{t("modal.link")}</h3>
            </div>
            
            <div className="space-y-3">
              <div className="relative group">
                <input 
                  type="text"
                  readOnly
                  value={selectedLink}
                  className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 pr-12 text-xs font-bold text-slate-600 outline-none"
                />
                <Copy className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
              </div>
              
              <button
                onClick={() => {
                  navigator.clipboard.writeText(selectedLink);
                  setSelectedLink(null);
                }}
                className="w-full h-14 rounded-2xl bg-[#1E3A8A] text-sm font-black text-white hover:bg-blue-800 transition-all shadow-xl shadow-blue-900/10 uppercase tracking-widest"
              >
                {t("modal.copy")}
              </button>
            </div>
            
            <button
              onClick={() => setSelectedLink(null)}
              className="mt-6 w-full text-xs font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest transition-colors"
            >
              {t("modal.close")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LeadStatCard({ label, value, color, sub }: any) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <div className="flex items-baseline gap-2">
        <p className={`text-2xl font-black ${color}`}>{value}</p>
        {sub && <span className="text-[10px] font-bold text-slate-400">{sub}</span>}
      </div>
    </div>
  );
}
