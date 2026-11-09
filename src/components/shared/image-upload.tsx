"use client";

import { useState, useRef, useCallback, DragEvent, ChangeEvent } from "react";
import Image from "next/image";
import {
  UploadCloud,
  ImagePlus,
  X,
  Loader2,
  Link2,
  Palette,
  CheckCircle2,
  AlertCircle,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { uploadToImageKit, type UploadedFileResult } from "@/lib/imagekit-upload";
import { getImageThumbnailUrl } from "@/lib/imagekit-url";
import { cn, isAllowedImageHost } from "@/lib/utils";

export interface UploadedMedia {
  fileId?: string;
  url: string;
  name?: string;
  thumbnailUrl?: string;
  size?: number;
  colorId?: string | null;
}

export interface ImageUploadProps {
  /** Target ImageKit directory path */
  folder?: string;
  /** Allow selecting and uploading multiple files */
  multiple?: boolean;
  /** Maximum file size limit in bytes (defaults to 5MB) */
  maxSizeInBytes?: number;
  /** List of accepted MIME types */
  acceptedMimeTypes?: string[];
  /** Current value: either a URL string, a single media object, or an array of media objects */
  value?: string | UploadedMedia | UploadedMedia[];
  /** Callback fired when one or more images are successfully uploaded or added via URL */
  onUploadSuccess?: (media: UploadedMedia | UploadedMedia[]) => void;
  /** Callback fired when an image is removed */
  onRemove?: (media: UploadedMedia) => void;
  /** Whether to allow manual URL insertion alongside drag-and-drop */
  allowUrlInput?: boolean;
  /** Optional color swatches for product photo color assignment */
  colorOptions?: { id: string; name: string; hex?: string }[];
  /** Active selected color ID */
  selectedColorId?: string | null;
  /** Callback when color selection changes */
  onColorChange?: (colorId: string | null) => void;
  /** Disabled state */
  disabled?: boolean;
  /** Optional heading label */
  label?: string;
  /** Optional description text */
  helperText?: string;
  /** Optional container class names */
  className?: string;
}

const DEFAULT_ACCEPTED_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
];

const DEFAULT_MAX_SIZE = 5 * 1024 * 1024; // 5MB

interface PendingUpload {
  id: string;
  fileName: string;
  previewUrl: string;
  progress: number;
  status: "uploading" | "success" | "error";
  errorMessage?: string;
}

