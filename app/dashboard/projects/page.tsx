"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  API_URL,
  ApiAuthError,
  apiFetch,
  clearSession,
  getToken,
} from "@/lib/api";
import { formatUzs } from "@/lib/currency";
import { 
  Plus, 
  Building2, 
  MapPin, 
  Layers, 
  Home, 
  Calendar, 
  Video, 
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  QrCode,
  ChevronRight,
  Edit2,
  Loader2,
  DollarSign,
  Navigation,
  ListChecks,
  LayoutGrid,
  Users,
  Lock,
  FileText,
  BarChart2,
} from "lucide-react";
import { UZB_LOCATIONS } from "@/lib/locations";
import { useTranslations, useLocale } from "next-intl";
import { hasUltimateWorkspaceAccess } from "@/lib/subscription-access";

type Project = {
  id: number;
  name: string;
  location: string;
  district: string;
  description: string;
  advantages: string;
  materials: string;
  hasInstallment: boolean;
  buildingCount: string;
  corpusCount: string;
  ceilingHeightM: string;
  hasSurfaceParking: boolean;
  hasUndergroundParking: boolean;
  surfaceParkingSpaces: string;
  undergroundParkingSpaces: string;
  elevatorsCount: string;
  latitude: string;
  longitude: string;
  mapEmbedUrl: string;
  qrCodeUrl: string;
  totalFloors: string;
  totalUnits: string;
  pricePerM2From: string;
  imageUrl: string;
  videoUrl?: string;
  deliveryDate: string;
  developerId: number;
  plan?: "START" | "PRO" | "PREMIUM" | "ULTIMATE";
  subscriptionStatus?: "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";
  media?: Array<{ imageUrl: string }>;
};

type ProjectForm = Omit<Project, "id">;
type Developer = { id: number; name: string; qrCodeUrl?: string };

const defaultForm: ProjectForm = {
  name: "",
  location: UZB_LOCATIONS[0].region,
  district: UZB_LOCATIONS[0].districts[0],
  description: "",
  advantages: "",
  materials: "",
  hasInstallment: false,
  buildingCount: "",
  corpusCount: "",
  ceilingHeightM: "",
  hasSurfaceParking: false,
  hasUndergroundParking: false,
  surfaceParkingSpaces: "",
  undergroundParkingSpaces: "",
  elevatorsCount: "",
  latitude: "",
  longitude: "",
  mapEmbedUrl: "",
  qrCodeUrl: "",
  totalFloors: "",
  totalUnits: "",
  pricePerM2From: "",
  imageUrl: "",
  videoUrl: "",
  deliveryDate: "",
  developerId: 0,
};

const toEmbedMapUrl = (value: string) => {
  const raw = value.trim();
  if (!raw) return "";
  if (raw.includes("/maps/embed") || raw.includes("output=embed")) return raw;
  return `https://www.google.com/maps?q=${encodeURIComponent(raw)}&output=embed`;
};

