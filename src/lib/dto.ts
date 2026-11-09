import type {
  Category,
  Customer,
  EngravingOption,
  Order,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  PaymentMethodId,
  PaymentStatus,
  PaymentSubmission,
  Product,
  ProductColor,
  ProductImage,
  ProductVariant,
  ShippingMethod,
  Coupon,
  StoreSettings,
} from "./types.ts";
import type { CategoryWithProductCount } from "../server/repositories/category.repository.ts";
import type { ProductDetailBundle, ProductListItem } from "../server/repositories/product.repository.ts";
import type { OrderDetailBundle, OrderListItem } from "../server/repositories/order.repository.ts";
import type { CustomerDetail, CustomerListItem } from "../server/repositories/customer.repository.ts";
import type { PaymentDetail, PaymentListItem } from "../server/repositories/payment.repository.ts";
import type { CouponListItem } from "../server/repositories/coupon.repository.ts";
import type {
  ShippingMethod as DbShippingMethod,
  EngravingOption as DbEngravingOption,
  PaymentMethod as DbPaymentMethod,
} from "../db/schema/index.ts";

/**
 * Universal date serializer
 */
export function serializeDate(date: Date | string | null | undefined): string {
  if (!date) return new Date().toISOString();
  if (typeof date === "string") return date;
  return date.toISOString();
}

/**
 * Universal numeric serializer
 */
export function serializeNumber(val: number | string | null | undefined, fallback = 0): number {
  if (val === null || val === undefined) return fallback;
  const num = Number(val);
  return isNaN(num) ? fallback : num;
}

/**
 * Category DTO Transformer
 */
export function toCategoryDTO(cat: CategoryWithProductCount): Category {
  return {
    id: cat.id,
    name: cat.name,
    slug: cat.slug,
    parentId: cat.parentId || null,
    description: cat.description || "",
    image: cat.imageUrl || "/products/scrubs-teal.jpg",
    imageFileId: cat.imageFileId || undefined,
    status: cat.isActive ? "active" : "inactive",
    sortOrder: cat.sortOrder,
  };
}

/**
 * Product DTO Transformer for ProductDetailBundle
 */
export function toProductBundleDTO(bundle: ProductDetailBundle): Product {
  const colors: ProductColor[] = (bundle.colors || []).map((c) => ({
    id: c.id,
    name: c.name,
    hex: c.hexCode || "#000000",
  }));

  const images: ProductImage[] = (bundle.images || []).map((img, idx) => ({
    id: img.id,
    url: img.url,
    alt: img.altText || bundle.name,
    colorId: img.colorId || null,
    isMain: idx === 0 || img.sortOrder === 0,
    fileId: img.imagekitFileId || undefined,
  }));

  const variants: ProductVariant[] = (bundle.variants || []).map((v) => ({
    id: v.id,
    colorId: v.colorId || "",
    colorName: v.colorName || "Standard",
    colorHex: v.colorHex || "#000000",
    size: v.size || "M",
    name: v.name,
    sku: v.sku,
    price: serializeNumber(v.price),
    compareAtPrice: v.compareAtPrice ? serializeNumber(v.compareAtPrice) : null,
    stock: serializeNumber(v.stock),
    reserved: serializeNumber(v.reserved),
    reorderLevel: serializeNumber(v.reorderLevel, 10),
    active: v.isActive,
  }));

  return {
    id: bundle.id,
    name: bundle.name,
    slug: bundle.slug,
    description: bundle.description || "",
    categoryId: bundle.category?.id || "",
    brand: bundle.brand || "ScrubX",
    gender: (bundle.gender as any) || "unisex",
    material: bundle.material || "65% Poly, 35% Cotton",
    status: bundle.status as "draft" | "active" | "archived",
    engraveable: Boolean(bundle.isEngravable),
    featured: Boolean(bundle.isFeatured),
    colors,
    images,
    variants,
    createdAt: serializeDate(bundle.createdAt),
    updatedAt: serializeDate(bundle.updatedAt),
  };
}

/**
 * Product DTO Transformer for ProductListItem
 */
