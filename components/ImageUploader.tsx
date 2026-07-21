"use client";

import { useCallback, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ImagePlus,
  Loader2,
  UploadCloud,
  X,
} from "lucide-react";

/** One optimised image returned by the backend pipeline. */
export type UploadedImage = {
  imageUrl: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  mimeType?: string;
  optimizedSize?: number;
};

export type UploaderLabels = {
  choose: string;
  hint: string;
  selected: string;
  totalSize: string;
  upload: string;
  uploading: string;
  completed: string;
  original: string;
  optimized: string;
  saved: string;
  rejectedFormat: string;
  maxReached: string;
  uploadFailed: string;
  uploadedOk: string;
};

type Props = {
  apiUrl: string;
  token: string | null;
  folder?: "projects" | "developers" | "avatars" | "news";
  /** Hard cap of images per project. */
  max: number;
  /** How many images are already saved in the gallery. */
  current: number;
  onUploaded: (items: UploadedImage[]) => void;
  onNotice?: (message: string, type: "success" | "error") => void;
  labels: UploaderLabels;
};

const ACCEPTED_MIME = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/avif",
];
const ACCEPTED_EXT = ["jpg", "jpeg", "png", "webp", "heic", "heif", "avif"];
const ACCEPT_ATTR = ".jpg,.jpeg,.png,.webp,.heic,.heif,.avif,image/*";

type Staged = {
  id: string;
  file: File;
  previewUrl: string;
  width: number;
  height: number;
  status: "idle" | "uploading" | "done" | "error";
  progress: number;
  optimizedSize?: number;
};

function formatBytes(bytes: number): string {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = url;
  });
}

function isAccepted(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return ACCEPTED_MIME.includes(file.type.toLowerCase()) || ACCEPTED_EXT.includes(ext);
}

