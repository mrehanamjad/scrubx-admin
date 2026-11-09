import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import ProductViewPage from "@/views/ProductView";
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
      title: `${product.name} | ScrubX`,
      description: product.description || "Product details and variant configuration.",
    };
  } catch {
    return {
      title: "Product Details | ScrubX",
      description: "Product details and variant configuration.",
    };
  }
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  const admin = await requireStaffContext();

  let initialProduct;
  let initialCategories: any[] = [];

  try {
    const [productBundle, categoriesResult] = await Promise.all([
      getProductData(id),
      categoryService.getAllCategories(admin, { tree: false }),
    ]);

    initialProduct = toProductBundleDTO(productBundle);
    initialCategories = (categoriesResult as any[]).map(toCategoryDTO);
  } catch (err) {
    console.error(`[Product Page Error]: Failed to fetch product ${id}:`, err);
    notFound();
  }

  return (
    <ProductViewPage
      id={id}
      initialProduct={initialProduct}
      initialCategories={initialCategories}
    />
  );
}
