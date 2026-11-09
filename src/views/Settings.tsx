'use client';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  Bell,
  Building2,
  Database,
  RotateCcw,
  Save,
  Settings2,
  ShoppingBag,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input, Textarea } from "../components/ui/input";
import { Label, FieldError } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { PageHeader } from "../components/shared/page-header";
import { ConfirmDialog } from "../components/shared/confirm-dialog";
import { useToast } from "../components/ui/toast";
import { useCan } from "../components/providers/role-provider";
import { cn } from "../lib/utils";
import { updateStoreSettingsBatchAction } from "../actions/settings";

const settingsSchema = z.object({
  storeName: z.string().min(2, "Store name is required"),
  tagline: z.string().min(4, "Add a short tagline"),
  supportEmail: z.string().email("Enter a valid support email"),
  supportPhone: z.string().min(7, "Enter a valid phone number"),
  whatsapp: z.string().min(7, "Enter a valid WhatsApp number"),
  address: z.string().min(5, "Enter the store address"),
  city: z.string().min(2, "City is required"),
  province: z.string().min(2, "Province is required"),
  postcode: z.string().min(3, "Postcode is required"),
  paymentDeadlineHours: z.number().min(1).max(168),
});

type SettingsForm = z.infer<typeof settingsSchema>;

export interface SettingsData {
  storeName: string;
  tagline: string;
  supportEmail: string;
  supportPhone: string;
  whatsapp: string;
  address: string;
  city: string;
  province: string;
  postcode: string;
  paymentDeadlineHours: number;
  defaultShippingMethodId?: string;
  orderConfirmationAuto: boolean;
  lowStockAlerts: boolean;
  newOrderEmail: boolean;
  newOrderWhatsapp: boolean;
  paymentSubmittedAlert: boolean;
  dailySummary: boolean;
}

interface SettingsPageProps {
  initialSettings: SettingsData;
  shippingMethods?: Array<{ id: string; name: string }>;
  counts?: {
    products: number;
    orders: number;
    customers: number;
  };
}

