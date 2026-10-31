import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const members = sqliteTable("members", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  publicName: text("public_name"),
  status: text("status").notNull().default("pending"),
  requestedAt: text("requested_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  approvedAt: text("approved_at"),
  consentedAt: text("consented_at"),
  consentVersion: text("consent_version"),
  deletedAt: text("deleted_at"),
});

export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  focus: text("focus").notNull().default("No-Gi Jiu-Jitsu"),
  startsAt: text("starts_at").notNull(),
  location: text("location").notNull(),
  capacity: integer("capacity").notNull(),
  isOpen: integer("is_open", { mode: "boolean" }).notNull().default(true),
  attendanceClosedAt: text("attendance_closed_at"),
  archivedAt: text("archived_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const bookings = sqliteTable(
  "bookings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: integer("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => members.userId, { onDelete: "cascade" }),
    bookedAt: text("booked_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    attendedAt: text("attended_at"),
    attendanceStatus: text("attendance_status"),
  },
  (table) => [uniqueIndex("bookings_session_user_unique").on(table.sessionId, table.userId)],
);

export const sessionRequests = sqliteTable("session_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  memberId: text("member_id").notNull().references(() => members.userId, { onDelete: "cascade" }),
  technique: text("technique").notNull(),
  details: text("details"),
  startsAt: text("starts_at").notNull(),
  location: text("location").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  reviewedAt: text("reviewed_at"),
  sessionId: integer("session_id").references(() => sessions.id, { onDelete: "set null" }),
});