export function toProductListItemDTO(item: ProductListItem): Product {
  const images: ProductImage[] = item.primaryImage
    ? [
        {
          id: "primary",
          url: item.primaryImage.url,
          alt: item.primaryImage.altText || item.name,
          colorId: null,
          isMain: true,
        },
      ]
    : [];

  // Default synthetic variant reflecting total stock and price range for table list
  const variants: ProductVariant[] = [
    {
      id: `${item.id}-synth`,
      colorId: "",
      colorName: "",
      colorHex: "",
      size: "M",
      name: item.name,
      sku: `${item.slug.toUpperCase()}-SKU`,
      price: serializeNumber(item.minPrice),
      compareAtPrice: null,
      stock: serializeNumber(item.totalStock),
      reserved: 0,
      reorderLevel: 10,
      active: item.status === "active",
    },
  ];

  return {
    id: item.id,
    name: item.name,
    slug: item.slug,
    description: "",
    categoryId: item.category?.id || "",
    brand: item.brand || "ScrubX",
    gender: (item.gender as any) || "unisex",
    material: "Poly-Cotton Blend",
    status: item.status as "draft" | "active" | "archived",
    engraveable: Boolean(item.isEngravable),
    featured: Boolean(item.isFeatured),
    colors: [],
    images,
    variants,
    createdAt: serializeDate(item.createdAt),
    updatedAt: serializeDate(item.updatedAt),
  };
}

/**
 * Customer DTO Transformer
 */
export function toCustomerDTO(c: CustomerDetail | CustomerListItem): Customer {
  const fullName = ((c.firstName || "") + " " + (c.lastName || "")).trim() || "Guest Customer";
  const customerAddresses = "addresses" in c && Array.isArray(c.addresses)
    ? c.addresses.map((a) => ({
        label: a.label || "Home",
        recipient: a.fullName,
        phone: a.phone,
        line1: a.addressLine1,
        line2: a.addressLine2 || undefined,
        city: a.city,
        province: a.province || "",
        postcode: a.postalCode || "",
        country: a.country || "PK",
      }))
    : [];

  const notesList =
    "notesTimeline" in c && Array.isArray((c as any).notesTimeline) && (c as any).notesTimeline.length > 0
      ? (c as any).notesTimeline.map((n: any) => ({
          id: n.id,
          text: n.body,
          at: serializeDate(n.createdAt),
          authorName: n.authorName || undefined,
          isPinned: Boolean(n.isPinned),
        }))
      : typeof c.notes === "string" && c.notes.trim()
        ? [
            {
              id: "note-root",
              text: c.notes,
              at: serializeDate(c.updatedAt || c.createdAt),
            },
          ]
        : [];

  return {
    id: c.id,
    name: fullName,
    email: c.email,
    phone: c.phone || "—",
    city: customerAddresses[0]?.city || "Pakistan",
    type: c.isRegistered ? "registered" : "guest",
    registeredAt: serializeDate(c.createdAt),
    addresses: customerAddresses,
    notes: notesList,
    ordersCount: "ordersCount" in c ? serializeNumber(c.ordersCount) : undefined,
    totalSpend: "totalSpend" in c ? serializeNumber(c.totalSpend) : undefined,
    lastOrderDate: "lastOrderDate" in c && c.lastOrderDate ? serializeDate(c.lastOrderDate) : undefined,
  };
}

/**
 * Order DTO Transformer
 */
