import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const households = sqliteTable("households", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("Asia/Singapore"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const householdMembers = sqliteTable(
  "household_members",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    displayName: text("display_name"),
    role: text("role", { enum: ["owner", "member"] }).notNull(),
    status: text("status", { enum: ["pending", "active"] }).notNull(),
    invitedBy: text("invited_by"),
    activatedAt: text("activated_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("household_members_household_email_unique").on(
      table.householdId,
      table.email,
    ),
    index("household_members_email_idx").on(table.email),
  ],
);

export const items = sqliteTable(
  "items",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    createdBy: text("created_by").notNull(),
    name: text("name").notNull(),
    quantity: integer("quantity").notNull().default(1),
    location: text("location", { enum: ["fridge", "pantry"] }).notNull(),
    dateType: text("date_type", {
      enum: ["expiry", "best_before", "use_by", "unknown"],
    }).notNull(),
    itemDate: text("item_date").notNull(),
    reminderOn: text("reminder_on").notNull(),
    notes: text("notes").notNull().default(""),
    photoKey: text("photo_key").notNull(),
    photoContentType: text("photo_content_type").notNull(),
    status: text("status", { enum: ["active", "used", "discarded"] })
      .notNull()
      .default("active"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("items_household_status_date_idx").on(
      table.householdId,
      table.status,
      table.itemDate,
    ),
    index("items_reminder_idx").on(table.status, table.reminderOn),
  ],
);

export const reminderDeliveries = sqliteTable(
  "reminder_deliveries",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    recipientEmail: text("recipient_email").notNull(),
    reminderOn: text("reminder_on").notNull(),
    status: text("status", { enum: ["sent", "failed"] }).notNull(),
    providerId: text("provider_id"),
    attempts: integer("attempts").notNull().default(1),
    lastError: text("last_error"),
    sentAt: text("sent_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("reminder_delivery_once_unique").on(
      table.itemId,
      table.recipientEmail,
      table.reminderOn,
    ),
  ],
);