export default function SettingsPage({
  initialSettings,
  shippingMethods = [],
  counts = { products: 0, orders: 0, customers: 0 },
}: SettingsPageProps) {
  const router = useRouter();
  const { toast } = useToast();
  const canWrite = useCan("settings:write");
  const [confirmReset, setConfirmReset] = useState(false);
  const [settingsState, setSettingsState] = useState<SettingsData>(initialSettings);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    mode: "onBlur",
    defaultValues: {
      storeName: initialSettings.storeName,
      tagline: initialSettings.tagline,
      supportEmail: initialSettings.supportEmail,
      supportPhone: initialSettings.supportPhone,
      whatsapp: initialSettings.whatsapp,
      address: initialSettings.address,
      city: initialSettings.city,
      province: initialSettings.province,
      postcode: initialSettings.postcode,
      paymentDeadlineHours: initialSettings.paymentDeadlineHours,
    },
  });

  const { register, handleSubmit, reset, watch, setValue, formState } = form;
  const values = watch();

  useEffect(() => {
    setSettingsState(initialSettings);
    reset({
      storeName: initialSettings.storeName,
      tagline: initialSettings.tagline,
      supportEmail: initialSettings.supportEmail,
      supportPhone: initialSettings.supportPhone,
      whatsapp: initialSettings.whatsapp,
      address: initialSettings.address,
      city: initialSettings.city,
      province: initialSettings.province,
      postcode: initialSettings.postcode,
      paymentDeadlineHours: initialSettings.paymentDeadlineHours,
    });
  }, [reset, initialSettings]);

  const onSubmit = async (data: SettingsForm) => {
    setIsSubmitting(true);
    try {
      const res = await updateStoreSettingsBatchAction({
        store_name: data.storeName.trim(),
        tagline: data.tagline.trim(),
        support_email: data.supportEmail.trim(),
        support_phone: data.supportPhone.trim(),
        whatsapp_number: data.whatsapp.trim(),
        address: data.address.trim(),
        city: data.city.trim(),
        province: data.province.trim(),
        postal_code: data.postcode.trim(),
        payment_deadline_hours: Number(data.paymentDeadlineHours),
      });

      if (res.success) {
        toast({
          title: "Settings saved",
          description: "Store configuration has been updated.",
        });
        router.refresh();
      } else {
        toast({
          title: "Failed to save settings",
          description: res.error || "An unexpected error occurred",
          variant: "error",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error saving settings",
        description: err.message || "An unexpected error occurred",
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggle = async (
    title: string,
    key:
      | "orderConfirmationAuto"
      | "lowStockAlerts"
      | "newOrderEmail"
      | "newOrderWhatsapp"
      | "paymentSubmittedAlert"
      | "dailySummary",
    checked: boolean,
  ) => {
    const backendKeyMap: Record<string, string> = {
      orderConfirmationAuto: "order_confirmation_auto",
      lowStockAlerts: "low_stock_alerts",
      newOrderEmail: "new_order_email",
      newOrderWhatsapp: "new_order_whatsapp",
      paymentSubmittedAlert: "payment_submitted_alert",
      dailySummary: "daily_summary",
    };
    const bKey = backendKeyMap[key];
    if (!bKey) return;

    setSettingsState((prev) => ({ ...prev, [key]: checked }));

    try {
      const res = await updateStoreSettingsBatchAction({
        [bKey]: checked,
      });

      if (res.success) {
        toast({ title: checked ? `${title} enabled` : `${title} disabled` });
        router.refresh();
      } else {
        setSettingsState((prev) => ({ ...prev, [key]: !checked }));
        toast({
          title: "Failed to update setting",
          description: res.error || "An unexpected error occurred",
          variant: "error",
        });
      }
    } catch (err: any) {
      setSettingsState((prev) => ({ ...prev, [key]: !checked }));
      toast({
        title: "Error updating setting",
        description: err.message || "An unexpected error occurred",
        variant: "error",
      });
    }
  };

  const handleDefaultShippingChange = async (methodId: string) => {
    setSettingsState((prev) => ({ ...prev, defaultShippingMethodId: methodId }));
    try {
      const res = await updateStoreSettingsBatchAction({
        default_shipping_method_id: methodId,
      });
      if (res.success) {
        toast({ title: "Default shipping method updated" });
        router.refresh();
      } else {
        toast({
          title: "Failed to update default shipping method",
          description: res.error || "An unexpected error occurred",
          variant: "error",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error updating default shipping method",
        description: err.message || "An unexpected error occurred",
        variant: "error",
      });
    }
  };

  const toggleRow = (
    title: string,
    description: string,
    key:
      | "orderConfirmationAuto"
      | "lowStockAlerts"
      | "newOrderEmail"
      | "newOrderWhatsapp"
      | "paymentSubmittedAlert"
      | "dailySummary",
  ) => (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-line bg-surface-muted/60 p-3.5">
      <div>
        <p className="text-[13px] font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-[12px] text-ink-muted">{description}</p>
      </div>
      <Switch
        checked={settingsState[key]}
        onCheckedChange={(checked) => handleToggle(title, key, checked)}
        aria-label={title}
      />
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Configuration"
        title="Store settings"
        description="General store information, payment deadlines and notification preferences."
        actions={
          <Badge variant="success">
            <Settings2 className="h-3 w-3" />
            Live Database Connected
          </Badge>
        }
      />

      <Tabs defaultValue="store">
        <TabsList>
          <TabsTrigger value="store">
            <Building2 className="h-3.5 w-3.5" />
            Store details
          </TabsTrigger>
          <TabsTrigger value="orders">
            <ShoppingBag className="h-3.5 w-3.5" />
            Orders & payments
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="h-3.5 w-3.5" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="data">
            <Database className="h-3.5 w-3.5" />
            Data
          </TabsTrigger>
        </TabsList>

        <TabsContent value="store">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <Card>
              <CardHeader>
                <h2 className="text-[15px] font-semibold text-ink">Store information</h2>
                <p className="text-[12.5px] text-ink-muted">
                  Shown on invoices, the storefront footer and customer emails.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="storeName">Store name</Label>
                    <Input id="storeName" aria-invalid={Boolean(formState.errors.storeName)} {...register("storeName")} />
                    <FieldError>{formState.errors.storeName?.message}</FieldError>
                  </div>
                  <div>
                    <Label htmlFor="tagline">Tagline</Label>
                    <Input id="tagline" aria-invalid={Boolean(formState.errors.tagline)} {...register("tagline")} />
                    <FieldError>{formState.errors.tagline?.message}</FieldError>
                  </div>
                  <div>
                    <Label htmlFor="supportEmail">Support email</Label>
                    <Input
                      id="supportEmail"
                      type="email"
                      aria-invalid={Boolean(formState.errors.supportEmail)}
                      {...register("supportEmail")}
                    />
                    <FieldError>{formState.errors.supportEmail?.message}</FieldError>
                  </div>
                  <div>
                    <Label htmlFor="supportPhone">Support phone</Label>
                    <Input
                      id="supportPhone"
                      aria-invalid={Boolean(formState.errors.supportPhone)}
                      {...register("supportPhone")}
                    />
                    <FieldError>{formState.errors.supportPhone?.message}</FieldError>
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="whatsapp">WhatsApp number</Label>
                    <Input
                      id="whatsapp"
                      placeholder="+92 300 0000000"
                      aria-invalid={Boolean(formState.errors.whatsapp)}
                      {...register("whatsapp")}
                    />
                    <FieldError>{formState.errors.whatsapp?.message}</FieldError>
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="address">Address</Label>
                    <Textarea
                      id="address"
                      rows={2}
                      aria-invalid={Boolean(formState.errors.address)}
                      {...register("address")}
                    />
                    <FieldError>{formState.errors.address?.message}</FieldError>
                  </div>
                  <div>
                    <Label htmlFor="city">City</Label>
                    <Input id="city" aria-invalid={Boolean(formState.errors.city)} {...register("city")} />
                    <FieldError>{formState.errors.city?.message}</FieldError>
                  </div>
                  <div>
                    <Label htmlFor="province">Province</Label>
                    <Input
                      id="province"
                      aria-invalid={Boolean(formState.errors.province)}
                      {...register("province")}
                    />
                    <FieldError>{formState.errors.province?.message}</FieldError>
                  </div>
                  <div>
                    <Label htmlFor="postcode">Postcode</Label>
                    <Input
                      id="postcode"
                      aria-invalid={Boolean(formState.errors.postcode)}
                      {...register("postcode")}
                    />
                    <FieldError>{formState.errors.postcode?.message}</FieldError>
                  </div>
                  <div>
                    <Label>Currency</Label>
                    <div className="flex h-9 items-center rounded-md border border-line-strong bg-surface-muted px-3 text-[13px] text-ink-soft">
                      PKR — Rs. <span className="ml-1 text-[11.5px] text-ink-muted">(fixed)</span>
                    </div>
                    <p className="mt-1.5 text-xs text-ink-muted">
                      ScrubX trades exclusively in Pakistani Rupees.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {canWrite && (
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => reset()} disabled={isSubmitting}>
                  Discard changes
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  <Save className="h-4 w-4" />
                  {isSubmitting ? "Saving..." : "Save settings"}
                </Button>
              </div>
            )}
          </form>
        </TabsContent>

        <TabsContent value="orders">
          <Card>
            <CardHeader>
              <h2 className="text-[15px] font-semibold text-ink">Orders & payments</h2>
              <p className="text-[12.5px] text-ink-muted">
                Control how long customers have to pay and how orders are confirmed.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="deadline">Payment deadline (hours)</Label>
                  <Input
                    id="deadline"
                    type="number"
                    min={1}
                    max={168}
                    value={values.paymentDeadlineHours}
                    onChange={(e) =>
                      setValue("paymentDeadlineHours", Number(e.target.value), {
                        shouldValidate: true,
                      })
                    }
                  />
                  <p className="mt-1.5 text-xs text-ink-muted">
                    Unpaid orders are cancelled automatically after this window.
                  </p>
                  <FieldError>{formState.errors.paymentDeadlineHours?.message}</FieldError>
                </div>
                <div>
                  <Label>Default shipping method</Label>
                  <Select
                    value={settingsState.defaultShippingMethodId ?? ""}
                    onValueChange={handleDefaultShippingChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select shipping method" />
                    </SelectTrigger>
                    <SelectContent>
                      {shippingMethods.map((method) => (
                        <SelectItem key={method.id} value={method.id}>
                          {method.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1.5 text-xs text-ink-muted">
                    Pre-selected at checkout for every customer.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {toggleRow(
                  "Auto-confirm orders",
                  "Confirm orders as soon as payment is approved.",
                  "orderConfirmationAuto",
                )}
                {toggleRow(
                  "Low stock alerts",
                  "Warn the team when a variant falls below its reorder level.",
                  "lowStockAlerts",
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <h2 className="text-[15px] font-semibold text-ink">Notifications</h2>
              <p className="text-[12.5px] text-ink-muted">
                Choose how the team is told about new activity.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {toggleRow(
                "New order email",
                "Email the team whenever a new order is placed.",
                "newOrderEmail",
              )}
              {toggleRow(
                "New order WhatsApp",
                "Send a WhatsApp alert for each new order.",
                "newOrderWhatsapp",
              )}
              {toggleRow(
                "Payment submitted alert",
                "Alert when a customer uploads a payment proof.",
                "paymentSubmittedAlert",
              )}
              {toggleRow(
                "Daily summary",
                "Receive a daily digest of orders, revenue and low stock.",
                "dailySummary",
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="data">
          <Card>
            <CardHeader>
              <h2 className="text-[15px] font-semibold text-ink">Database statistics</h2>
              <p className="text-[12.5px] text-ink-muted">
                Current record counts stored in Supabase PostgreSQL production database.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: "Products", value: counts.products },
                  { label: "Orders", value: counts.orders },
                  { label: "Customers", value: counts.customers },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-lg border border-line bg-surface-muted/60 p-3.5"
                  >
                    <p className="text-[11.5px] text-ink-muted">{item.label}</p>
                    <p className="mt-1 text-[20px] font-semibold text-ink tabular">{item.value}</p>
                  </div>
                ))}
              </div>

              <div className={cn("rounded-lg border border-amber-200 bg-amber-50/70 p-4")}>
                <p className="text-[13px] font-semibold text-amber-900">Database administration</p>
                <p className="mt-1 text-[12.5px] text-amber-800">
                  Data operations are persisted directly to Supabase PostgreSQL with automated audit
                  logs and transactional rollback protection.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 border-amber-300 text-amber-900 hover:bg-amber-100"
                  onClick={() => setConfirmReset(true)}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Database reset information
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Database administration"
        description="Database resetting is guarded by migrations and seeding scripts. To reseed the database, run npm run db:seed via administrative CLI."
        confirmLabel="Understood"
        onConfirm={() => {
          setConfirmReset(false);
          toast({ title: "Database active", description: "Use npm run db:seed for administrative resets." });
        }}
      />
    </div>
  );
}
