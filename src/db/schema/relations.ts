import { relations } from "drizzle-orm";
import { baUser, baSession, baAccount } from "./auth.ts";
import {
  productCategories,
  products,
  productColors,
  productVariants,
  productImages,
} from "./catalog.ts";
import { inventory, inventoryMovements } from "./inventory.ts";
import { engravingOptions } from "./engraving.ts";
import { customers, addresses, customerNotes } from "./customers.ts";
import { shippingMethods } from "./shipping.ts";
import { coupons } from "./coupons.ts";
import { paymentMethods } from "./payment-methods.ts";
import {
  orders,
  orderItems,
  orderItemEngraving,
  orderCoupons,
  orderNotes,
  orderStatusHistory,
} from "./orders.ts";
import { payments } from "./payments.ts";
import { storeSettings } from "./settings.ts";

/**
 * Drizzle ORM Relational Mapping Definitions
 *
 * Compatible with Drizzle ORM ^0.38.4.
 * Enables query builder lateral join expressions and relational typing.
 */

export const baUserRelations = relations(baUser, ({ one, many }) => ({
  customer: one(customers, {
    fields: [baUser.id],
    references: [customers.userId],
  }),
  sessions: many(baSession),
  accounts: many(baAccount),
  verifiedPayments: many(payments),
  createdNotes: many(orderNotes),
  createdMovements: many(inventoryMovements),
}));

export const productCategoriesRelations = relations(
  productCategories,
  ({ one, many }) => ({
    parent: one(productCategories, {
      fields: [productCategories.parentId],
      references: [productCategories.id],
      relationName: "categoryHierarchy",
    }),
    children: many(productCategories, { relationName: "categoryHierarchy" }),
    products: many(products),
  })
);

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(productCategories, {
    fields: [products.categoryId],
    references: [productCategories.id],
  }),
  colors: many(productColors),
  variants: many(productVariants),
  images: many(productImages),
}));

export const productColorsRelations = relations(
  productColors,
  ({ one, many }) => ({
    product: one(products, {
      fields: [productColors.productId],
      references: [products.id],
    }),
    variants: many(productVariants),
    images: many(productImages),
  })
);

export const productVariantsRelations = relations(
  productVariants,
  ({ one, many }) => ({
    product: one(products, {
      fields: [productVariants.productId],
      references: [products.id],
    }),
    color: one(productColors, {
      fields: [productVariants.colorId],
      references: [productColors.id],
    }),
    inventory: one(inventory, {
      fields: [productVariants.id],
      references: [inventory.variantId],
    }),
    movements: many(inventoryMovements),
    orderItems: many(orderItems),
  })
);

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, {
    fields: [productImages.productId],
    references: [products.id],
  }),
  color: one(productColors, {
    fields: [productImages.colorId],
    references: [productColors.id],
  }),
}));

export const inventoryRelations = relations(inventory, ({ one }) => ({
  variant: one(productVariants, {
    fields: [inventory.variantId],
    references: [productVariants.id],
  }),
}));

export const inventoryMovementsRelations = relations(
  inventoryMovements,
  ({ one }) => ({
    variant: one(productVariants, {
      fields: [inventoryMovements.variantId],
      references: [productVariants.id],
    }),
    order: one(orders, {
      fields: [inventoryMovements.orderId],
      references: [orders.id],
    }),
    createdByUser: one(baUser, {
      fields: [inventoryMovements.createdBy],
      references: [baUser.id],
    }),
  })
);

export const engravingOptionsRelations = relations(
  engravingOptions,
  ({ many }) => ({
    engravings: many(orderItemEngraving),
  })
);

export const customersRelations = relations(customers, ({ one, many }) => ({
  user: one(baUser, {
    fields: [customers.userId],
    references: [baUser.id],
  }),
  addresses: many(addresses),
  orders: many(orders),
  notes: many(customerNotes),
}));

export const customerNotesRelations = relations(customerNotes, ({ one }) => ({
  customer: one(customers, {
    fields: [customerNotes.customerId],
    references: [customers.id],
  }),
  author: one(baUser, {
    fields: [customerNotes.createdBy],
    references: [baUser.id],
  }),
}));

export const addressesRelations = relations(addresses, ({ one }) => ({
  customer: one(customers, {
    fields: [addresses.customerId],
    references: [customers.id],
  }),
}));

export const shippingMethodsRelations = relations(
  shippingMethods,
  ({ many }) => ({
    orders: many(orders),
  })
);

export const couponsRelations = relations(coupons, ({ many }) => ({
  orderCoupons: many(orderCoupons),
}));

export const paymentMethodsRelations = relations(
  paymentMethods,
  ({ many }) => ({
    orders: many(orders),
    payments: many(payments),
  })
);

export const ordersRelations = relations(orders, ({ one, many }) => ({
  customer: one(customers, {
    fields: [orders.customerId],
    references: [customers.id],
  }),
  paymentMethod: one(paymentMethods, {
    fields: [orders.paymentMethodId],
    references: [paymentMethods.id],
  }),
  shippingMethod: one(shippingMethods, {
    fields: [orders.shippingMethodId],
    references: [shippingMethods.id],
  }),
  items: many(orderItems),
  payments: many(payments),
  coupons: many(orderCoupons),
  notes: many(orderNotes),
  statusHistory: many(orderStatusHistory),
  inventoryMovements: many(inventoryMovements),
}));

export const orderItemsRelations = relations(orderItems, ({ one, many }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  variant: one(productVariants, {
    fields: [orderItems.variantId],
    references: [productVariants.id],
  }),
  engravings: many(orderItemEngraving),
}));

export const orderItemEngravingRelations = relations(
  orderItemEngraving,
  ({ one }) => ({
    orderItem: one(orderItems, {
      fields: [orderItemEngraving.orderItemId],
      references: [orderItems.id],
    }),
    engravingOption: one(engravingOptions, {
      fields: [orderItemEngraving.engravingOptionId],
      references: [engravingOptions.id],
    }),
  })
);

export const orderCouponsRelations = relations(orderCoupons, ({ one }) => ({
  order: one(orders, {
    fields: [orderCoupons.orderId],
    references: [orders.id],
  }),
  coupon: one(coupons, {
    fields: [orderCoupons.couponId],
    references: [coupons.id],
  }),
}));

export const orderNotesRelations = relations(orderNotes, ({ one }) => ({
  order: one(orders, {
    fields: [orderNotes.orderId],
    references: [orders.id],
  }),
  createdByUser: one(baUser, {
    fields: [orderNotes.createdBy],
    references: [baUser.id],
  }),
}));

export const orderStatusHistoryRelations = relations(
  orderStatusHistory,
  ({ one }) => ({
    order: one(orders, {
      fields: [orderStatusHistory.orderId],
      references: [orders.id],
    }),
  })
);

export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, {
    fields: [payments.orderId],
    references: [orders.id],
  }),
  paymentMethod: one(paymentMethods, {
    fields: [payments.paymentMethodId],
    references: [paymentMethods.id],
  }),
  verifiedByUser: one(baUser, {
    fields: [payments.verifiedBy],
    references: [baUser.id],
  }),
}));

export const storeSettingsRelations = relations(storeSettings, ({ one }) => ({
  updatedByUser: one(baUser, {
    fields: [storeSettings.updatedBy],
    references: [baUser.id],
  }),
}));
