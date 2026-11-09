'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  GripVertical,
  ImagePlus,
  Info,
  Layers,
  Palette,
  Plus,
  Save,
  Sparkles,
  Star,
  Trash2,
  Wand2,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Input, Textarea } from "../components/ui/input";
import { Label, FieldError, FieldHint } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Switch } from "../components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { PageHeader } from "../components/shared/page-header";
import { ProductStatusBadge } from "../components/shared/status-badges";
import { ConfirmDialog } from "../components/shared/confirm-dialog";
import { useToast } from "../components/ui/toast";
import { useCan } from "../components/providers/role-provider";
import { ImageUpload, type UploadedMedia } from "../components/shared/image-upload";
import { COLOR_LIBRARY } from "../lib/constants";
import { formatPKR } from "../lib/format";
import { cn, slugify, uid } from "../lib/utils";
import type { Product, ProductColor, ProductImage, ProductVariant, Category } from "../lib/types";
import { createProductAction, updateProductAction } from "../actions/products";

const APPAREL_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL"];
const SHOE_SIZES = ["36", "37", "38", "39", "40", "41", "42"];
const ONE_SIZE = "One Size";

const basicsSchema = z.object({
  name: z.string().min(3, "Product name must be at least 3 characters"),
  slug: z
    .string()
    .min(2, "Slug is required")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens only"),
  description: z.string().min(20, "Add a description of at least 20 characters"),
  categoryId: z.string().min(1, "Select a category"),
  brand: z.string().min(2, "Brand is required"),
  gender: z.enum(["unisex", "men", "women", "kids"]),
  material: z.string().min(2, "Material is required"),
  status: z.enum(["draft", "active", "archived"]),
  engraveable: z.boolean(),
  featured: z.boolean(),
});

type BasicsForm = z.infer<typeof basicsSchema>;

const IMAGE_LIBRARY = [
  "/products/scrubs-teal.jpg",
  "/products/scrubs-navy.jpg",
  "/products/lab-coat.jpg",
  "/products/stethoscope.jpg",
  "/products/mask.jpg",
  "/products/gloves.jpg",
  "/products/shoes.jpg",
  "/products/scrub-cap.jpg",
  "/products/bp-monitor.jpg",
  "/products/oximeter.jpg",
  "/products/penlight.jpg",
  "/products/badge.jpg",
  "/products/compression-socks.jpg",
  "/products/face-shield.jpg",
  "/products/first-aid.jpg",
  "/products/pocket-book.jpg",
];

const colorCode = (name: string) => name.split(" ")[0].slice(0, 3).toUpperCase();
const sizeCode = (size: string) =>
  size.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3) || "OS";

interface ColorEditorProps {
  colors: ProductColor[];
  editingColorId: string | null;
  colorDraft: { name: string; hex: string };
  onSetEditingColorId: (id: string | null) => void;
  onUpdateColor: (colorId: string, patch: Partial<ProductColor>) => void;
  onRemoveColor: (colorId: string) => void;
  onSetColorDraft: React.Dispatch<React.SetStateAction<{ name: string; hex: string }>>;
  onAddColor: () => void;
}