export function ImageUploader({
  apiUrl,
  token,
  folder = "projects",
  max,
  current,
  onUploaded,
  onNotice,
  labels,
}: Props) {
  const [staged, setStaged] = useState<Staged[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const room = Math.max(0, max - current - staged.length);
  const totalSize = staged.reduce((sum, s) => sum + s.file.size, 0);

  const addFiles = useCallback(
    async (fileList: File[]) => {
      if (!fileList.length) return;
      const accepted = fileList.filter(isAccepted);
      const rejected = fileList.length - accepted.length;

      const freeSlots = Math.max(0, max - current - staged.length);
      const toAdd = accepted.slice(0, freeSlots);
      const overflow = accepted.length - toAdd.length;

      const items: Staged[] = await Promise.all(
        toAdd.map(async (file) => {
          const previewUrl = URL.createObjectURL(file);
          const dims = await readDimensions(previewUrl);
          return {
            id:
              typeof crypto !== "undefined" && crypto.randomUUID
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random()}`,
            file,
            previewUrl,
            width: dims.width,
            height: dims.height,
            status: "idle" as const,
            progress: 0,
          };
        }),
      );

      if (items.length) setStaged((prev) => [...prev, ...items]);
      if (rejected > 0) onNotice?.(labels.rejectedFormat, "error");
      else if (overflow > 0) onNotice?.(labels.maxReached, "error");
    },
    [current, max, staged.length, labels, onNotice],
  );

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    void addFiles(Array.from(e.target.files ?? []));
    if (inputRef.current) inputRef.current.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isUploading) return;
    void addFiles(Array.from(e.dataTransfer.files ?? []));
  };

  const removeStaged = (id: string) => {
    setStaged((prev) => {
      const target = prev.find((s) => s.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((s) => s.id !== id);
    });
  };

  const patch = (id: string, data: Partial<Staged>) =>
    setStaged((prev) => prev.map((s) => (s.id === id ? { ...s, ...data } : s)));

  /** Upload one file with real progress; resolves to the saved image or null. */
  const uploadOne = (item: Staged): Promise<UploadedImage | null> =>
    new Promise((resolve) => {
      const form = new FormData();
      form.append("file", item.file);
      form.append("folder", folder);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${apiUrl}/upload/image`);
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          // Cap network progress at 90%; the last 10% is server-side encoding.
          patch(item.id, { progress: Math.round((e.loaded / e.total) * 90) });
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            patch(item.id, {
              status: "done",
              progress: 100,
              optimizedSize: data.optimizedSize,
            });
            resolve({
              imageUrl: data.imageUrl ?? data.url,
              thumbnailUrl: data.thumbnailUrl,
              width: data.width,
              height: data.height,
              mimeType: data.mimeType,
              optimizedSize: data.optimizedSize,
            });
            return;
          } catch {
            /* fall through to error */
          }
        }
        patch(item.id, { status: "error", progress: 0 });
        resolve(null);
      };

      xhr.onerror = () => {
        patch(item.id, { status: "error", progress: 0 });
        resolve(null);
      };

      patch(item.id, { status: "uploading", progress: 0 });
      xhr.send(form);
    });

  const handleUpload = async () => {
    const pending = staged.filter((s) => s.status === "idle" || s.status === "error");
    if (!pending.length || isUploading) return;
    setIsUploading(true);

    // One failure never cancels the others.
    const results = await Promise.all(pending.map((p) => uploadOne(p)));
    const ok = results.filter((r): r is UploadedImage => r !== null);
    const failed = results.length - ok.length;

    if (ok.length) {
      onUploaded(ok);
      onNotice?.(labels.uploadedOk, "success");
    }
    if (failed > 0) onNotice?.(labels.uploadFailed, "error");

    // Keep only the files that failed (so the manager can retry); drop the rest.
    setStaged((prev) => {
      prev.filter((s) => s.status === "done").forEach((s) => URL.revokeObjectURL(s.previewUrl));
      return prev.filter((s) => s.status === "error");
    });
    setIsUploading(false);
  };

  const canUpload = staged.some((s) => s.status !== "done") && !isUploading;

  return (
    <div className="space-y-4">
      {/* Dropzone / picker */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!isUploading) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => !isUploading && room > 0 && inputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-all ${
          room === 0
            ? "cursor-not-allowed border-slate-100 bg-slate-50 opacity-60"
            : isDragging
              ? "border-orange-400 bg-orange-50 cursor-pointer"
              : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100 cursor-pointer"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          onChange={onPick}
          disabled={isUploading || room === 0}
          className="hidden"
        />
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm">
          <ImagePlus className="h-5 w-5" />
        </div>
        <p className="text-sm font-black text-slate-700">{labels.choose}</p>
        <p className="text-xs font-medium text-slate-400">{labels.hint}</p>
      </div>

      {/* Summary + upload button */}
      {staged.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3">
          <div className="flex gap-6 text-sm">
            <span className="font-bold text-slate-700">
              {labels.selected}:{" "}
              <span className="text-orange-500">
                {current + staged.length} / {max}
              </span>
            </span>
            <span className="font-bold text-slate-700">
              {labels.totalSize}:{" "}
              <span className="text-slate-500">{formatBytes(totalSize)}</span>
            </span>
          </div>
          <button
            type="button"
            onClick={handleUpload}
            disabled={!canUpload}
            className="flex h-11 items-center gap-2 rounded-xl bg-slate-900 px-6 text-[11px] font-black uppercase tracking-widest text-white transition-all hover:bg-slate-800 disabled:opacity-40"
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UploadCloud className="h-4 w-4" />
            )}
            {isUploading ? labels.uploading : labels.upload}
          </button>
        </div>
      )}

      {/* Preview cards */}
      {staged.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {staged.map((s) => {
            const compression =
              s.optimizedSize && s.file.size
                ? Math.max(0, Math.round((1 - s.optimizedSize / s.file.size) * 100))
                : null;
            return (
              <div
                key={s.id}
                className="flex gap-3 rounded-2xl border border-slate-100 bg-white p-3"
              >
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.previewUrl} alt={s.file.name} className="h-full w-full object-cover" />
                  {s.status === "done" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-emerald-500/70">
                      <CheckCircle2 className="h-7 w-7 text-white" />
                    </div>
                  )}
                  {s.status === "error" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-red-500/70">
                      <AlertCircle className="h-7 w-7 text-white" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-bold text-slate-800" title={s.file.name}>
                      {s.file.name}
                    </p>
                    {s.status !== "uploading" && (
                      <button
                        type="button"
                        onClick={() => removeStaged(s.id)}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-red-500 hover:text-white"
                        aria-label="remove"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <p className="mt-0.5 text-xs font-medium text-slate-400">
                    {formatBytes(s.file.size)}
                    {s.width > 0 && ` · ${s.width}×${s.height}px`}
                  </p>

                  {/* Progress / result line */}
                  {s.status === "uploading" && (
                    <div className="mt-2">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-orange-500 transition-all"
                          style={{ width: `${s.progress}%` }}
                        />
                      </div>
                      <p className="mt-1 text-[11px] font-bold text-slate-400">
                        {labels.uploading} {s.progress}%
                      </p>
                    </div>
                  )}

                  {s.status === "done" && (
                    <p className="mt-2 text-[11px] font-bold text-emerald-600">
                      {labels.completed} · {labels.original} {formatBytes(s.file.size)} →{" "}
                      {labels.optimized} {formatBytes(s.optimizedSize ?? 0)}
                      {compression !== null && ` · −${compression}% ${labels.saved}`}
                    </p>
                  )}

                  {s.status === "error" && (
                    <p className="mt-2 text-[11px] font-bold text-red-500">
                      {labels.uploadFailed}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