export function toOrderDTO(order: OrderDetailBundle | OrderListItem): Order {
  let customerName = "Customer";
  let customerEmail = "customer@example.com";
  let customerPhone = "";

  if ("customer" in order && order.customer) {
    const cust = order.customer as {
      email?: string;
      phone?: string | null;
      name?: string;
      firstName?: string | null;
      lastName?: string | null;
    };
    if (cust.name) {
      customerName = cust.name;
    } else {
      customerName = [cust.firstName, cust.lastName].filter(Boolean).join(" ").trim() || "Customer";
    }
    customerEmail = cust.email || customerEmail;
    customerPhone = cust.phone || "";
  }

  const items: OrderItem[] = "items" in order && Array.isArray((order as any).items)
    ? (order as any).items.map((item: any) => {
        const allEngravings = Array.isArray(item.engravings)
          ? item.engravings.map((eng: any) => ({
              optionId: eng.engravingOptionId || "",
              optionName: eng.text ? "Name Engraving" : "Logo Engraving",
              type: (eng.text ? "name" : "logo") as "name" | "logo",
              text: eng.text || undefined,
              logoUrl: eng.logoUrl || undefined,
              price: serializeNumber(eng.price),
            }))
          : [];
        const eng = allEngravings[0];
        return {
          id: item.id,
          productId: item.productId || "",
          productName: item.productName,
          variantId: item.variantId || "",
          variantName: item.variantName || "",
          colorName: item.colorName || item.variantName?.split("/")[0]?.trim() || "",
          size: item.size || item.variantName?.split("/")[1]?.trim() || "",
          sku: item.sku,
          image: item.imageUrl || "",
          price: serializeNumber(item.unitPrice),
          quantity: item.quantity,
          engraving: eng,
          engravings: allEngravings,
        };
      })
    : [];

  const internalNotes = "internalNotes" in order && Array.isArray((order as any).internalNotes)
    ? (order as any).internalNotes.map((n: any) => ({
        id: n.id,
        text: n.body,
        at: serializeDate(n.createdAt),
        by: n.createdByUser?.name || "Staff Member",
      }))
    : [];

  const timeline = "statusHistory" in order && Array.isArray((order as any).statusHistory)
    ? (order as any).statusHistory.map((h: any) => ({
        status: h.toStatus as OrderStatus,
        label: `Status changed to ${h.toStatus.replace(/_/g, " ")}`,
        at: serializeDate(h.createdAt),
        note: h.note || undefined,
        by: h.changedBy === "system" ? "System" : (h.authorName || h.changedBy || "System"),
      }))
    : [];

  const orderAny = order as any;
  const snapAddress = (orderAny.shippingAddress || orderAny.shippingAddressSnapshot || {}) as any;

  const latestPayment = "payments" in order && Array.isArray((order as any).payments) && (order as any).payments.length > 0
    ? (order as any).payments[0]
    : null;

  let paymentStatus: PaymentStatus = "pending";
  if (latestPayment) {
    if (latestPayment.status === "paid") paymentStatus = "approved";
    else if (latestPayment.status === "awaiting_verification") paymentStatus = "submitted";
    else if (latestPayment.status === "rejected") paymentStatus = "rejected";
    else if (latestPayment.status === "refunded") paymentStatus = "refunded";
    else if (latestPayment.status === "failed") paymentStatus = "failed";
    else paymentStatus = "pending";
  } else if ("paymentStatus" in order && (order as any).paymentStatus) {
    const rawPs = (order as any).paymentStatus;
    paymentStatus = rawPs === "paid" ? "approved" : rawPs === "awaiting_verification" ? "submitted" : rawPs;
  }

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customerId: "customerId" in order ? ((order as any).customerId || null) : null,
    customerName,
    customerEmail,
    customerPhone,
    customerType: Boolean(
      ("customer" in order && (order as any).customer?.userId) ||
      ("isRegistered" in order && (order as any).isRegistered)
    ) ? "registered" : "guest",
    date: serializeDate(order.placedAt),
    items,
    itemsCount: "itemsCount" in order ? Number((order as any).itemsCount) : items.reduce((s, i) => s + (i.quantity || 1), 0),
    subtotal: serializeNumber(order.subtotal),
    engravingCharges: serializeNumber(orderAny.engravingTotal ?? 0),
    discount: serializeNumber(orderAny.discountTotal ?? 0),
    shipping: serializeNumber(orderAny.shippingTotal ?? 0),
    total: serializeNumber(order.total),
    status: order.status === "pending" ? "pending_cod" : (order.status as OrderStatus),
    paymentStatus,
    paymentMethod: (() => {
      let raw = "bank";
      if ("paymentMethod" in order && (order as any).paymentMethod?.code) {
        raw = (order as any).paymentMethod.code;
      } else if ("paymentMethodCode" in order && (order as any).paymentMethodCode) {
        raw = (order as any).paymentMethodCode;
      } else if ("paymentMethodName" in order && (order as any).paymentMethodName) {
        raw = (order as any).paymentMethodName.toLowerCase();
      }
      if (raw === "bank_transfer" || raw.includes("bank")) return "bank" as PaymentMethodId;
      if (raw === "cod" || raw.includes("cash")) return "cod" as PaymentMethodId;
      return raw as PaymentMethodId;
    })(),
    paymentMethodName: ("paymentMethod" in order && (order as any).paymentMethod?.name
      ? (order as any).paymentMethod.name
      : undefined),
    paymentId: latestPayment?.id,
    proofUrl: latestPayment?.proofUrl || undefined,
    senderName: latestPayment?.senderName || undefined,
    senderAccountLast4: latestPayment?.senderAccountLast4 || undefined,
    paidAt: latestPayment?.paidAt ? serializeDate(latestPayment.paidAt) : undefined,
    verifiedAt: latestPayment?.verifiedAt ? serializeDate(latestPayment.verifiedAt) : undefined,
    rejectionReason: latestPayment?.rejectionReason || undefined,
    transactionRef: latestPayment?.transactionReference || undefined,
    paymentDueAt: orderAny.paymentDueAt ? serializeDate(orderAny.paymentDueAt) : undefined,
    shippingAddress: {
      label: snapAddress.label || "Delivery Address",
      recipient: snapAddress.fullName || snapAddress.recipient || customerName,
      phone: snapAddress.phone || customerPhone,
      line1: snapAddress.addressLine1 || snapAddress.line1 || "Delivery Address",
      line2: snapAddress.addressLine2 || snapAddress.line2 || undefined,
      city: snapAddress.city || "Lahore",
      province: snapAddress.province || "Punjab",
      postcode: snapAddress.postalCode || snapAddress.postcode || "54000",
      country: snapAddress.country || "Pakistan",
    },
    courier: orderAny.courierName || undefined,
    trackingNumber: orderAny.trackingNumber || undefined,
    internalNotes,
    timeline,
  };
}