const ColorEditor = React.memo(function ColorEditor({
  colors,
  editingColorId,
  colorDraft,
  onSetEditingColorId,
  onUpdateColor,
  onRemoveColor,
  onSetColorDraft,
  onAddColor,
}: ColorEditorProps) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Colours</h2>
          <p className="text-[12.5px] text-ink-muted">
            Add at least one colour to generate variants and associate photos.
          </p>
        </div>
        <Badge variant="brand">
          <Palette className="h-3 w-3" />
          {colors.length} colour{colors.length === 1 ? "" : "s"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {colors.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong bg-surface-muted/50 px-4 py-8 text-center">
            <Palette className="mx-auto h-5 w-5 text-ink-muted" />
            <p className="mt-2 text-[13px] font-medium text-ink">No colours yet</p>
            <p className="text-[12px] text-ink-muted">
              Add a colour to unlock colour-specific images and variants.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {colors.map((color) => (
              <div
                key={color.id}
                className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface px-3 py-2.5"
              >
                <span
                  className="h-7 w-7 shrink-0 rounded-full border border-line-strong"
                  style={{ backgroundColor: color.hex }}
                />
                {editingColorId === color.id ? (
                  <>
                    <Input
                      defaultValue={color.name}
                      className="h-8 w-44"
                      onBlur={(e) => {
                        onUpdateColor(color.id, { name: e.target.value });
                        onSetEditingColorId(null);
                      }}
                    />
                    <input
                      type="color"
                      value={color.hex}
                      className="h-8 w-10 cursor-pointer rounded border border-line-strong bg-surface p-0.5"
                      onChange={(e) => onUpdateColor(color.id, { hex: e.target.value })}
                    />
                    <Button type="button" size="sm" variant="ghost" onClick={() => onSetEditingColorId(null)}>
                      Done
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-ink">{color.name}</p>
                      <p className="font-mono text-[11.5px] text-ink-muted">{color.hex}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onSetEditingColorId(color.id)}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => onRemoveColor(color.id)}
                      aria-label={`Remove ${color.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="rounded-lg border border-line bg-surface-muted/50 p-3.5">
          <Label htmlFor="colorName">Add a colour</Label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Input
              id="colorName"
              value={colorDraft.name}
              onChange={(e) => onSetColorDraft((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Peacock Teal"
              className="h-9 w-52"
            />
            <input
              type="color"
              aria-label="Pick colour"
              value={colorDraft.hex}
              onChange={(e) => onSetColorDraft((prev) => ({ ...prev, hex: e.target.value }))}
              className="h-9 w-12 cursor-pointer rounded-md border border-line-strong bg-surface p-1"
            />
            <Button type="button" variant="outline" onClick={onAddColor}>
              <Plus className="h-4 w-4" />
              Add colour
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[11.5px] text-ink-muted">Quick picks:</span>
            {COLOR_LIBRARY.slice(0, 10).map((preset) => (
              <button
                key={preset.id}
                type="button"
                title={preset.name}
                onClick={() => onSetColorDraft((prev) => ({ ...prev, name: preset.name, hex: preset.hex }))}
                className="h-6 w-6 rounded-full border border-line-strong transition-transform hover:scale-110"
                style={{ backgroundColor: preset.hex }}
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

interface ImagePanelProps {
  images: ProductImage[];
  colors: ProductColor[];
  imageColor: string;
  imageUrl: string;
  onSetImageUrl: (url: string) => void;
  onSetImageColor: (colorId: string) => void;
  onAddImage: (url: string, colorId: string | null) => void;
  onAddUploadedMedia: (mediaList: UploadedMedia | UploadedMedia[]) => void;
  onMoveImage: (imageId: string, direction: -1 | 1) => void;
  onRemoveImage: (imageId: string) => void;
  onSetMainImage: (imageId: string) => void;
}

const ImagePanel = React.memo(function ImagePanel({
  images,
  colors,
  imageColor,
  imageUrl,
  onSetImageUrl,
  onSetImageColor,
  onAddImage,
  onAddUploadedMedia,
  onMoveImage,
  onRemoveImage,
  onSetMainImage,
}: ImagePanelProps) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Product images</h2>
          <p className="text-[12.5px] text-ink-muted">
            Shared images are used when no colour is selected; colour images override them.
          </p>
        </div>
        <Badge variant="navy">
          <ImagePlus className="h-3 w-3" />
          {images.length} image{images.length === 1 ? "" : "s"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <ImageUpload
          folder="/scrubx/products"
          multiple={true}
          colorOptions={colors}
          selectedColorId={imageColor === "shared" ? null : imageColor}
          onColorChange={(cId) => onSetImageColor(cId ?? "shared")}
          onUploadSuccess={onAddUploadedMedia}
          helperText="Upload product photos directly to ImageKit CDN."
        />

        {images.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong bg-surface-muted/50 px-4 py-8 text-center">
            <ImagePlus className="mx-auto h-5 w-5 text-ink-muted" />
            <p className="mt-2 text-[13px] font-medium text-ink">No images uploaded</p>
            <p className="text-[12px] text-ink-muted">
              Upload photos above, add an image URL below, or pick one from the mock library.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {images.map((image, index) => (
              <div
                key={image.id}
                className={cn(
                  "group relative overflow-hidden rounded-lg border bg-surface",
                  image.isMain ? "border-brand-400 ring-2 ring-brand-100" : "border-line",
                )}
              >
                <div className="relative aspect-square w-full overflow-hidden bg-surface-muted">
                  <Image
                    src={image.url}
                    alt={image.alt}
                    fill
                    sizes="(max-width: 768px) 50vw, 160px"
                    className="object-cover"
                  />
                </div>
                <div className="flex items-center justify-between gap-1 border-t border-line px-2 py-1.5">
                  <span className="truncate text-[11px] text-ink-muted">
                    {image.colorId
                      ? colors.find((c) => c.id === image.colorId)?.name ?? "Colour"
                      : "Shared"}
                  </span>
                  <div className="flex items-center gap-1">
                    {image.fileId && (
                      <span className="rounded bg-brand-50 px-1 py-0.5 text-[9.5px] font-medium text-brand-700">
                        IK
                      </span>
                    )}
                    {image.isMain && <Badge variant="brand">Main</Badge>}
                  </div>
                </div>
                <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-navy-900/70 px-1.5 py-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <div className="flex gap-0.5">
                    <button
                      type="button"
                      onClick={() => onMoveImage(image.id, -1)}
                      className="rounded p-1 text-white hover:bg-white/15"
                      aria-label="Move image earlier"
                    >
                      <GripVertical className="h-3.5 w-3.5 rotate-90" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onMoveImage(image.id, 1)}
                      className="rounded p-1 text-white hover:bg-white/15"
                      aria-label="Move image later"
                    >
                      <GripVertical className="h-3.5 w-3.5 -rotate-90" />
                    </button>
                  </div>
                  <div className="flex gap-0.5">
                    <button
                      type="button"
                      onClick={() => onSetMainImage(image.id)}
                      className="rounded p-1 text-white hover:bg-white/15"
                      aria-label="Set as main image"
                    >
                      <Star className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveImage(image.id)}
                      className="rounded p-1 text-white hover:bg-white/15"
                      aria-label="Remove image"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <span className="absolute left-1.5 top-1.5 rounded bg-navy-900/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  {index + 1}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-lg border border-line bg-surface-muted/50 p-3.5">
          <Label htmlFor="imageUrl">Add image by URL</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            <Input
              id="imageUrl"
              value={imageUrl}
              onChange={(e) => onSetImageUrl(e.target.value)}
              placeholder="https://… or /products/…"
              className="h-9 min-w-[220px] flex-1"
            />
            <Select value={imageColor} onValueChange={onSetImageColor}>
              <SelectTrigger className="w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="shared">Shared (all colours)</SelectItem>
                {colors.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              onClick={() => onAddImage(imageUrl, imageColor === "shared" ? null : imageColor)}
            >
              <Plus className="h-4 w-4" />
              Add image
            </Button>
          </div>

          <p className="mt-3 text-[11.5px] font-medium uppercase tracking-wider text-ink-muted">
            Mock library
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {IMAGE_LIBRARY.map((src) => (
              <button
                key={src}
                type="button"
                onClick={() => onAddImage(src, imageColor === "shared" ? null : imageColor)}
                className="relative h-14 w-14 overflow-hidden rounded-md border border-line transition-transform hover:scale-105"
                title={src}
              >
                <Image src={src} alt={src} fill sizes="56px" className="object-cover" />
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

interface VariantMatrixProps {
  variants: ProductVariant[];
  colors: ProductColor[];
  sizes: string[];
  variantError: string | null;
  onToggleSize: (size: string) => void;
  onGenerateVariants: () => void;
  onOpenManual: () => void;
  onUpdateVariant: (variantId: string, patch: Partial<ProductVariant>) => void;
  onDeleteVariant: (variant: ProductVariant) => void;
}

const VariantMatrix = React.memo(function VariantMatrix({
  variants,
  colors,
  sizes,
  variantError,
  onToggleSize,
  onGenerateVariants,
  onOpenManual,
  onUpdateVariant,
  onDeleteVariant,
}: VariantMatrixProps) {
  const prices = variants.map((v) => v.price).filter((p) => p > 0);
  const priceRange = prices.length
    ? { min: Math.min(...prices), max: Math.max(...prices) }
    : null;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Variants</h2>
          <p className="text-[12.5px] text-ink-muted">
            Generate from colours × sizes, then fine-tune pricing and stock inline.
          </p>
        </div>
        <Badge variant="brand">
          <Layers className="h-3 w-3" />
          {variants.length} variant{variants.length === 1 ? "" : "s"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-line bg-surface-muted/50 p-3.5">
            <Label>Available sizes</Label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[...APPAREL_SIZES, ...SHOE_SIZES, ONE_SIZE].map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => onToggleSize(size)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors",
                    sizes.includes(size)
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-line-strong bg-surface text-ink-muted hover:text-ink-soft",
                  )}
                >
                  {size}
                </button>
              ))}
            </div>
            <FieldHint>Selected: {sizes.length ? sizes.join(", ") : "none yet"}</FieldHint>
          </div>

          <div className="flex flex-col justify-between gap-3 rounded-lg border border-line bg-surface-muted/50 p-3.5">
            <div>
              <Label>Generate variants</Label>
              <p className="mt-1 text-[12px] text-ink-muted">
                Creates one variant per colour and size. Values you have already edited are
                preserved.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={onGenerateVariants}>
                <Wand2 className="h-4 w-4" />
                {variants.length ? "Regenerate variants" : "Generate variants"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={onOpenManual}
                disabled={colors.length === 0}
              >
                <Plus className="h-4 w-4" />
                Add manually
              </Button>
            </div>
          </div>
        </div>

        {variantError && (
          <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5 text-[12.5px] text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {variantError}
          </div>
        )}

        {variants.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong bg-surface-muted/50 px-4 py-8 text-center">
            <Layers className="mx-auto h-5 w-5 text-ink-muted" />
            <p className="mt-2 text-[13px] font-medium text-ink">No variants yet</p>
            <p className="text-[12px] text-ink-muted">
              Choose sizes and press “Generate variants” to build sellable combinations.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-line">
            <div className="max-h-[420px] overflow-auto scrollbar-thin">
              <table className="w-full min-w-[900px] border-collapse text-[12.5px]">
                <thead className="sticky top-0 z-10 bg-surface-muted">
                  <tr className="text-left">
                    <th className="border-b border-line px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-ink-muted">
                      Colour
                    </th>
                    <th className="border-b border-line px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-ink-muted">
                      Size
                    </th>
                    <th className="border-b border-line px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-ink-muted">
                      SKU
                    </th>
                    <th className="border-b border-line px-3 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wider text-ink-muted">
                      Price
                    </th>
                    <th className="border-b border-line px-3 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wider text-ink-muted">
                      Compare
                    </th>
                    <th className="border-b border-line px-3 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wider text-ink-muted">
                      Stock
                    </th>
                    <th className="border-b border-line px-3 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wider text-ink-muted">
                      Reorder
                    </th>
                    <th className="border-b border-line px-3 py-2 text-center text-[10.5px] font-semibold uppercase tracking-wider text-ink-muted">
                      Active
                    </th>
                    <th className="border-b border-line px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {variants.map((variant) => (
                    <tr key={variant.id} className="border-b border-line last:border-0 hover:bg-surface-muted/60">
                      <td className="px-3 py-1.5">
                        <span className="flex items-center gap-2">
                          <span
                            className="h-4 w-4 shrink-0 rounded-full border border-line-strong"
                            style={{ backgroundColor: variant.colorHex }}
                          />
                          <span className="truncate text-[12.5px] text-ink">{variant.colorName}</span>
                        </span>
                      </td>
                      <td className="px-3 py-1.5">
                        <Input
                          value={variant.size}
                          onChange={(e) =>
                            onUpdateVariant(variant.id, {
                              size: e.target.value,
                              name: `${variant.colorName} / ${e.target.value}`,
                            })
                          }
                          className="h-7 w-20 px-2 text-[12px]"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <Input
                          value={variant.sku}
                          onChange={(e) => onUpdateVariant(variant.id, { sku: e.target.value })}
                          className="h-7 w-40 px-2 font-mono text-[11.5px]"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <Input
                          type="number"
                          min={0}
                          value={variant.price}
                          onChange={(e) =>
                            onUpdateVariant(variant.id, { price: Number(e.target.value) })
                          }
                          className="h-7 w-24 px-2 text-right text-[12.5px] tabular"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <Input
                          type="number"
                          min={0}
                          value={variant.compareAtPrice ?? ""}
                          placeholder="—"
                          onChange={(e) =>
                            onUpdateVariant(variant.id, {
                              compareAtPrice: e.target.value === "" ? null : Number(e.target.value),
                            })
                          }
                          className="h-7 w-24 px-2 text-right text-[12.5px] tabular"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <Input
                          type="number"
                          min={0}
                          value={variant.stock}
                          onChange={(e) =>
                            onUpdateVariant(variant.id, { stock: Number(e.target.value) })
                          }
                          className="h-7 w-20 px-2 text-right text-[12.5px] tabular"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <Input
                          type="number"
                          min={0}
                          value={variant.reorderLevel}
                          onChange={(e) =>
                            onUpdateVariant(variant.id, { reorderLevel: Number(e.target.value) })
                          }
                          className="h-7 w-20 px-2 text-right text-[12.5px] tabular"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <Switch
                          checked={variant.active}
                          onCheckedChange={(checked) =>
                            onUpdateVariant(variant.id, { active: checked })
                          }
                          aria-label={`Toggle ${variant.name}`}
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => onDeleteVariant(variant)}
                          aria-label={`Remove ${variant.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface-muted/60 px-3 py-2 text-[12px] text-ink-muted">
              <span>
                {variants.length} variants · {variants.filter((v) => v.active).length} active ·
                total stock {variants.reduce((s, v) => s + v.stock, 0)}
              </span>
              <span>
                {priceRange
                  ? priceRange.min === priceRange.max
                    ? formatPKR(priceRange.min)
                    : `${formatPKR(priceRange.min)} – ${formatPKR(priceRange.max)}`
                  : "Set variant pricing"}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

interface ProductFormProps {
  id?: string;
  initialProduct?: Product;
  initialCategories?: Category[];
}

export default function ProductFormPage({
  id: propId,
  initialProduct,
  initialCategories = [],
}: ProductFormProps = {}) {
  const routeParams = useParams();
  const id = propId ?? (routeParams?.id as string | undefined);
  const router = useRouter();
  const { toast } = useToast();
  const canWrite = useCan("product:write");
  const isEdit = Boolean(id);

  const existing = initialProduct;
  const categories = initialCategories;

  const [colors, setColors] = useState<ProductColor[]>(existing?.colors ?? []);
  const [images, setImages] = useState<ProductImage[]>(existing?.images ?? []);
  const [sizes, setSizes] = useState<string[]>(
    existing ? [...new Set(existing.variants.map((v) => v.size))] : [],
  );
  const [variants, setVariants] = useState<ProductVariant[]>(existing?.variants ?? []);
  const [slugTouched, setSlugTouched] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageColor, setImageColor] = useState<string>("shared");
  const [manualOpen, setManualOpen] = useState(false);
  const [deleteVariant, setDeleteVariant] = useState<ProductVariant | null>(null);
  const [variantError, setVariantError] = useState<string | null>(null);
  const [colorDraft, setColorDraft] = useState({ name: "", hex: "#0F766E" });
  const [editingColorId, setEditingColorId] = useState<string | null>(null);

  const slugPrefix = useMemo(() => {
    const base = slugify(existing?.name ?? "scrubx-product").slice(0, 6).toUpperCase();
    return `SCRX-${base.split("-")[0] ?? "ITM"}`;
  }, [existing?.name]);

  const form = useForm<BasicsForm>({
    resolver: zodResolver(basicsSchema),
    mode: "onBlur",
    defaultValues: {
      name: existing?.name ?? "",
      slug: existing?.slug ?? "",
      description: existing?.description ?? "",
      categoryId: existing?.categoryId ?? "",
      brand: existing?.brand ?? "ScrubX",
      gender: existing?.gender ?? "unisex",
      material: existing?.material ?? "Cotton-Poly 65/35",
      status: existing?.status ?? "draft",
      engraveable: existing?.engraveable ?? false,
      featured: existing?.featured ?? false,
    },
  });

  const { register, handleSubmit, setValue, watch, trigger, formState } = form;
  const nameValue = watch("name");
  const slugValue = watch("slug");
  const categoryIdValue = watch("categoryId");
  const genderValue = watch("gender");
  const statusValue = watch("status");
  const engraveableValue = watch("engraveable");
  const featuredValue = watch("featured");
  const slugField = register("slug");

  useEffect(() => {
    if (existing) {
      setColors(existing.colors);
      setImages(existing.images);
      setSizes([...new Set(existing.variants.map((v) => v.size))]);
      setVariants(existing.variants);
      setValue("name", existing.name);
      setValue("slug", existing.slug);
      setValue("description", existing.description);
      setValue("categoryId", existing.categoryId);
      setValue("brand", existing.brand);
      setValue("gender", existing.gender);
      setValue("material", existing.material);
      setValue("status", existing.status);
      setValue("engraveable", existing.engraveable);
      setValue("featured", existing.featured);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id]);

  // Auto-generate the slug from the product name until the user edits it.
  const lastAutoSlug = useRef("");
  useEffect(() => {
    if (slugTouched) return;
    const next = slugify(nameValue ?? "");
    if (next && next !== lastAutoSlug.current) {
      lastAutoSlug.current = next;
      setValue("slug", next, { shouldValidate: false });
    }
  }, [nameValue, slugTouched, setValue]);

  const leafCategories = categories.filter((c) => c.parentId || c.status === "active");

  const addColor = useCallback(() => {
    const name = colorDraft.name.trim();
    if (!name) {
      toast({ title: "Colour name required", variant: "error" });
      return;
    }
    if (colors.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      toast({ title: "That colour already exists", variant: "error" });
      return;
    }
    setColors((prev) => [...prev, { id: uid("col"), name, hex: colorDraft.hex }]);
    setColorDraft({ name: "", hex: "#0F766E" });
    toast({ title: "Colour added", description: `${name} is available for variants.` });
  }, [colorDraft, colors, toast]);

  const updateColor = useCallback((colorId: string, patch: Partial<ProductColor>) => {
    setColors((prev) =>
      prev.map((c) => (c.id === colorId ? { ...c, ...patch } : c)),
    );
    setVariants((prev) =>
      prev.map((v) =>
        v.colorId === colorId
          ? {
              ...v,
              colorName: patch.name ?? v.colorName,
              colorHex: patch.hex ?? v.colorHex,
            }
          : v,
      ),
    );
  }, []);

  const removeColor = useCallback((colorId: string) => {
    setColors((prev) => prev.filter((c) => c.id !== colorId));
    setImages((prev) => prev.map((i) => (i.colorId === colorId ? { ...i, colorId: null } : i)));
    setVariants((prev) => prev.filter((v) => v.colorId !== colorId));
    toast({ title: "Colour removed", description: "Related variants were deleted.", variant: "info" });
  }, [toast]);

  const toggleSize = useCallback((size: string) => {
    setSizes((prev) => (prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]));
  }, []);

  const generateVariants = useCallback(() => {
    if (colors.length === 0) {
      toast({ title: "Add at least one colour", variant: "error" });
      return;
    }
    if (sizes.length === 0) {
      toast({ title: "Select at least one size", variant: "error" });
      return;
    }
    setVariants((prev) => {
      const next: ProductVariant[] = [];
      for (const color of colors) {
        for (const size of sizes) {
          const existingVariant = prev.find((v) => v.colorId === color.id && v.size === size);
          if (existingVariant) {
            next.push({ ...existingVariant, colorName: color.name, colorHex: color.hex });
          } else {
            next.push({
              id: uid("var"),
              colorId: color.id,
              colorName: color.name,
              colorHex: color.hex,
              size,
              name: `${color.name} / ${size}`,
              sku: `${slugPrefix}-${colorCode(color.name)}-${sizeCode(size)}`,
              price: 0,
              compareAtPrice: null,
              stock: 0,
              reserved: 0,
              reorderLevel: 10,
              active: true,
            });
          }
        }
      }
      // Keep manually created variants that are not part of the matrix.
      prev
        .filter((v) => v.manual && !next.some((n) => n.id === v.id))
        .forEach((v) => next.push(v));
      return next;
    });
    toast({
      title: "Variants generated",
      description: `${colors.length} colour${colors.length === 1 ? "" : "s"} × ${sizes.length} size${sizes.length === 1 ? "" : "s"} — existing edits preserved.`,
    });
  }, [colors, sizes, slugPrefix, toast]);

  const updateVariant = useCallback((variantId: string, patch: Partial<ProductVariant>) => {
    setVariants((prev) => prev.map((v) => (v.id === variantId ? { ...v, ...patch } : v)));
  }, []);

  const openManualModal = useCallback(() => setManualOpen(true), []);
  const openDeleteVariantModal = useCallback((variant: ProductVariant) => setDeleteVariant(variant), []);

  const addManualVariant = (data: {
    colorId: string;
    size: string;
    sku: string;
    price: number;
    stock: number;
    reorderLevel: number;
  }) => {
    const color = colors.find((c) => c.id === data.colorId);
    if (!color) return;
    const variant: ProductVariant = {
      id: uid("var"),
      colorId: color.id,
      colorName: color.name,
      colorHex: color.hex,
      size: data.size,
      name: `${color.name} / ${data.size}`,
      sku: data.sku,
      price: data.price,
      compareAtPrice: null,
      stock: data.stock,
      reserved: 0,
      reorderLevel: data.reorderLevel,
      active: true,
      manual: true,
    };
    setVariants((prev) => [...prev, variant]);
    if (!sizes.includes(data.size)) setSizes((prev) => [...prev, data.size]);
    setManualOpen(false);
    toast({ title: "Variant added", description: `${variant.name} added to the product.` });
  };

  const addImage = useCallback((url: string, colorId: string | null, fileId?: string) => {
    const trimmed = url.trim();
    if (!trimmed) return;
    const prodName = form.getValues("name");
    const image: ProductImage = {
      id: uid("img"),
      url: trimmed,
      fileId,
      alt: `${prodName || "Product"} image`,
      colorId,
      isMain: false,
    };
    setImages((prev) => {
      const next = [...prev, { ...image, isMain: prev.length === 0 }];
      return next.map((i, index) => (index === 0 ? { ...i, isMain: true } : i));
    });
    setImageUrl("");
    toast({ title: "Image added" });
  }, [form, toast]);

  const addUploadedMedia = useCallback((mediaList: UploadedMedia | UploadedMedia[]) => {
    const list = Array.isArray(mediaList) ? mediaList : [mediaList];
    if (list.length === 0) return;
    const prodName = form.getValues("name");
    setImages((prev) => {
      const newItems: ProductImage[] = list.map((media) => ({
        id: uid("img"),
        url: media.url,
        fileId: media.fileId,
        alt: media.name || `${prodName || "Product"} image`,
        colorId:
          media.colorId !== undefined
            ? media.colorId
            : imageColor === "shared"
              ? null
              : imageColor,
        isMain: false,
      }));
      const combined = [...prev, ...newItems];
      return combined.map((img, idx) => (idx === 0 ? { ...img, isMain: true } : img));
    });
    toast({
      title: `${list.length} image${list.length === 1 ? "" : "s"} added`,
      description: "Uploaded to ImageKit successfully.",
    });
  }, [form, imageColor, toast]);

  const moveImage = useCallback((imageId: string, direction: -1 | 1) => {
    setImages((prev) => {
      const index = prev.findIndex((i) => i.id === imageId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const setMainImage = useCallback((imageId: string) => {
    setImages((prev) => prev.map((i) => ({ ...i, isMain: i.id === imageId })));
  }, []);

  const removeImage = useCallback((imageId: string) => {
    setImages((prev) => {
      const next = prev.filter((i) => i.id !== imageId);
      if (next.length && !next.some((i) => i.isMain)) next[0] = { ...next[0], isMain: true };
      return next;
    });
  }, []);

  const buildProduct = (status: Product["status"]): Product => {
    const vals = form.getValues();
    return {
      id: existing?.id ?? uid("prd"),
      name: vals.name.trim(),
      slug: vals.slug.trim(),
      description: vals.description.trim(),
      categoryId: vals.categoryId,
      brand: vals.brand.trim(),
      gender: vals.gender,
      material: vals.material.trim(),
      status,
      engraveable: vals.engraveable,
      featured: vals.featured,
      colors,
      images,
      variants,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  };

  const validateVariants = () => {
    if (variants.length === 0) {
      setVariantError("Add at least one variant before saving.");
      return false;
    }
    const noPrice = variants.find((v) => !v.price || v.price <= 0);
    if (noPrice) {
      setVariantError(`Variant “${noPrice.name}” needs a price greater than zero.`);
      return false;
    }
    const noSku = variants.find((v) => !v.sku.trim());
    if (noSku) {
      setVariantError(`Variant “${noSku.name}” needs a SKU.`);
      return false;
    }
    const negativeStock = variants.find((v) => v.stock < 0 || v.reorderLevel < 0);
    if (negativeStock) {
      setVariantError(`Variant “${negativeStock.name}” has an invalid stock value.`);
      return false;
    }
    setVariantError(null);
    return true;
  };

  const onSubmit = async (status: Product["status"]) => {
    const valid = await trigger();
    if (!valid) {
      toast({
        title: "Check the highlighted fields",
        description: "Some required product information is missing.",
        variant: "error",
      });
      return;
    }
    if (!validateVariants()) {
      toast({ title: "Variants need attention", variant: "error" });
      return;
    }

    const values = form.getValues();

    try {
      if (isEdit && existing) {
        const res = await updateProductAction({
          id: existing.id,
          name: values.name.trim(),
          slug: values.slug.trim(),
          description: values.description.trim() || null,
          categoryId: values.categoryId || null,
          brand: values.brand.trim() || null,
          gender: (values.gender as any) || "unisex",
          material: values.material.trim() || null,
          status: status as any,
          isEngravable: values.engraveable,
          isFeatured: values.featured,
          colors: colors.map((c, idx) => ({
            name: c.name,
            hexCode: c.hex,
            sortOrder: idx,
          })),
          variants: variants.map((v) => ({
            id: v.id && !v.id.startsWith("var-") ? v.id : undefined,
            name: v.name,
            sku: v.sku,
            size: v.size,
            price: v.price,
            compareAtPrice: v.compareAtPrice ?? null,
            stock: v.stock,
            reorderLevel: v.reorderLevel,
            isActive: v.active,
            colorId: v.colorId && !v.colorId.startsWith("col-") ? v.colorId : undefined,
            colorName: v.colorName || colors.find((c) => c.id === v.colorId)?.name || undefined,
          })),
          images: images.map((img, idx) => ({
            id: img.id && !img.id.startsWith("img-") ? img.id : undefined,
            imagekitFileId: img.fileId || null,
            url: img.url,
            altText: img.alt || values.name,
            colorId: img.colorId && !img.colorId.startsWith("col-") ? img.colorId : undefined,
            colorName: colors.find((c) => c.id === img.colorId)?.name || undefined,
            sortOrder: idx,
          })),
        });

        if (res.success) {
          toast({
            title: "Product updated",
            description: `${values.name} has been updated.`,
          });
          router.push("/products");
          router.refresh();
        } else {
          toast({
            title: "Failed to update product",
            description: res.error || "An error occurred.",
            variant: "error",
          });
        }
      } else {
        const res = await createProductAction({
          name: values.name.trim(),
          slug: values.slug.trim(),
          description: values.description.trim() || null,
          categoryId: values.categoryId || null,
          brand: values.brand.trim() || null,
          gender: (values.gender as any) || "unisex",
          material: values.material.trim() || null,
          status: status as any,
          isEngravable: values.engraveable,
          isFeatured: values.featured,
          colors: colors.map((c, idx) => ({
            name: c.name,
            hexCode: c.hex,
            sortOrder: idx,
          })),
          variants: variants.map((v) => ({
            id: v.id && !v.id.startsWith("var-") ? v.id : undefined,
            name: v.name,
            sku: v.sku,
            size: v.size,
            price: v.price,
            compareAtPrice: v.compareAtPrice ?? null,
            stock: v.stock,
            reorderLevel: v.reorderLevel,
            isActive: v.active,
            colorId: v.colorId && !v.colorId.startsWith("col-") ? v.colorId : undefined,
            colorName: v.colorName || colors.find((c) => c.id === v.colorId)?.name || undefined,
          })),
          images: images.map((img, idx) => ({
            id: img.id && !img.id.startsWith("img-") ? img.id : undefined,
            imagekitFileId: img.fileId || null,
            url: img.url,
            altText: img.alt || values.name,
            colorId: img.colorId && !img.colorId.startsWith("col-") ? img.colorId : undefined,
            colorName: colors.find((c) => c.id === img.colorId)?.name || undefined,
            sortOrder: idx,
          })),
        });

        if (res.success) {
          toast({
            title: status === "active" ? "Product published" : "Saved as draft",
            description: `${values.name} has been ${status === "active" ? "published to the store" : "saved as a draft"}.`,
          });
          router.push("/products");
          router.refresh();
        } else {
          toast({
            title: "Failed to create product",
            description: res.error || "An error occurred.",
            variant: "error",
          });
        }
      }
    } catch (err: any) {
      toast({
        title: "Error saving product",
        description: err.message || "Failed to communicate with server.",
        variant: "error",
      });
    }
  };

  const priceRange = useMemo(() => {
    const prices = variants.map((v) => v.price).filter((p) => p > 0);
    if (!prices.length) return null;
    return { min: Math.min(...prices), max: Math.max(...prices) };
  }, [variants]);

  const totalStock = variants.reduce((sum, v) => sum + v.stock, 0);

  return (
    <form
      onSubmit={handleSubmit(() => onSubmit(statusValue))}
      className="space-y-5"
      onError={() =>
        toast({
          title: "Fix the validation errors",
          description: "Some required fields are missing or invalid.",
          variant: "error",
        })
      }
    >
      <PageHeader
        eyebrow={isEdit ? "Edit product" : "New product"}
        title={isEdit ? existing?.name ?? "Edit product" : "Create a product"}
        description="Build the listing, define colours and images, then generate sellable variants."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/products">
                <ArrowLeft className="h-4 w-4" />
                Back to products
              </Link>
            </Button>
            {canWrite && (
              <>
                <Button type="button" variant="outline" onClick={() => onSubmit("draft")}>
                  <Save className="h-4 w-4" />
                  Save as draft
                </Button>
                <Button type="button" onClick={() => onSubmit("active")}>
                  <Check className="h-4 w-4" />
                  Publish
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          {/* ---------------------------------------------------- basics */}
          <Card>
            <CardHeader>
              <h2 className="text-[15px] font-semibold text-ink">Basic information</h2>
              <p className="text-[12.5px] text-ink-muted">
                The core listing details customers see on the storefront.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="name">Product name</Label>
                  <Input
                    id="name"
                    placeholder="e.g. Classic V-Neck Scrub Top"
                    aria-invalid={Boolean(formState.errors.name)}
                    {...register("name")}
                  />
                  <FieldError>{formState.errors.name?.message}</FieldError>
                </div>

                <div>
                  <Label htmlFor="slug">URL slug</Label>
                  <Input
                    id="slug"
                    placeholder="classic-v-neck-scrub-top"
                    aria-invalid={Boolean(formState.errors.slug)}
                    {...slugField}
                    onChange={(e) => {
                      setSlugTouched(true);
                      slugField.onChange(e);
                    }}
                  />
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <FieldError>{formState.errors.slug?.message}</FieldError>
                    {slugTouched && (
                      <button
                        type="button"
                        className="ml-auto text-[11.5px] font-medium text-brand-700 hover:underline"
                        onClick={() => {
                          setSlugTouched(false);
                          setValue("slug", slugify(form.getValues("name") ?? ""));
                        }}
                      >
                        Regenerate from name
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <Label htmlFor="brand">Brand</Label>
                  <Input
                    id="brand"
                    placeholder="ScrubX"
                    aria-invalid={Boolean(formState.errors.brand)}
                    {...register("brand")}
                  />
                  <FieldError>{formState.errors.brand?.message}</FieldError>
                </div>

                <div className="sm:col-span-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    rows={5}
                    placeholder="Describe the fabric, fit, pocket layout and ideal wearer…"
                    aria-invalid={Boolean(formState.errors.description)}
                    {...register("description")}
                  />
                  <FieldError>{formState.errors.description?.message}</FieldError>
                </div>

                <div>
                  <Label>Category</Label>
                  <Select
                    value={categoryIdValue}
                    onValueChange={(value) => setValue("categoryId", value, { shouldValidate: true })}
                  >
                    <SelectTrigger aria-invalid={Boolean(formState.errors.categoryId)}>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories
                        .filter((c) => c.status === "active")
                        .map((parent) => {
                          const children = leafCategories.filter((c) => c.parentId === parent.id);
                          if (!children.length) {
                            return (
                              <SelectItem key={parent.id} value={parent.id}>
                                {parent.name}
                              </SelectItem>
                            );
                          }
                          return (
                            <div key={parent.id}>
                              <SelectItem value={parent.id} disabled>
                                {parent.name}
                              </SelectItem>
                              {children.map((child) => (
                                <SelectItem key={child.id} value={child.id}>
                                  {parent.name} / {child.name}
                                </SelectItem>
                              ))}
                            </div>
                          );
                        })}
                    </SelectContent>
                  </Select>
                  <FieldError>{formState.errors.categoryId?.message}</FieldError>
                </div>

                <div>
                  <Label>Gender</Label>
                  <Select
                    value={genderValue}
                    onValueChange={(value) => setValue("gender", value as BasicsForm["gender"])}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unisex">Unisex</SelectItem>
                      <SelectItem value="men">Men</SelectItem>
                      <SelectItem value="women">Women</SelectItem>
                      <SelectItem value="kids">Kids</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="material">Material</Label>
                  <Input
                    id="material"
                    placeholder="Cotton-Poly 65/35"
                    aria-invalid={Boolean(formState.errors.material)}
                    {...register("material")}
                  />
                  <FieldError>{formState.errors.material?.message}</FieldError>
                </div>

                <div>
                  <Label>Status</Label>
                  <Select
                    value={statusValue}
                    onValueChange={(value) => setValue("status", value as Product["status"])}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-muted/60 p-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <Sparkles className="mt-0.5 h-4 w-4 text-brand-600" />
                  <div>
                    <p className="text-[13px] font-medium text-ink">Engravable product</p>
                    <p className="text-[12px] text-ink-muted">
                      Engraved orders require advance payment — Cash on Delivery is blocked at
                      checkout for engraved items.
                    </p>
                  </div>
                </div>
                <Switch
                  checked={engraveableValue}
                  onCheckedChange={(checked) => setValue("engraveable", checked)}
                  aria-label="Toggle engravable"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-line bg-surface-muted/60 p-3.5">
                <div className="flex items-start gap-3">
                  <Star className="mt-0.5 h-4 w-4 text-amber-500" />
                  <div>
                    <p className="text-[13px] font-medium text-ink">Featured product</p>
                    <p className="text-[12px] text-ink-muted">
                      Highlighted on the storefront home page.
                    </p>
                  </div>
                </div>
                <Switch
                  checked={featuredValue}
                  onCheckedChange={(checked) => setValue("featured", checked)}
                  aria-label="Toggle featured"
                />
              </div>
            </CardContent>
          </Card>

          {/* ---------------------------------------------------- colours */}
          <ColorEditor
            colors={colors}
            editingColorId={editingColorId}
            colorDraft={colorDraft}
            onSetEditingColorId={setEditingColorId}
            onUpdateColor={updateColor}
            onRemoveColor={removeColor}
            onSetColorDraft={setColorDraft}
            onAddColor={addColor}
          />

          {/* ---------------------------------------------------- images */}
          <ImagePanel
            images={images}
            colors={colors}
            imageColor={imageColor}
            imageUrl={imageUrl}
            onSetImageUrl={setImageUrl}
            onSetImageColor={setImageColor}
            onAddImage={addImage}
            onAddUploadedMedia={addUploadedMedia}
            onMoveImage={moveImage}
            onRemoveImage={removeImage}
            onSetMainImage={setMainImage}
          />

          {/* ---------------------------------------------------- variants */}
          <VariantMatrix
            variants={variants}
            colors={colors}
            sizes={sizes}
            variantError={variantError}
            onToggleSize={toggleSize}
            onGenerateVariants={generateVariants}
            onOpenManual={openManualModal}
            onUpdateVariant={updateVariant}
            onDeleteVariant={openDeleteVariantModal}
          />
        </div>

        {/* ------------------------------------------------------- preview */}
        <div className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          <Card>
            <CardHeader>
              <h2 className="text-[15px] font-semibold text-ink">Live preview</h2>
              <p className="text-[12.5px] text-ink-muted">How the product card appears in-store.</p>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-lg border border-line bg-surface">
                <div className="relative aspect-square overflow-hidden bg-surface-muted">
                  {images.find((i) => i.isMain) || images[0] ? (
                    <Image
                      src={(images.find((i) => i.isMain) ?? images[0]).url}
                      alt="Product preview"
                      fill
                      sizes="(max-width: 1024px) 100vw, 360px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-ink-muted">
                      <ImagePlus className="h-6 w-6" />
                    </div>
                  )}
                </div>
                <div className="space-y-2 p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[13.5px] font-semibold leading-snug text-ink">
                      {nameValue || "Untitled product"}
                    </p>
                    <ProductStatusBadge status={statusValue} />
                  </div>
                  <p className="font-mono text-[11px] text-ink-muted">/{slugValue || "product-slug"}</p>
                  {priceRange ? (
                    <p className="text-[15px] font-semibold text-ink tabular">
                      {priceRange.min === priceRange.max
                        ? formatPKR(priceRange.min)
                        : `${formatPKR(priceRange.min)} – ${formatPKR(priceRange.max)}`}
                    </p>
                  ) : (
                    <p className="text-[13px] text-ink-muted">Price not set</p>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    {colors.map((c) => (
                      <span
                        key={c.id}
                        title={c.name}
                        className="h-5 w-5 rounded-full border border-line-strong"
                        style={{ backgroundColor: c.hex }}
                      />
                    ))}
                    {colors.length === 0 && (
                      <span className="text-[11.5px] text-ink-muted">No colours</span>
                    )}
                  </div>
                  {sizes.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {sizes.slice(0, 8).map((size) => (
                        <span
                          key={size}
                          className="rounded border border-line bg-surface-muted px-1.5 py-0.5 text-[10.5px] text-ink-soft"
                        >
                          {size}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {engraveableValue && <Badge variant="purple">Engravable</Badge>}
                    {featuredValue && <Badge variant="warning">Featured</Badge>}
                    <Badge variant="neutral">{totalStock} in stock</Badge>
                    <Badge variant="neutral">{variants.length} variants</Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-brand-100 bg-brand-50/50">
            <CardContent className="flex gap-3 p-4">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
              <div className="space-y-1.5 text-[12.5px] text-ink-soft">
                <p className="font-semibold text-ink">Engraving rule</p>
                <p>
                  Engraved orders can only be paid in advance. Cash on Delivery is automatically
                  removed from checkout when engraving is selected.
                </p>
                <p className="text-[12px] text-ink-muted">
                  This prototype stores everything locally — no backend calls are made.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <ManualVariantDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        colors={colors}
        sizes={sizes}
        skuPrefix={slugPrefix}
        onAdd={addManualVariant}
      />

      <ConfirmDialog
        open={Boolean(deleteVariant)}
        onOpenChange={(open) => !open && setDeleteVariant(null)}
        title="Remove variant?"
        description={
          deleteVariant ? `“${deleteVariant.name}” (${deleteVariant.sku}) will be removed from this product.` : undefined
        }
        confirmLabel="Remove variant"
        destructive
        onConfirm={() => {
          if (!deleteVariant) return;
          setVariants((prev) => prev.filter((v) => v.id !== deleteVariant.id));
          toast({ title: "Variant removed", variant: "info" });
        }}
      />

    </form>
  );
}

function ManualVariantDialog({
  open,
  onOpenChange,
  colors,
  sizes,
  skuPrefix,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  colors: ProductColor[];
  sizes: string[];
  skuPrefix: string;
  onAdd: (data: {
    colorId: string;
    size: string;
    sku: string;
    price: number;
    stock: number;
    reorderLevel: number;
  }) => void;
}) {
  const [colorId, setColorId] = useState("");
  const [size, setSize] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState(0);
  const [stock, setStock] = useState(0);
  const [reorderLevel, setReorderLevel] = useState(10);

  useEffect(() => {
    if (open) {
      setColorId(colors[0]?.id ?? "");
      setSize(sizes[0] ?? "One Size");
      setSku("");
      setPrice(0);
      setStock(0);
      setReorderLevel(10);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selectedColor = colors.find((c) => c.id === colorId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add manual variant</DialogTitle>
          <DialogDescription>
            Create a one-off combination that sits outside the colour × size matrix.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div>
            <Label>Colour</Label>
            <Select value={colorId} onValueChange={setColorId}>
              <SelectTrigger>
                <SelectValue placeholder="Select colour" />
              </SelectTrigger>
              <SelectContent>
                {colors.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="manual-size">Size</Label>
            <Input
              id="manual-size"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              placeholder="e.g. XXL"
            />
          </div>
          <div>
            <Label htmlFor="manual-sku">SKU</Label>
            <Input
              id="manual-sku"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder={`${skuPrefix}-${selectedColor ? colorCode(selectedColor.name) : "CUS"}-${sizeCode(size)}`}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="manual-price">Price (Rs.)</Label>
              <Input
                id="manual-price"
                type="number"
                min={0}
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="manual-stock">Stock</Label>
              <Input
                id="manual-stock"
                type="number"
                min={0}
                value={stock}
                onChange={(e) => setStock(Number(e.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="manual-reorder">Reorder at</Label>
              <Input
                id="manual-reorder"
                type="number"
                min={0}
                value={reorderLevel}
                onChange={(e) => setReorderLevel(Number(e.target.value))}
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!colorId || !size.trim() || !sku.trim() || price <= 0}
            onClick={() => onAdd({ colorId, size: size.trim(), sku: sku.trim(), price, stock, reorderLevel })}
          >
            Add variant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