export function ImageUpload({
  folder = "/scrubx/products",
  multiple = false,
  maxSizeInBytes = DEFAULT_MAX_SIZE,
  acceptedMimeTypes = DEFAULT_ACCEPTED_MIMES,
  value,
  onUploadSuccess,
  onRemove,
  allowUrlInput = true,
  colorOptions,
  selectedColorId,
  onColorChange,
  disabled = false,
  label,
  helperText,
  className,
}: ImageUploadProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [manualUrl, setManualUrl] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);

  // Normalize current value to array of media
  const currentMediaList: UploadedMedia[] = Array.isArray(value)
    ? value
    : value
      ? [typeof value === "string" ? { url: value, name: "Image" } : value]
      : [];

  // Validate single file against constraints (UX-only client hint; server is authoritative per SEC-007)
  const validateFile = (file: File): string | null => {
    if (!acceptedMimeTypes.includes(file.type)) {
      return `File type '${file.type}' is not supported. Please choose a JPG, PNG, WebP, or AVIF raster image.`;
    }
    if (file.size > maxSizeInBytes) {
      const maxMb = (maxSizeInBytes / (1024 * 1024)).toFixed(0);
      return `File '${file.name}' (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds the maximum allowed size of ${maxMb}MB.`;
    }
    return null;
  };

  // Process and upload a list of files
  const handleFiles = async (files: File[]) => {
    if (disabled || files.length === 0) return;

    const filesToUpload = multiple ? files : [files[0]];
    const newPendingItems: PendingUpload[] = [];

    // Pre-validation pass
    for (const file of filesToUpload) {
      const validationError = validateFile(file);
      if (validationError) {
        toast({
          title: "Invalid file",
          description: validationError,
          variant: "error",
        });
        return;
      }

      newPendingItems.push({
        id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        fileName: file.name,
        previewUrl: URL.createObjectURL(file),
        progress: 0,
        status: "uploading",
      });
    }

    setPendingUploads((prev) => [...prev, ...newPendingItems]);

    const uploadedResults: UploadedMedia[] = [];

    for (let i = 0; i < filesToUpload.length; i++) {
      const file = filesToUpload[i];
      const pendingItem = newPendingItems[i];

      try {
        const result: UploadedFileResult = await uploadToImageKit(file, {
          folder,
          onProgress: (percent) => {
            setPendingUploads((prev) =>
              prev.map((item) =>
                item.id === pendingItem.id ? { ...item, progress: percent } : item
              )
            );
          },
        });

        const newMedia: UploadedMedia = {
          fileId: result.fileId,
          url: result.url,
          name: result.name || file.name,
          thumbnailUrl: result.thumbnailUrl,
          size: result.size,
          colorId: selectedColorId,
        };

        uploadedResults.push(newMedia);

        setPendingUploads((prev) =>
          prev.map((item) =>
            item.id === pendingItem.id
              ? { ...item, progress: 100, status: "success" }
              : item
          )
        );

        toast({
          title: "Image uploaded",
          description: `'${file.name}' saved to ImageKit CDN.`,
        });
      } catch (err: unknown) {
        const error = err as Error;
        console.error("[ImageUpload Error]:", error);

        setPendingUploads((prev) =>
          prev.map((item) =>
            item.id === pendingItem.id
              ? {
                  ...item,
                  status: "error",
                  errorMessage: error.message || "Upload failed",
                }
              : item
          )
        );

        toast({
          title: "Upload failed",
          description: error.message || `Could not upload '${file.name}'.`,
          variant: "error",
        });
      }
    }

    // Clean up finished pending items after short delay
    setTimeout(() => {
      setPendingUploads((prev) =>
        prev.filter((p) => p.status === "uploading" || p.status === "error")
      );
    }, 1200);

    // Notify parent
    if (uploadedResults.length > 0 && onUploadSuccess) {
      if (multiple) {
        onUploadSuccess(uploadedResults);
      } else {
        onUploadSuccess(uploadedResults[0]);
      }
    }
  };

  // Drag-and-drop handlers
  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files);
      handleFiles(filesArray);
    }
  };

  // Native input change
  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);
      handleFiles(filesArray);
      // Reset input value so re-selecting same file triggers onChange
      e.target.value = "";
    }
  };

  // Manual URL submission (PERF-010: validate host before accepting)
  const handleAddManualUrl = () => {
    const trimmed = manualUrl.trim();
    if (!trimmed) return;

    if (!isAllowedImageHost(trimmed)) {
      toast({
        title: "Invalid Image Host",
        description: "Only HTTPS images hosted on ImageKit (ik.imagekit.io) or local paths are permitted.",
        variant: "error",
      });
      return;
    }

    const media: UploadedMedia = {
      url: trimmed,
      name: "Custom URL",
      colorId: selectedColorId,
    };

    if (onUploadSuccess) {
      onUploadSuccess(multiple ? [media] : media);
    }

    setManualUrl("");
    toast({ title: "Image URL added" });
  };

  // Remove handler (BUG-017: updates parent state only; does NOT eagerly purge remote storage)
  const handleRemoveMedia = (media: UploadedMedia) => {
    if (disabled) return;

    if (onRemove) {
      onRemove(media);
    }
  };

  return (
    <div className={cn("space-y-3.5", className)}>
      {/* Optional Label / Header */}
      {(label || helperText) && (
        <div className="space-y-0.5">
          {label && <Label className="text-[13px] font-medium text-ink">{label}</Label>}
          {helperText && <p className="text-[12px] text-ink-muted">{helperText}</p>}
        </div>
      )}

      {/* Color Tagging Selector (for product images with multi-color options) */}
      {colorOptions && colorOptions.length > 0 && onColorChange && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-muted/50 p-2.5">
          <Palette className="h-4 w-4 text-brand-600" />
          <span className="text-[12.5px] font-medium text-ink">Upload for color:</span>
          <Select
            value={selectedColorId ?? "shared"}
            onValueChange={(val) => onColorChange(val === "shared" ? null : val)}
            disabled={disabled}
          >
            <SelectTrigger className="h-8 w-[190px] text-[12px] bg-surface">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="shared">Shared (All colors)</SelectItem>
              {colorOptions.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <div className="flex items-center gap-2">
                    {c.hex && (
                      <span
                        className="h-3 w-3 rounded-full border border-line-strong"
                        style={{ backgroundColor: c.hex }}
                      />
                    )}
                    <span>{c.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Drag & Drop Upload Dropzone */}
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
        className={cn(
          "group relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-all",
          isDragging
            ? "border-brand-500 bg-brand-50/60 ring-4 ring-brand-100"
            : "border-line-strong bg-surface hover:border-brand-400 hover:bg-surface-muted/40",
          disabled && "cursor-not-allowed opacity-60"
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptedMimeTypes.join(",")}
          multiple={multiple}
          onChange={handleFileInputChange}
          disabled={disabled}
          className="hidden"
        />

        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-600 transition-transform group-hover:scale-105">
          <UploadCloud className="h-6 w-6" />
        </div>

        <p className="mt-2.5 text-[13.5px] font-medium text-ink">
          <span className="text-brand-600 hover:underline">Click to upload</span> or drag and drop
        </p>

        <p className="mt-1 text-[11.5px] text-ink-muted">
          PNG, JPG, WebP, AVIF or SVG (Max {(maxSizeInBytes / (1024 * 1024)).toFixed(0)}MB
          {multiple ? " per file" : ""})
        </p>

        {folder && (
          <Badge variant="outline" className="mt-2.5 text-[10.5px] font-mono text-ink-muted">
            Destination: {folder}
          </Badge>
        )}
      </div>

      {/* In-Flight Uploads Progress List */}
      {pendingUploads.length > 0 && (
        <div className="space-y-2">
          {pendingUploads.map((pending) => (
            <div
              key={pending.id}
              className="flex items-center gap-3 rounded-lg border border-line bg-surface p-2.5 shadow-xs"
            >
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-line bg-surface-muted">
                <Image
                  src={pending.previewUrl}
                  alt={pending.fileName}
                  fill
                  unoptimized
                  className="object-cover"
                />
              </div>

              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="truncate font-medium text-ink">{pending.fileName}</span>
                  <span className="text-ink-muted">
                    {pending.status === "uploading" && `${pending.progress}%`}
                    {pending.status === "success" && "Uploaded"}
                    {pending.status === "error" && "Error"}
                  </span>
                </div>

                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className={cn(
                      "h-full transition-all duration-300",
                      pending.status === "uploading" && "bg-brand-500",
                      pending.status === "success" && "bg-emerald-500",
                      pending.status === "error" && "bg-rose-500"
                    )}
                    style={{ width: `${pending.progress}%` }}
                  />
                </div>

                {pending.errorMessage && (
                  <p className="text-[11px] text-rose-600">{pending.errorMessage}</p>
                )}
              </div>

              <div className="shrink-0">
                {pending.status === "uploading" && (
                  <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
                )}
                {pending.status === "success" && (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                )}
                {pending.status === "error" && (
                  <AlertCircle className="h-4 w-4 text-rose-600" />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Single Mode Preview (when multiple=false and value is set) */}
      {!multiple && currentMediaList.length > 0 && currentMediaList[0].url && (
        <div className="relative overflow-hidden rounded-lg border border-line bg-surface p-3">
          <div className="flex items-center gap-3.5">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-line bg-surface-muted">
              <Image
                src={getImageThumbnailUrl(currentMediaList[0].url, 120)}
                alt={currentMediaList[0].name || "Uploaded preview"}
                fill
                className="object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-ink">
                {currentMediaList[0].name || "Category Image"}
              </p>
              <p className="truncate font-mono text-[11px] text-ink-muted">
                {currentMediaList[0].url}
              </p>
              {currentMediaList[0].fileId && (
                <Badge variant="brand" className="mt-1 text-[10px]">
                  ImageKit Managed
                </Badge>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleRemoveMedia(currentMediaList[0])}
              className="text-ink-muted hover:text-rose-600"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Manual URL Input Toggle (Backward Compatibility & Mock Presets) */}
      {allowUrlInput && (
        <div className="pt-1">
          {!showUrlInput ? (
            <button
              type="button"
              onClick={() => setShowUrlInput(true)}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-brand-600 hover:text-brand-700 hover:underline"
            >
              <Link2 className="h-3.5 w-3.5" />
              <span>Or enter external / mock image URL</span>
            </button>
          ) : (
            <div className="rounded-lg border border-line bg-surface-muted/40 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="manual-url" className="text-[12px] font-medium text-ink">
                  Image URL
                </Label>
                <button
                  type="button"
                  onClick={() => setShowUrlInput(false)}
                  className="text-[11px] text-ink-muted hover:text-ink"
                >
                  Cancel
                </button>
              </div>
              <div className="flex gap-2">
                <Input
                  id="manual-url"
                  placeholder="https://... or /products/..."
                  value={manualUrl}
                  onChange={(e) => setManualUrl(e.target.value)}
                  className="h-8 text-[12px]"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAddManualUrl}
                  disabled={!manualUrl.trim() || disabled}
                  className="h-8 px-3 text-[12px]"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
