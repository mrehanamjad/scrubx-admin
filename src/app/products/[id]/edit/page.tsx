import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import ProductFormPage from "@/views/ProductForm";
import { productService } from "@/server/services/product.service";
import { categoryService } from "@/server/services/category.service";
import { requireStaffContext } from "@/server/auth";
import { toProductBundleDTO, toCategoryDTO } from "@/lib/dto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

const getProductData = cache(async (id: string) => {
  const admin = await requireStaffContext();
  return productService.getProductById(id, admin);
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const product = await getProductData(id);
    return {
      title: `Edit ${product.name} | ScrubX`,
      description: "Update product listing and variants.",
    };
  } catch {
    return {
      title: "Edit Product | ScrubX",
      description: "Update product listing and variants.",
    };
  }
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  const admin = await requireStaffContext();

  let initialProduct;
  let initialCategories: any[] = [];

  try {
    const [productBundle, rawCategories] = await Promise.all([
      getProductData(id),
      categoryService.getAllCategories(admin, { tree: false }),
    ]);

    initialProduct = toProductBundleDTO(productBundle);
    initialCategories = (rawCategories as any[]).map(toCategoryDTO);
  } catch (err) {
    console.error(`[Edit Product Page Error]: Failed to fetch product ${id}:`, err);
    notFound();
  }

  return (
    <ProductFormPage
      id={id}
      initialProduct={initialProduct}
      initialCategories={initialCategories}
    />
  );
}
