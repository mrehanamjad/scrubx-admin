import type { Metadata } from "next";
import ProductsPage from "@/views/Products";
import { productService } from "@/server/services/product.service";
import { categoryService } from "@/server/services/category.service";
import { requireStaffContext } from "@/server/auth";
import { toProductListItemDTO, toCategoryDTO } from "@/lib/dto";
import type { Product, Category } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Products",
  description: "Manage listings, pricing and stock across every ScrubX product.",
};

interface PageProps {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    categoryId?: string;
    status?: string;
    gender?: string;
    isFeatured?: string;
    inStock?: string;
    q?: string;
    sortBy?: string;
    sortOrder?: string;
  }>;
}

export default async function Page({ searchParams }: PageProps) {
  const admin = await requireStaffContext();
  const sp = await searchParams;

  const page = Math.max(1, Number(sp?.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(sp?.limit) || 20));

  let initialProducts: Product[] = [];
  let initialCategories: Category[] = [];
  let pagination = {
    totalItems: 0,
    totalPages: 1,
    currentPage: page,
    limit,
  };

  try {
    const [productsResult, categoriesResult] = await Promise.all([
      productService.getProducts(
        {
          page,
          limit,
          categoryId: sp?.categoryId || undefined,
          status: (sp?.status as any) || undefined,
          gender: (sp?.gender as any) || undefined,
          isFeatured: sp?.isFeatured !== undefined ? sp.isFeatured === "true" : undefined,
          inStock: sp?.inStock !== undefined ? sp.inStock === "true" : undefined,
          q: typeof sp?.q === "string" ? sp.q : undefined,
          sortBy: (sp?.sortBy as any) || "createdAt",
          sortOrder: sp?.sortOrder === "asc" ? "asc" : "desc",
        },
        admin
      ),
      categoryService.getAllCategories(admin, { tree: false }),
    ]);

    initialProducts = productsResult.items.map(toProductListItemDTO);
    initialCategories = (categoriesResult as any[]).map(toCategoryDTO);
    pagination = {
      totalItems: productsResult.pagination.totalItems,
      totalPages: productsResult.pagination.totalPages,
      currentPage: productsResult.pagination.page,
      limit: productsResult.pagination.limit,
    };
  } catch (err) {
    console.error("[Products Page Error]: Failed to fetch products or categories:", err);
  }

  return (
    <ProductsPage
      initialProducts={initialProducts}
      initialCategories={initialCategories}
      initialPagination={pagination}
      initialQuery={sp?.q ?? ""}
    />
  );
}
