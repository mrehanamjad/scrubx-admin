export type ID = string;

export interface ProductColor {
  id: ID;
  name: string;
  hex: string;
}

export interface ProductImage {
  id: ID;
  url: string;
  alt: string;
  /** null => shared image used when no specific colour is selected */
  colorId: ID | null;
  isMain: boolean;
  fileId?: string; // ImageKit file ID for deletion & management
}

export interface ProductVariant {
  id: ID;
  colorId: ID;
  colorName: string;
  colorHex: string;
  size: string;
  name: string;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  stock: number;
  reserved: number;
  reorderLevel: number;
  active: boolean;
  /** manually added variant — kept when the colour/size matrix is regenerated */
  manual?: boolean;
}

export type ProductStatus = "draft" | "active" | "archived";

export type Gender = "unisex" | "men" | "women" | "kids";

export interface Product {
  id: ID;
  name: string;
  slug: string;
  description: string;
  categoryId: ID;
  brand: string;
  gender: Gender;
  material: string;
  status: ProductStatus;
  engraveable: boolean;
  featured: boolean;
  colors: ProductColor[];
  images: ProductImage[];
  variants: ProductVariant[];
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: ID;
  name: string;
  slug: string;
  parentId: ID | null;
  description: string;
  image: string;
  imageFileId?: string; // ImageKit file ID
  status: "active" | "inactive";
  sortOrder: number;
}

export type OrderStatus =
  | "pending"
  | "awaiting_payment"
  | "payment_submitted"
  | "pending_cod"
  | "confirmed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded";

export type PaymentStatus =
  | "pending"
  | "submitted"
  | "approved"
  | "rejected"
  | "refunded"
  | "failed";

export type PaymentMethodId =
  | "jazzcash"
  | "easypaisa"
  | "sadapay"
  | "nayapay"
  | "bank"
  | "cod";

export interface EngravingDetail {
  optionId: ID;
  optionName: string;
  type: "name" | "logo";
  text?: string;
  logoUrl?: string;
  price: number;
}

export interface OrderItem {
  id: ID;
  productId: ID;
  productName: string;
  variantId: ID;
  variantName: string;
  colorName: string;
  size: string;
  sku: string;
  image: string;
  price: number;
  quantity: number;
  engraving?: EngravingDetail;
  engravings?: EngravingDetail[];
}

export interface Address {
  label: string;
  recipient: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  province: string;
  postcode: string;
  country: string;
}

export interface OrderTimelineEvent {
  status: OrderStatus;
  label: string;
  at: string;
  note?: string;
  by?: string;
}

export interface Order {
  id: ID;
  orderNumber: string;
  customerId: ID | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerType: "registered" | "guest";
  date: string;
  items: OrderItem[];
  itemsCount?: number;
  subtotal: number;
  engravingCharges: number;
  discount: number;
  shipping: number;
  total: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethodId;
  paymentMethodName?: string;
  paymentId?: string;
  proofUrl?: string;
  senderName?: string;
  senderAccountLast4?: string;
  paidAt?: string;
  verifiedAt?: string;
  verifiedByName?: string;
  rejectionReason?: string;
  transactionRef?: string;
  paymentDueAt?: string;
  couponCode?: string;
  shippingAddress: Address;
  billingAddress?: Address;
  courier?: string;
  trackingNumber?: string;
  internalNotes: { id: ID; text: string; at: string; by: string }[];
  timeline: OrderTimelineEvent[];
  engraving?: EngravingDetail[];
}

export interface Customer {
  id: ID;
  name: string;
  email: string;
  phone: string;
  city: string;
  type: "registered" | "guest";
  registeredAt: string;
  addresses: Address[];
  notes: { id: ID; text: string; at: string; authorName?: string; isPinned?: boolean }[];
  ordersCount?: number;
  totalSpend?: number;
  lastOrderDate?: string | null;
}

export interface Coupon {
  id: ID;
  code: string;
  description: string;
  type: "percentage" | "fixed";
  value: number;
  minOrderAmount: number;
  maxDiscount: number | null;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  firstOrderOnly: boolean;
  startsAt: string;
  expiresAt: string;
  usedCount: number;
  status: "active" | "inactive" | "expired" | "scheduled";
}

export interface PaymentMethod {
  id: PaymentMethodId;
  dbId?: string;
  name: string;
  description: string;
  accountTitle: string;
  accountNumber: string;
  bankName: string;
  iban: string;
  instructions: string;
  active: boolean;
  displayOrder: number;
  allowEngraving: boolean;
  supportsProof: boolean;
}

export interface PaymentSubmission {
  id: ID;
  orderId: ID;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  amount: number;
  method: PaymentMethodId;
  transactionRef: string;
  proofUrl: string;
  submittedAt: string;
  status: "submitted" | "approved" | "rejected";
  rejectionReason?: string;
  reviewedAt?: string;
  isDuplicate?: boolean;
  duplicateRefDetails?: { paymentId?: string; orderId?: string };
}

export interface EngravingOption {
  id: ID;
  name: string;
  type: "name" | "logo";
  description: string;
  price: number;
  maxCharacters: number | null;
  active: boolean;
}

export interface ShippingMethod {
  id: ID;
  name: string;
  description: string;
  price: number;
  freeShippingThreshold: number | null;
  minDays: number;
  maxDays: number;
  active: boolean;
  displayOrder: number;
}

export type InventoryMovementType =
  | "restock"
  | "sale"
  | "cancellation"
  | "return"
  | "adjustment";

export interface InventoryMovement {
  id: ID;
  productId: ID;
  productName: string;
  variantId: ID;
  variantName: string;
  sku: string;
  type: InventoryMovementType;
  quantity: number;
  reason: string;
  note?: string;
  at: string;
  by: string;
}

export interface StoreSettings {
  storeName: string;
  tagline: string;
  supportEmail: string;
  supportPhone: string;
  whatsapp: string;
  address: string;
  city: string;
  province: string;
  postcode: string;
  currency: "PKR";
  paymentDeadlineHours: number;
  orderConfirmationAuto: boolean;
  lowStockAlerts: boolean;
  newOrderEmail: boolean;
  newOrderWhatsapp: boolean;
  paymentSubmittedAlert: boolean;
  dailySummary: boolean;
  defaultShippingMethodId: ID;
}

export interface AppState {
  products: Product[];
  categories: Category[];
  orders: Order[];
  customers: Customer[];
  coupons: Coupon[];
  paymentMethods: PaymentMethod[];
  paymentSubmissions: PaymentSubmission[];
  engravingOptions: EngravingOption[];
  shippingMethods: ShippingMethod[];
  inventoryMovements: InventoryMovement[];
  settings: StoreSettings;
}
