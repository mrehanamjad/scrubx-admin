import { db } from "../db/index.ts";
import { productService } from "../server/services/product.service.ts";
import { categoryService } from "../server/services/category.service.ts";
import { productRepository } from "../server/repositories/product.repository.ts";
import { toOrderDTO, toCustomerDTO, toPaymentSubmissionDTO } from "../lib/dto.ts";
import type { AdminContext } from "../server/types.ts";
import { inventory } from "../db/schema/inventory.ts";
import { productVariants, products, productImages } from "../db/schema/catalog.ts";
import { eq } from "drizzle-orm";

const mockAdmin: AdminContext = {
  id: "0d0a9176-e6fc-43bd-984d-66287ab4f805",
  email: "admin@scrubx.pk",
  role: "admin",
  name: "Batch 10 Admin",
};

async function runTests() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log(" 🏷️ ScrubX Batch 10: Catalog & Media Payload Test Suite");
  console.log("═══════════════════════════════════════════════════════════\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      failed++;
    }
  }

  let createdProdId: string | null = null;
  let copyProdId: string | null = null;
  let createdCatId: string | null = null;

  try {
    // Category 1: BUG-018 & BUG-019 & BUG-021 & DB-009
    console.log("Category 1: Image & Variant Color Association + Nullable ImageKit File ID");
    const testSlug = `b10-test-${Date.now().toString(36)}`;
    const prod = await productService.createProduct(
      {
        name: "B10 Test Scrub",
        slug: testSlug,
        description: "Testing color associations and nullable imagekitFileId",
        status: "draft",
        colors: [
          { name: "Emerald Green", hexCode: "#006644", sortOrder: 0 },
          { name: "Royal Navy", hexCode: "#001144", sortOrder: 1 },
        ],
        variants: [
          {
            name: "B10 Test Scrub - Emerald / S",
            sku: `B10-EM-S-${Date.now().toString(36)}`,
            size: "S",
            price: 4500,
            stock: 20,
            colorName: "Emerald Green",
          },
          {
            name: "B10 Test Scrub - Navy / M",
            sku: `B10-NV-M-${Date.now().toString(36)}`,
            size: "M",
            price: 4500,
            stock: 15,
            colorName: "Royal Navy",
          },
        ],
        images: [
          {
            url: "https://example.com/emerald.jpg",
            imagekitFileId: null, // BUG-021: Nullable external URL photo without fake id
            altText: "Emerald photo",
            colorName: "Emerald Green",
            sortOrder: 0,
          },
          {
            url: "https://example.com/navy.jpg",
            imagekitFileId: null,
            altText: "Navy photo",
            colorName: "Royal Navy",
            sortOrder: 1,
          },
        ],
      },
      mockAdmin
    );

    createdProdId = prod.id;
    assert(prod.id !== undefined, "Product created successfully");
    assert(prod.colors.length === 2, "2 colors inserted");

    const emeraldColor = prod.colors.find((c) => c.name === "Emerald Green");
    const navyColor = prod.colors.find((c) => c.name === "Royal Navy");

    assert(emeraldColor !== undefined, "Emerald Green color created");
    assert(navyColor !== undefined, "Royal Navy color created");

    const emVariant = prod.variants.find((v) => v.name.includes("Emerald"));
    assert(emVariant?.colorId === emeraldColor?.id, "Variant Emerald linked to Emerald color ID (BUG-019)");

    const emImage = prod.images.find((img) => img.url === "https://example.com/emerald.jpg");
    assert(emImage?.colorId === emeraldColor?.id, "Image Emerald linked to Emerald color ID (BUG-018)");
    assert(emImage?.imagekitFileId === null, "Image with external URL has imagekitFileId = NULL (BUG-021 & DB-009)");

    // Category 2: BUG-015 (Product list computes stock as available stock: onHand - reserved)
    console.log("\nCategory 2: Sellable Stock Reservation Computation (BUG-015)");
    // Reserve 8 units of emVariant in inventory table
    await db
      .update(inventory)
      .set({ quantityReserved: 8 })
      .where(eq(inventory.variantId, emVariant!.id));

    const listResult = await productRepository.findPaginated({
      q: testSlug,
      page: 1,
      limit: 10,
      sortBy: "createdAt",
      sortOrder: "desc",
    });
    const pItem = listResult.items.find((p) => p.id === prod.id);

    assert(pItem !== undefined, "Product found in paginated listing");
    // onHand = 20 + 15 = 35. reserved = 8. Available = (20 - 8) + 15 = 27.
    assert(pItem?.totalStock === 27, `Available stock correctly accounts for reservations: expected 27, got ${pItem?.totalStock}`);

    // Category 3: BUG-020 (Category custom slug preservation on update)
    console.log("\nCategory 3: Category Custom Slug Preservation (BUG-020)");
    const catSlug = `cat-custom-${Date.now().toString(36)}`;
    const cat = await categoryService.createCategory(
      {
        name: "Apparel Initial Name",
        slug: catSlug,
      },
      mockAdmin
    );
    createdCatId = cat.id;

    // Update name but leave slug as custom
    const updatedCat = await categoryService.updateCategory(
      {
        id: cat.id,
        name: "Renamed Apparel Group",
        slug: catSlug, // Custom slug preserved
      },
      mockAdmin
    );

    assert(updatedCat.name === "Renamed Apparel Group", "Category name updated");
    assert(updatedCat.slug === catSlug, "Custom category slug preserved after name update (BUG-020)");

    // Category 4: BUG-029 (DTO fidelity)
    console.log("\nCategory 4: DTO Fidelity & Honesty (BUG-029)");
    const guestCustomerDTO = toCustomerDTO({
      id: "cust-1",
      userId: null,
      email: "guest@example.com",
      firstName: "Guest",
      lastName: "User",
      phone: "+923001234567",
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ordersCount: 1,
      totalSpend: 5000,
      lastOrderDate: new Date(),
      isRegistered: false,
    });
    assert(guestCustomerDTO.type === "guest", "Guest customer accurately typed as 'guest' (BUG-029)");

    const orderDTO = toOrderDTO({
      id: "ord-test",
      orderNumber: "SX-9999",
      customerId: "cust-1",
      customer: {
        id: "cust-1",
        email: "customer@domain.pk",
        name: "Real Customer",
      },
      placedAt: new Date(),
      status: "confirmed",
      subtotal: "4500",
      total: "4500",
      items: [
        {
          id: "item-1",
          productName: "Item Without Photo",
          variantName: "Standard",
          unitPrice: "4500",
          quantity: 1,
          sku: "NO-PHOTO-1",
          imageUrl: null, // No image snapshot
          engravings: [
            {
              id: "eng-1",
              text: "Dr. Ayesha",
              price: "500",
            },
            {
              id: "eng-2",
              logoUrl: "https://ik.imagekit.io/logo.png",
              price: "800",
            },
          ],
        },
      ],
      statusHistory: [
        {
          id: "hist-1",
          fromStatus: "awaiting_payment",
          toStatus: "confirmed",
          changedBy: "system",
          createdAt: new Date(),
        },
        {
          id: "hist-2",
          fromStatus: "pending",
          toStatus: "awaiting_payment",
          changedBy: "user-123",
          authorName: "Staff Member",
          createdAt: new Date(),
        },
      ],
    } as any);

    assert(orderDTO.items[0].image === "", "Item without image snapshot does not fallback to scrubs-teal.jpg (BUG-029)");
    assert(orderDTO.items[0].engravings?.length === 2, "All 2 item engravings preserved in DTO (BUG-029)");
    assert(orderDTO.timeline[0].by === "System", "System status transition author rendered as 'System' (BUG-029)");
    assert(orderDTO.timeline[1].by === "Staff Member", "User status transition author resolved from DB (BUG-029)");

    const paymentDTO = toPaymentSubmissionDTO({
      id: "pay-1",
      orderId: "ord-1",
      amount: "5000",
      status: "awaiting_verification",
      createdAt: new Date(),
    } as any);
    assert(paymentDTO.orderNumber === "—", "Missing orderNumber in payment submission defaults to '—' (no SX-1001 fake)");
    assert(paymentDTO.transactionRef === "—", "Missing transactionRef defaults to '—' (no TRX-PENDING fake)");

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log(` Summary: ${passed} Passed, ${failed} Failed`);
    console.log("═══════════════════════════════════════════════════════════\n");

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error("Test execution failed:", err);
    process.exit(1);
  } finally {
    // Cleanup test records
    if (createdProdId) {
      await db.delete(products).where(eq(products.id, createdProdId)).catch(() => {});
    }
    if (copyProdId) {
      await db.delete(products).where(eq(products.id, copyProdId)).catch(() => {});
    }
    if (createdCatId) {
      await categoryService.deleteCategory(createdCatId, { id: createdCatId }, mockAdmin).catch(() => {});
    }
  }
}

runTests();