/**
 * Payment Submission DTO Transformer
 */
export function toPaymentSubmissionDTO(
  p: PaymentDetail | PaymentListItem,
  orderNumber = "—",
  customerName = "—",
  customerPhone = ""
): PaymentSubmission {
  const methodCode = "paymentMethod" in p && p.paymentMethod?.code
    ? p.paymentMethod.code
    : "paymentMethodCode" in p && p.paymentMethodCode
    ? p.paymentMethodCode
    : "bank";

  return {
    id: p.id,
    orderId: p.orderId,
    orderNumber: "orderNumber" in p && typeof (p as any).orderNumber === "string" ? (p as any).orderNumber : orderNumber,
    customerName: "customerName" in p && typeof (p as any).customerName === "string" ? (p as any).customerName : customerName,
    customerPhone: "customerPhone" in p && typeof (p as any).customerPhone === "string" ? (p as any).customerPhone : customerPhone,
    amount: serializeNumber(p.amount),
    method: (methodCode === "bank_transfer" ? "bank" : methodCode) as PaymentMethodId,
    transactionRef: p.transactionReference || "—",
    proofUrl: (p as any).proofUrl || (p as any).proofImageUrl || undefined,
    submittedAt: serializeDate(p.createdAt),
    status: p.status === "awaiting_verification"
      ? "submitted"
      : p.status === "paid"
      ? "approved"
      : p.status === "rejected"
      ? "rejected"
      : "submitted",
    rejectionReason: p.rejectionReason || undefined,
    reviewedAt: p.verifiedAt ? serializeDate(p.verifiedAt) : undefined,
    isDuplicate: Boolean((p as any).metadata?.duplicateReference),
    duplicateRefDetails: (p as any).metadata?.duplicateReference || undefined,
  };
}

/**
 * Coupon DTO Transformer
 */
export function toCouponDTO(c: CouponListItem): Coupon {
  return {
    id: c.id,
    code: c.code,
    description: c.description || "",
    type: c.discountType === "percentage" ? "percentage" : "fixed",
    value: serializeNumber(c.discountValue),
    minOrderAmount: serializeNumber(c.minimumOrderAmount),
    maxDiscount: c.maximumDiscountAmount ? serializeNumber(c.maximumDiscountAmount) : null,
    usageLimit: c.usageLimit ? serializeNumber(c.usageLimit) : null,
    perCustomerLimit: c.usageLimitPerCustomer ? serializeNumber(c.usageLimitPerCustomer) : null,
    firstOrderOnly: Boolean(c.firstOrderOnly),
    startsAt: serializeDate(c.startsAt),
    expiresAt: c.expiresAt ? serializeDate(c.expiresAt) : "",
    usedCount: serializeNumber(c.usageCount),
    status: c.computedStatus,
  };
}

/**
 * Shipping Method DTO Transformer
 */
export function toShippingMethodDTO(m: DbShippingMethod): ShippingMethod {
  return {
    id: m.id,
    name: m.name,
    description: m.description || "",
    price: serializeNumber(m.price),
    freeShippingThreshold: m.freeAbove ? serializeNumber(m.freeAbove) : null,
    minDays: serializeNumber(m.minDays, 2),
    maxDays: serializeNumber(m.maxDays, 5),
    active: Boolean(m.isActive),
    displayOrder: serializeNumber(m.sortOrder, 1),
  };
}

/**
 * Engraving Option DTO Transformer
 */
export function toEngravingOptionDTO(e: DbEngravingOption): EngravingOption {
  return {
    id: e.id,
    name: e.name,
    type: e.type as "name" | "logo",
    description: e.description || "",
    price: serializeNumber(e.price),
    maxCharacters: e.maxCharacters ? serializeNumber(e.maxCharacters) : null,
    active: Boolean(e.isActive),
  };
}

/**
 * Payment Method DTO Transformer
 */
export function toPaymentMethodDTO(pm: DbPaymentMethod): PaymentMethod {
  return {
    id: (pm.code === "bank_transfer" ? "bank" : pm.code) as PaymentMethodId,
    dbId: pm.id,
    name: pm.name,
    description: pm.instructions || "",
    accountTitle: pm.accountTitle || "",
    accountNumber: pm.accountNumber || "",
    bankName: pm.bankName || "",
    iban: pm.iban || "",
    instructions: pm.instructions || "",
    active: Boolean(pm.isActive),
    displayOrder: serializeNumber(pm.sortOrder, 1),
    allowEngraving: Boolean(pm.allowedWithEngraving),
    supportsProof: Boolean(pm.supportsProof),
  };
}
