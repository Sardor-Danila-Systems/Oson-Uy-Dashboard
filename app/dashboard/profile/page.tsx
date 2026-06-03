"use client";

import { useEffect, useState } from "react";
import { apiFetch, API_URL, getToken } from "@/lib/api";
import { useTranslations } from "next-intl";
import {
  Building2,
  Camera,
  Check,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  X,
} from "lucide-react";

type Project = {
  id: number;
  name: string;
  subscription?: {
    plan?: "START" | "PRO" | "PREMIUM" | "ULTIMATE";
    status?: "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";
  } | null;
};

type TelegramLinkResponse = {
  deepLink: string;
  expiresAt: string;
};

type CompanyForm = {
  phone: string;
  legalAddress: string;
  officeAddress: string;
  website: string;
  description: string;
  logoUrl: string;
};

const emptyForm: CompanyForm = {
  phone: "",
  legalAddress: "",
  officeAddress: "",
  website: "",
  description: "",
  logoUrl: "",
};

export default function ProfilePage() {
  const t = useTranslations("Dashboard.profile");
  const [name, setName] = useState("");
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [telegramLink, setTelegramLink] = useState<string | null>(null);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [telegramErrorMsg, setTelegramErrorMsg] = useState<string | null>(null);
  const [copyDone, setCopyDone] = useState(false);
  const [developerId, setDeveloperId] = useState<number | null>(null);

  const [form, setForm] = useState<CompanyForm>(emptyForm);
  const [saved, setSaved] = useState<CompanyForm>(emptyForm);
  const [editing, setEditing] = useState(false);
  const [companySaving, setCompanySaving] = useState(false);
  const [companySaved, setCompanySaved] = useState(false);
  const [companyError, setCompanyError] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  const loadProfile = async () => {
    const [developer, projectsData] = await Promise.all([
      apiFetch<{
        id: number;
        name: string;
        telegramLinked?: boolean;
        phone?: string | null;
        legalAddress?: string | null;
        officeAddress?: string | null;
        website?: string | null;
        description?: string | null;
        logoUrl?: string | null;
      }>("/developers"),
      apiFetch<Project[]>("/projects"),
    ]);
    setDeveloperId(developer.id);
    setName(developer.name);
    setTelegramLinked(Boolean(developer.telegramLinked));
    const next: CompanyForm = {
      phone: developer.phone ?? "",
      legalAddress: developer.legalAddress ?? "",
      officeAddress: developer.officeAddress ?? "",
      website: developer.website ?? "",
      description: developer.description ?? "",
      logoUrl: developer.logoUrl ?? "",
    };
    setForm(next);
    setSaved(next);
    setProjects(projectsData.filter((item) => item.subscription));
  };

  useEffect(() => {
    void (async () => {
      try {
        await loadProfile();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (editing) return;
      void (async () => {
        try {
          await loadProfile();
        } catch {
          /* ignore */
        }
      })();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [editing]);

  const requestTelegramLink = async () => {
    setTelegramLoading(true);
    setTelegramErrorMsg(null);
    setError(null);
    try {
      const data = await apiFetch<TelegramLinkResponse>(
        "/developers/me/telegram-link",
      );
      setTelegramLink(data.deepLink);
    } catch {
      setTelegramErrorMsg(t("telegramError"));
    } finally {
      setTelegramLoading(false);
    }
  };

  const copyLink = async () => {
    if (!telegramLink) return;
    await navigator.clipboard.writeText(telegramLink);
    setCopyDone(true);
    window.setTimeout(() => setCopyDone(false), 2500);
  };

  const startEdit = () => {
    setForm(saved);
    setCompanyError(null);
    setCompanySaved(false);
    setEditing(true);
  };

  const cancelEdit = () => {
    setForm(saved);
    setCompanyError(null);
    setEditing(false);
  };

  const saveCompany = async () => {
    if (developerId == null) return;
    setCompanySaving(true);
    setCompanyError(null);
    setCompanySaved(false);
    try {
      await apiFetch(`/developers/${developerId}`, {
        method: "PATCH",
        body: JSON.stringify({
          phone: form.phone.trim() || undefined,
          legalAddress: form.legalAddress.trim() || undefined,
          officeAddress: form.officeAddress.trim() || undefined,
          website: form.website.trim() || undefined,
          description: form.description.trim() || undefined,
          logoUrl: form.logoUrl.trim() || undefined,
        }),
      });
      setSaved(form);
      setEditing(false);
      setCompanySaved(true);
      window.setTimeout(() => setCompanySaved(false), 2500);
    } catch (e) {
      setCompanyError(e instanceof Error ? e.message : t("companySaveError"));
    } finally {
      setCompanySaving(false);
    }
  };

  const uploadLogo = async (file: File | undefined) => {
    if (!file) return;
    setLogoUploading(true);
    setCompanyError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_URL}/upload/image`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      });
      const data = (await res.json()) as { url?: string };
      if (data.url) setForm((prev) => ({ ...prev, logoUrl: data.url as string }));
    } catch {
      setCompanyError(t("companyLogoError"));
    } finally {
      setLogoUploading(false);
    }
  };

  const initials = (name || "?")
    .split(" ")
    .map((part) => part.charAt(0))
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const view = editing ? form : saved;
  const websiteHref = view.website
    ? view.website.startsWith("http")
      ? view.website
      : `https://${view.website}`
    : null;

  const contacts = [
    { icon: Phone, label: t("companyPhone"), value: view.phone },
    {
      icon: Globe,
      label: t("companyWebsite"),
      value: view.website,
      href: websiteHref,
    },
    { icon: MapPin, label: t("companyLegalAddress"), value: view.legalAddress },
    {
      icon: Building2,
      label: t("companyOfficeAddress"),
      value: view.officeAddress,
    },
  ];

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold text-[#1E3A8A]">{t("title")}</h2>
          <p className="mt-1 text-slate-600">{t("subtitle")}</p>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
        {!loading && !editing && (
          <button
            type="button"
            onClick={startEdit}
            className="inline-flex items-center gap-2 rounded-xl border border-blue-100 bg-white px-4 py-2.5 text-sm font-bold text-[#1E3A8A] shadow-sm transition hover:bg-blue-50"
          >
            <Pencil className="h-4 w-4" />
            {t("editProfile")}
          </button>
        )}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-blue-100 bg-white p-5 text-slate-500">
          {t("loading")}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main profile card */}
          <div className="lg:col-span-2 space-y-6">
            <div className="overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-sm">
              <div className="h-28 bg-linear-to-r from-[#1E3A8A] via-blue-600 to-sky-500 sm:h-32" />
              <div className="px-6 pb-6">
                <div className="-mt-14 flex flex-col items-center text-center">
                  <div className="relative">
                    <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-slate-100 shadow-md">
                      {view.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={view.logoUrl}
                          alt={name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-2xl font-bold text-[#1E3A8A]">
                          {initials}
                        </span>
                      )}
                      {logoUploading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                          <Loader2 className="h-6 w-6 animate-spin text-[#1E3A8A]" />
                        </div>
                      )}
                    </div>
                    {editing && (
                      <label
                        className="absolute -bottom-1 -right-1 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-[#1E3A8A] text-white shadow-md transition hover:bg-blue-900"
                        title={view.logoUrl ? t("replaceLogo") : t("uploadLogo")}
                      >
                        <Camera className="h-4 w-4" />
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => void uploadLogo(e.target.files?.[0])}
                        />
                      </label>
                    )}
                  </div>

                  <h3 className="mt-4 text-2xl font-bold text-[#1E3A8A]">
                    {name || "—"}
                  </h3>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {t("developer")}
                  </p>
                </div>

                {companyError && (
                  <p className="mt-4 text-center text-sm text-red-600">
                    {companyError}
                  </p>
                )}
                {companySaved && (
                  <p className="mt-4 flex items-center justify-center gap-1.5 text-sm font-medium text-emerald-700">
                    <Check className="h-4 w-4" />
                    {t("companySaved")}
                  </p>
                )}

                <div className="mt-6 border-t border-slate-100 pt-6">
                  {editing ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="block space-y-1.5">
                        <span className="text-xs font-semibold text-slate-500">
                          {t("companyPhone")}
                        </span>
                        <input
                          type="tel"
                          value={form.phone}
                          onChange={(e) =>
                            setForm((p) => ({ ...p, phone: e.target.value }))
                          }
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#1E3A8A]"
                        />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-xs font-semibold text-slate-500">
                          {t("companyWebsite")}
                        </span>
                        <input
                          type="url"
                          value={form.website}
                          onChange={(e) =>
                            setForm((p) => ({ ...p, website: e.target.value }))
                          }
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#1E3A8A]"
                        />
                      </label>
                      <label className="block space-y-1.5 md:col-span-2">
                        <span className="text-xs font-semibold text-slate-500">
                          {t("companyLegalAddress")}
                        </span>
                        <input
                          value={form.legalAddress}
                          onChange={(e) =>
                            setForm((p) => ({
                              ...p,
                              legalAddress: e.target.value,
                            }))
                          }
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#1E3A8A]"
                        />
                      </label>
                      <label className="block space-y-1.5 md:col-span-2">
                        <span className="text-xs font-semibold text-slate-500">
                          {t("companyOfficeAddress")}
                        </span>
                        <input
                          value={form.officeAddress}
                          onChange={(e) =>
                            setForm((p) => ({
                              ...p,
                              officeAddress: e.target.value,
                            }))
                          }
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#1E3A8A]"
                        />
                      </label>
                      <label className="block space-y-1.5 md:col-span-2">
                        <span className="text-xs font-semibold text-slate-500">
                          {t("companyDescription")}
                        </span>
                        <textarea
                          value={form.description}
                          onChange={(e) =>
                            setForm((p) => ({
                              ...p,
                              description: e.target.value,
                            }))
                          }
                          rows={4}
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#1E3A8A]"
                        />
                      </label>
                      <div className="flex flex-wrap gap-3 md:col-span-2">
                        <button
                          type="button"
                          onClick={() => void saveCompany()}
                          disabled={companySaving}
                          className="inline-flex items-center gap-2 rounded-xl bg-[#1E3A8A] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-900 disabled:opacity-60"
                        >
                          {companySaving ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                          {t("companySave")}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          disabled={companySaving}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                        >
                          <X className="h-4 w-4" />
                          {t("cancel")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          {t("aboutTitle")}
                        </h4>
                        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">
                          {view.description || t("noDescription")}
                        </p>
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          {t("contactsTitle")}
                        </h4>
                        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                          {contacts.map((item) => (
                            <div
                              key={item.label}
                              className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3"
                            >
                              <div className="mt-0.5 rounded-lg bg-white p-2 text-[#1E3A8A] shadow-sm">
                                <item.icon className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <dt className="text-xs text-slate-400">
                                  {item.label}
                                </dt>
                                <dd className="mt-0.5 wrap-break-word text-sm font-medium text-slate-800">
                                  {item.value ? (
                                    item.href ? (
                                      <a
                                        href={item.href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[#1E3A8A] hover:underline"
                                      >
                                        {item.value}
                                      </a>
                                    ) : (
                                      item.value
                                    )
                                  ) : (
                                    <span className="text-slate-400">
                                      {t("notSpecified")}
                                    </span>
                                  )}
                                </dd>
                              </div>
                            </div>
                          ))}
                        </dl>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <div className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-sky-50 p-3 text-sky-600">
                  <MessageCircle className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  <h3 className="text-lg font-bold text-[#1E3A8A]">
                    {t("telegramTitle")}
                  </h3>
                  <p className="text-sm text-slate-600">{t("telegramDesc")}</p>
                  {telegramLinked ? (
                    <p className="text-sm font-medium text-emerald-700">
                      {t("telegramLinked")}
                    </p>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => void requestTelegramLink()}
                        disabled={telegramLoading}
                        className="rounded-xl bg-[#1E3A8A] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-900 disabled:opacity-60"
                      >
                        {telegramLoading ? "…" : t("telegramGetLink")}
                      </button>
                      {telegramErrorMsg && (
                        <p className="text-sm text-red-600">{telegramErrorMsg}</p>
                      )}
                      {copyDone && (
                        <p className="text-sm text-emerald-700">
                          {t("telegramCopied")}
                        </p>
                      )}
                      {telegramLink && (
                        <div className="space-y-2">
                          <p className="text-xs text-slate-500">
                            {t("telegramExpires")}
                          </p>
                          <p className="text-xs text-slate-500">
                            {t("telegramRefreshHint")}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <a
                              href={telegramLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-800"
                            >
                              {t("telegramOpen")}{" "}
                              <ExternalLink className="h-4 w-4" />
                            </a>
                            <button
                              type="button"
                              onClick={() => void copyLink()}
                              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700"
                            >
                              <Copy className="h-4 w-4" />
                              {t("telegramCopy")}
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-bold text-[#1E3A8A]">
                {t("subscriptionsTitle")}
              </h3>
              <p className="mt-1 text-sm text-slate-600">{t("billingInfo")}</p>
              <div className="mt-4 space-y-3">
                {projects.length === 0 ? (
                  <p className="text-sm text-slate-400">{t("notSpecified")}</p>
                ) : (
                  projects.map((project) => (
                    <article
                      key={project.id}
                      className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4"
                    >
                      <h4 className="font-semibold text-[#1E3A8A]">
                        {project.name}
                      </h4>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[#1E3A8A]/10 px-2.5 py-0.5 text-xs font-semibold text-[#1E3A8A]">
                          {t(`plans.${project.subscription?.plan ?? "START"}`)}
                        </span>
                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                          {t(
                            `statuses.${project.subscription?.status ?? "TRIAL"}`,
                          )}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        {t("activationInfo")}
                      </p>
                    </article>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