export default function ProjectsPage() {
  const t = useTranslations("Dashboard.projects");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const [projects, setProjects] = useState<Project[]>([]);
  const [form, setForm] = useState<ProjectForm>(defaultForm);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadedImageUrls, setUploadedImageUrls] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingProjectQr, setIsUploadingProjectQr] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeDeveloperId, setActiveDeveloperId] = useState<number | null>(null);

  const resetForm = () => {
    setForm(defaultForm);
    setSelectedFiles([]);
    setUploadedImageUrls([]);
    setEditingId(null);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const projectsData = await apiFetch<any[]>("/projects");
      const currentDeveloper = await apiFetch<Developer>("/developers");
      
      setActiveDeveloperId(currentDeveloper.id);
      setForm((current) => ({ ...current, developerId: currentDeveloper.id }));
      
      const ownProjects = projectsData.filter(p => p.developerId === currentDeveloper.id);
      setProjects(
        ownProjects.map((project) => ({
          id: project.id,
          name: project.name,
          location: project.location,
          district: project.district ?? "",
          description: project.description ?? "",
          advantages: (project.advantages ?? []).join(", "),
          materials: (project.materials ?? []).join(", "),
          hasInstallment: Boolean(project.hasInstallment),
          buildingCount:
            project.buildingCount != null ? String(project.buildingCount) : "",
          corpusCount:
            project.corpusCount != null ? String(project.corpusCount) : "",
          ceilingHeightM:
            project.ceilingHeightM != null ? String(project.ceilingHeightM) : "",
          hasSurfaceParking: Boolean(project.hasSurfaceParking),
          hasUndergroundParking: Boolean(project.hasUndergroundParking),
          surfaceParkingSpaces:
            project.surfaceParkingSpaces != null
              ? String(project.surfaceParkingSpaces)
              : "",
          undergroundParkingSpaces:
            project.undergroundParkingSpaces != null
              ? String(project.undergroundParkingSpaces)
              : "",
          elevatorsCount:
            project.elevatorsCount != null ? String(project.elevatorsCount) : "",
          latitude: project.latitude != null ? String(project.latitude) : "",
          longitude: project.longitude != null ? String(project.longitude) : "",
          mapEmbedUrl: project.mapEmbedUrl ?? "",
          qrCodeUrl: project.qrCodeUrl ?? "",
          totalFloors: project.totalFloors ? String(project.totalFloors) : "",
          totalUnits: project.totalUnits ? String(project.totalUnits) : "",
          imageUrl: project.imageUrl,
          videoUrl: project.videoUrl ?? "",
          deliveryDate: project.deliveryDate,
          developerId: project.developerId,
          media: project.media,
          pricePerM2From: (() => {
            if (!project.floors?.length) return "";
            const vals = project.floors
              .map((f: any) => f.pricePerM2 || 0)
              .filter((x: number) => x > 0);
            if (!vals.length) return "";
            return String(Math.round(Math.min(...vals)));
          })(),
          plan: project.subscription?.plan,
          subscriptionStatus: project.subscription?.status,
        })),
      );
    } catch (err) {
      if (err instanceof ApiAuthError) clearSession();
      setError(err instanceof Error ? err.message : "Error loading data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setError(null);
      const { 
        id, 
        media, 
        pricePerM2From, 
        plan, 
        subscriptionStatus, 
        ...safeForm 
      } = form as any;

      const optInt = (s: string) => {
        const t = s.trim();
        if (!t) return undefined;
        const n = Number(t);
        return Number.isFinite(n) ? Math.trunc(n) : undefined;
      };
      const optFloat = (s: string) => {
        const t = s.trim();
        if (!t) return undefined;
        const n = Number(t);
        return Number.isFinite(n) ? n : undefined;
      };

      const payload = {
        ...safeForm,
        advantages: form.advantages.split(",").map(i => i.trim()).filter(Boolean),
        materials: form.materials.split(",").map(i => i.trim()).filter(Boolean),
        hasInstallment: form.hasInstallment,
        buildingCount: optInt(form.buildingCount),
        corpusCount: optInt(form.corpusCount),
        ceilingHeightM: optFloat(form.ceilingHeightM),
        hasSurfaceParking: form.hasSurfaceParking,
        hasUndergroundParking: form.hasUndergroundParking,
        surfaceParkingSpaces: optInt(form.surfaceParkingSpaces),
        undergroundParkingSpaces: optInt(form.undergroundParkingSpaces),
        elevatorsCount: optInt(form.elevatorsCount),
        latitude: optFloat(form.latitude),
        longitude: optFloat(form.longitude),
        totalFloors: Number(form.totalFloors) || 0,
        totalUnits: Number(form.totalUnits) || 0,
        mapEmbedUrl: toEmbedMapUrl(form.mapEmbedUrl),
        imageUrls: uploadedImageUrls.length ? uploadedImageUrls : undefined,
        developerId: activeDeveloperId,
      };

      const response = await fetch(
        editingId ? `${API_URL}/projects/${editingId}` : `${API_URL}/projects`,
        {
          method: editingId ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) throw new Error("Error saving project");
      await loadData();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const onEdit = (project: Project) => {
    setEditingId(project.id);
    const mediaUrls = project.media?.map((m) => m.imageUrl) ?? [];
    setUploadedImageUrls([...new Set([project.imageUrl, ...mediaUrls])].filter(Boolean));
    setForm({ ...project });
    document.getElementById("project-form")?.scrollIntoView({ behavior: "smooth" });
  };

  const uploadSelectedImages = async () => {
    if (!selectedFiles.length) return;
    try {
      setIsUploading(true);
      const uploaded = await Promise.all(
        selectedFiles.map(async (file) => {
          const formData = new FormData();
          formData.append("file", file);
          const res = await fetch(`${API_URL}/upload/image`, {
            method: "POST",
            headers: { Authorization: `Bearer ${getToken()}` },
            body: formData,
          });
          return (await res.json()).url;
        })
      );
      setUploadedImageUrls(prev => [...prev, ...uploaded]);
      if (!form.imageUrl) setForm(f => ({ ...f, imageUrl: uploaded[0] }));
      setSelectedFiles([]);
    } catch (err) {
      setError("Error uploading images");
    } finally {
      setIsUploading(false);
    }
  };

  const uploadProjectQr = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setIsUploadingProjectQr(true);
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_URL}/upload/image`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      });
      const data = await res.json();
      setForm(f => ({ ...f, qrCodeUrl: data.url }));
    } catch (err) {
      setError("Error uploading QR");
    } finally {
      setIsUploadingProjectQr(false);
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
    <div className="space-y-10 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-black text-[#1E3A8A] tracking-tight">{t("title")}</h1>
          <p className="text-slate-500 font-medium">{t("subtitle")}</p>
        </div>
        <button 
          onClick={() => {
            document.getElementById("project-form")?.scrollIntoView({ behavior: "smooth" });
            resetForm();
          }}
          className="h-14 px-8 rounded-2xl bg-[#1E3A8A] text-white font-black uppercase tracking-widest shadow-xl shadow-blue-900/10 hover:bg-blue-800 transition-all flex items-center gap-2"
        >
          <Plus className="h-5 w-5" /> {t("newProject")}
        </button>
      </div>

      {error && (
        <div className="p-6 bg-red-50 border border-red-100 rounded-3xl text-red-600 font-bold flex items-center gap-3">
          <AlertCircle className="h-6 w-6" /> {error}
        </div>
      )}

      {/* Projects List Grid */}
      <div className="grid gap-8 sm:grid-cols-2">
        {projects.map((project) => (
          <div key={project.id} className="group rounded-[2.5rem] border border-slate-100 bg-white overflow-hidden shadow-sm hover:shadow-2xl transition-all hover:-translate-y-1">
            <div className="relative h-64">
              <img src={project.imageUrl} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" alt={project.name} />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-transparent" />
              <div className="absolute bottom-6 left-6 right-6 flex items-end justify-between">
                <div>
                  <span className="text-[10px] font-black text-white/70 uppercase tracking-widest mb-1 block">{project.location}</span>
                  <h3 className="text-2xl font-black text-white tracking-tight">{project.name}</h3>
                </div>
                <div className="flex gap-2">
                  {(() => {
                    const ultraOk = hasUltimateWorkspaceAccess({
                      plan: project.plan,
                      status: project.subscriptionStatus,
                    });
                    const lockCls =
                      "h-10 w-10 flex items-center justify-center rounded-xl bg-amber-500/90 backdrop-blur-md text-white ring-2 ring-amber-200/80 hover:bg-amber-500 transition-all";
                    const openCls =
                      "h-10 w-10 flex items-center justify-center rounded-xl bg-white/20 backdrop-blur-md text-white hover:bg-white hover:text-slate-900 transition-all";
                    return (
                      <>
                        {ultraOk ? (
                          <Link
                            href={`/dashboard/projects/${project.id}/chessboard`}
                            className={openCls}
                            title={t("chessboard")}
                            aria-label={t("chessboard")}
                          >
                            <LayoutGrid className="h-4 w-4" />
                          </Link>
                        ) : (
                          <Link
                            href="/dashboard/subscriptions"
                            className={lockCls}
                            title={t("ultraUpgradeHint")}
                            aria-label={t("ultraOnlyChessboard")}
                          >
                            <Lock className="h-4 w-4" />
                          </Link>
                        )}
                        {ultraOk ? (
                          <Link
                            href={`/dashboard/projects/${project.id}/customers`}
                            className={openCls}
                            title={t("customers")}
                            aria-label={t("customers")}
                          >
                            <Users className="h-4 w-4" />
                          </Link>
                        ) : (
                          <Link
                            href="/dashboard/subscriptions"
                            className={lockCls}
                            title={t("ultraUpgradeHint")}
                            aria-label={t("ultraOnlyCustomers")}
                          >
                            <Lock className="h-4 w-4" />
                          </Link>
                        )}
                        {ultraOk ? (
                          <Link
                            href={`/dashboard/projects/${project.id}/contracts`}
                            className={openCls}
                            title="Договоры"
                            aria-label="Договоры"
                          >
                            <FileText className="h-4 w-4" />
                          </Link>
                        ) : (
                          <Link href="/dashboard/subscriptions" className={lockCls} title="Только ULTIMATE">
                            <Lock className="h-4 w-4" />
                          </Link>
                        )}
                        {ultraOk ? (
                          <Link
                            href={`/dashboard/projects/${project.id}/reports`}
                            className={openCls}
                            title="Отчёты"
                            aria-label="Отчёты"
                          >
                            <BarChart2 className="h-4 w-4" />
                          </Link>
                        ) : (
                          <Link href="/dashboard/subscriptions" className={lockCls} title="Только ULTIMATE">
                            <Lock className="h-4 w-4" />
                          </Link>
                        )}
                      </>
                    );
                  })()}
                  <Link
                    href={`/dashboard/progress?projectId=${project.id}`}
                    className="h-10 w-10 flex items-center justify-center rounded-xl bg-white/20 backdrop-blur-md text-white hover:bg-white hover:text-slate-900 transition-all"
                    title={t("progress")}
                    aria-label={t("progress")}
                  >
                    <ListChecks className="h-4 w-4" />
                  </Link>
                  <button 
                    onClick={() => onEdit(project)}
                    className="h-10 w-10 flex items-center justify-center rounded-xl bg-white/20 backdrop-blur-md text-white hover:bg-white hover:text-slate-900 transition-all"
                    type="button"
                    aria-label={t("edit")}
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {project.subscriptionStatus === "ACTIVE" && (
                <div className="absolute top-6 right-6 bg-emerald-500 text-white text-[10px] font-black uppercase px-3 py-1.5 rounded-full shadow-lg">
                  Active {project.plan}
                </div>
              )}
            </div>

            <div className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <ProjectInfoItem icon={<Layers className="h-4 w-4" />} label={t("info.floors")} value={`${project.totalFloors} ${t("info.floorSuffix")}`} />
                <ProjectInfoItem icon={<Home className="h-4 w-4" />} label={t("info.units")} value={`${project.totalUnits} ${t("info.unitSuffix")}`} />
                <ProjectInfoItem icon={<Calendar className="h-4 w-4" />} label={t("info.delivery")} value={project.deliveryDate} />
                <ProjectInfoItem icon={<DollarSign className="h-4 w-4" />} label={t("info.fromPerM2")} value={Number(project.pricePerM2From) > 0 ? `${formatUzs(Number(project.pricePerM2From))} / м²` : tc("negotiablePrice")} />
              </div>

              <div className="pt-6 border-t border-slate-50 flex items-center justify-between">
                <div className="flex -space-x-2">
                  {project.media?.slice(0, 3).map((m, i) => (
                    <img key={i} src={m.imageUrl} className="h-8 w-8 rounded-full border-2 border-white object-cover" />
                  ))}
                  {project.media && project.media.length > 3 && (
                    <div className="h-8 w-8 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
                      +{project.media.length - 3}
                    </div>
                  )}
                </div>
                <button 
                  onClick={() => onEdit(project)}
                  className="text-sm font-black text-[#1E3A8A] uppercase tracking-widest flex items-center gap-1 group-hover:gap-2 transition-all"
                >
                  {t("details")} <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Main Form Section */}
      <div id="project-form" className="scroll-mt-10">
        <form onSubmit={onSubmit} className="rounded-[3rem] border border-slate-100 bg-white p-10 shadow-sm space-y-12">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-orange-50 flex items-center justify-center text-orange-600">
              <Plus className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">{editingId ? t("editProject") : t("addProject")}</h2>
              <p className="text-sm text-slate-500 font-medium">{t("formSubtitle")}</p>
            </div>
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            <div className="space-y-6">
              <FormInput label={t("form.name")} value={form.name} onChange={(v: string) => setForm(f => ({ ...f, name: v }))} placeholder={t("form.placeholderName")} required />
              
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">{t("form.region")}</label>
                <div className="relative">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <select
                    value={form.location}
                    onChange={(e) => {
                      const region = e.target.value;
                      const firstDistrict = UZB_LOCATIONS.find(l => l.region === region)?.districts[0] || "";
                      setForm(f => ({ ...f, location: region, district: firstDistrict }));
                    }}
                    required
                    className="h-14 w-full rounded-2xl bg-slate-50 border border-slate-100 pl-11 pr-4 text-sm font-bold outline-none ring-blue-600/10 focus:ring-4 focus:bg-white focus:border-blue-600 transition-all text-black appearance-none"
                  >
                    <option value="" disabled>{t("form.chooseRegion")}</option>
                    {UZB_LOCATIONS.map(l => <option key={l.region} value={l.region}>{l.region}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">{t("form.district")}</label>
                <div className="relative">
                  <Navigation className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <select
                    value={form.district}
                    onChange={(e) => setForm(f => ({ ...f, district: e.target.value }))}
                    required
                    className="h-14 w-full rounded-2xl bg-slate-50 border border-slate-100 pl-11 pr-4 text-sm font-bold outline-none ring-blue-600/10 focus:ring-4 focus:bg-white focus:border-blue-600 transition-all text-black appearance-none"
                  >
                    <option value="" disabled>{t("form.chooseDistrict")}</option>
                    {(UZB_LOCATIONS.find(l => l.region === form.location)?.districts || []).map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormInput label={t("form.floors")} value={form.totalFloors} onChange={(v: string) => setForm(f => ({ ...f, totalFloors: v }))} type="number" />
                <FormInput label={t("form.units")} value={form.totalUnits} onChange={(v: string) => setForm(f => ({ ...f, totalUnits: v }))} type="number" />
              </div>
              <FormInput label={t("form.delivery")} value={form.deliveryDate} onChange={(v: string) => setForm(f => ({ ...f, deliveryDate: v }))} placeholder={t("form.placeholderDelivery")} required />
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">{t("form.description")}</label>
                <textarea 
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full min-h-[120px] rounded-2xl bg-slate-50 border border-slate-100 p-6 text-sm font-medium outline-none focus:bg-white focus:border-blue-600 transition-all text-black"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">{t("form.advantages")}</label>
                <textarea
                  value={form.advantages}
                  onChange={(e) => setForm((f) => ({ ...f, advantages: e.target.value }))}
                  placeholder={t("form.advantagesHint")}
                  className="w-full min-h-[80px] rounded-2xl bg-slate-50 border border-slate-100 p-6 text-sm font-medium outline-none focus:bg-white focus:border-blue-600 transition-all text-black"
                />
              </div>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">{t("form.media")}</label>
                <div className="flex gap-4">
                  <div className="relative flex-1">
                    <input type="file" multiple accept="image/*" onChange={e => setSelectedFiles(Array.from(e.target.files || []))} className="absolute inset-0 opacity-0 cursor-pointer" />
                    <div className="h-14 w-full rounded-2xl border-2 border-dashed border-slate-100 flex items-center justify-center gap-2 text-slate-400 text-sm font-bold bg-slate-50 hover:bg-slate-100 transition-all">
                      <ImageIcon className="h-4 w-4" /> {t("form.chooseFiles")}
                    </div>
                  </div>
                  <button 
                    type="button" 
                    onClick={uploadSelectedImages} 
                    disabled={!selectedFiles.length || isUploading}
                    className="h-14 px-6 rounded-2xl bg-slate-900 text-white font-black uppercase text-[10px] tracking-widest disabled:opacity-50"
                  >
                    {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : t("form.upload")}
                  </button>
                </div>
                {uploadedImageUrls.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mt-4">
                    {uploadedImageUrls.map((url, i) => (
                      <div key={i} className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${form.imageUrl === url ? "border-orange-500 shadow-lg" : "border-transparent opacity-60 hover:opacity-100"}`} onClick={() => setForm(f => ({ ...f, imageUrl: url }))}>
                        <img src={url} className="h-full w-full object-cover" />
                        {form.imageUrl === url && <div className="absolute inset-0 bg-orange-500/10 flex items-center justify-center"><CheckCircle2 className="text-white h-6 w-6" /></div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <FormInput label={t("form.video")} value={form.videoUrl || ""} onChange={(v: string) => setForm(f => ({ ...f, videoUrl: v }))} placeholder={t("form.placeholderVideo")} />
              <FormInput label={t("form.map")} value={form.mapEmbedUrl} onChange={(v: string) => setForm(f => ({ ...f, mapEmbedUrl: v }))} placeholder={t("form.placeholderMap")} />
              
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">{t("form.qr")}</label>
                <div className="flex items-center gap-4">
                  <div className="relative h-20 w-20 rounded-2xl border-2 border-dashed border-slate-100 flex items-center justify-center bg-slate-50 overflow-hidden">
                    {form.qrCodeUrl ? <img src={form.qrCodeUrl} className="h-full w-full object-cover" /> : <QrCode className="h-8 w-8 text-slate-200" />}
                    <input type="file" onChange={uploadProjectQr} className="absolute inset-0 opacity-0 cursor-pointer" />
                  </div>
                  <p className="text-xs text-slate-400 font-medium leading-relaxed">{t("form.qrDesc")}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-100 bg-slate-50/80 p-8 space-y-8">
            <div>
              <h3 className="text-lg font-black text-slate-900 tracking-tight">{t("form.specsTitle")}</h3>
              <p className="text-sm text-slate-500 font-medium mt-1">{t("form.specsSubtitle")}</p>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <label className="flex items-center gap-3 cursor-pointer rounded-2xl border border-slate-100 bg-white p-4">
                <input
                  type="checkbox"
                  checked={form.hasInstallment}
                  onChange={(e) => setForm((f) => ({ ...f, hasInstallment: e.target.checked }))}
                  className="h-5 w-5 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                />
                <span className="text-sm font-bold text-slate-800">{t("form.hasInstallment")}</span>
              </label>
              <FormInput label={t("form.materials")} value={form.materials} onChange={(v: string) => setForm(f => ({ ...f, materials: v }))} placeholder={t("form.materialsHint")} />
              <FormInput label={t("form.buildingCount")} value={form.buildingCount} onChange={(v: string) => setForm(f => ({ ...f, buildingCount: v }))} type="number" />
              <FormInput label={t("form.corpusCount")} value={form.corpusCount} onChange={(v: string) => setForm(f => ({ ...f, corpusCount: v }))} type="number" />
              <FormInput label={t("form.ceilingHeightM")} value={form.ceilingHeightM} onChange={(v: string) => setForm(f => ({ ...f, ceilingHeightM: v }))} type="number" />
              <FormInput label={t("form.elevatorsCount")} value={form.elevatorsCount} onChange={(v: string) => setForm(f => ({ ...f, elevatorsCount: v }))} type="number" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">{t("form.parkingTitle")}</p>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex items-center gap-3 cursor-pointer rounded-2xl border border-slate-100 bg-white p-4">
                  <input
                    type="checkbox"
                    checked={form.hasSurfaceParking}
                    onChange={(e) => setForm((f) => ({ ...f, hasSurfaceParking: e.target.checked }))}
                    className="h-5 w-5 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                  />
                  <span className="text-sm font-bold text-slate-800">{t("form.hasSurfaceParking")}</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer rounded-2xl border border-slate-100 bg-white p-4">
                  <input
                    type="checkbox"
                    checked={form.hasUndergroundParking}
                    onChange={(e) => setForm((f) => ({ ...f, hasUndergroundParking: e.target.checked }))}
                    className="h-5 w-5 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                  />
                  <span className="text-sm font-bold text-slate-800">{t("form.hasUndergroundParking")}</span>
                </label>
                <FormInput label={t("form.surfaceParkingSpaces")} value={form.surfaceParkingSpaces} onChange={(v: string) => setForm(f => ({ ...f, surfaceParkingSpaces: v }))} type="number" />
                <FormInput label={t("form.undergroundParkingSpaces")} value={form.undergroundParkingSpaces} onChange={(v: string) => setForm(f => ({ ...f, undergroundParkingSpaces: v }))} type="number" />
              </div>
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">{t("form.coordsTitle")}</p>
              <p className="text-xs text-slate-500 mb-4">{t("form.coordsHint")}</p>
              <div className="grid gap-4 md:grid-cols-2">
                <FormInput label={t("form.latitude")} value={form.latitude} onChange={(v: string) => setForm(f => ({ ...f, latitude: v }))} placeholder={t("form.latitudePlaceholder")} />
                <FormInput label={t("form.longitude")} value={form.longitude} onChange={(v: string) => setForm(f => ({ ...f, longitude: v }))} placeholder={t("form.longitudePlaceholder")} />
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-4 pt-6">
            <button type="submit" className="flex-1 h-20 rounded-[2rem] bg-[#F97316] text-white text-xl font-black uppercase tracking-[0.2em] shadow-2xl shadow-orange-900/20 hover:bg-orange-600 transition-all active:scale-[0.98]">
              {editingId ? t("save") : t("create")}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm} className="h-20 px-10 rounded-[2rem] bg-slate-100 text-slate-400 font-black uppercase tracking-widest hover:bg-slate-200 transition-all">
                {t("cancel")}
              </button>
            )}
          </div>
        </form>
      </div>

    </div>
  );
}

function ProjectInfoItem({ icon, label, value }: any) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-1 h-8 w-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400">
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">{label}</p>
        <p className="text-sm font-black text-slate-900 mt-0.5">{value}</p>
      </div>
    </div>
  );
}

function FormInput({ label, value, onChange, placeholder, type = "text", required = false }: any) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">{label}</label>
      <input 
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="h-14 w-full rounded-2xl bg-slate-50 border border-slate-100 px-6 text-sm font-bold outline-none ring-blue-600/10 focus:ring-4 focus:bg-white focus:border-blue-600 transition-all text-black"
      />
    </div>
  );
}
