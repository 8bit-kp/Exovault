import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { recordAuditEvent } from "@/lib/audit";
import { connectToDatabase, disconnectFromDatabase } from "@/lib/db/mongoose";
import { AuditLog } from "@/models/AuditLog";

beforeAll(async () => {
  await connectToDatabase();
  await AuditLog.syncIndexes();
});
afterAll(disconnectFromDatabase);
beforeEach(async () => {
  await AuditLog.collection.deleteMany({});
});

describe("audit log", () => {
  it("stores keyed hashes, never the raw subject or IP", async () => {
    await recordAuditEvent({
      event: "LOGIN_FAILED",
      outcome: "failure",
      subject: "Victim@Example.com",
      ip: "203.0.113.7",
      requestId: "req-1",
    });
    const raw = await AuditLog.collection.findOne({});
    const serialized = JSON.stringify(raw);
    expect(serialized).not.toMatch(/victim@example\.com/i);
    expect(serialized).not.toContain("203.0.113.7");
    expect(raw?.subjectHash).toMatch(/^[0-9a-f]{64}$/);
    expect(raw?.ipHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("correlates the same subject regardless of case", async () => {
    await recordAuditEvent({ event: "LOGIN_FAILED", outcome: "failure", subject: "a@example.com" });
    await recordAuditEvent({ event: "LOGIN_FAILED", outcome: "failure", subject: " A@EXAMPLE.COM " });
    const rows = await AuditLog.find({}).lean();
    expect(new Set(rows.map((r) => r.subjectHash)).size).toBe(1);
  });

  it("is append-only through the model", async () => {
    await recordAuditEvent({ event: "USER_CREATED", outcome: "success", userId: "u1" });
    await expect(AuditLog.updateOne({ userId: "u1" }, { outcome: "failure" })).rejects.toThrow(/append-only/);
    await expect(AuditLog.deleteMany({})).rejects.toThrow(/append-only/);
    const doc = await AuditLog.findOne({ userId: "u1" });
    doc!.outcome = "failure";
    await expect(doc!.save()).rejects.toThrow(/append-only/);
  });

  it("rejects unknown fields instead of silently storing them", async () => {
    const withUnknownField: Record<string, unknown> = {
      event: "USER_CREATED",
      outcome: "success",
      email: "x@example.com",
    };
    await expect(AuditLog.create(withUnknownField)).rejects.toThrow();
  });

  it("expires rows after 12 months via a TTL index", async () => {
    const indexes = await AuditLog.collection.indexes();
    const ttl = indexes.find((i) => i.expireAfterSeconds !== undefined);
    expect(ttl?.key).toEqual({ createdAt: 1 });
    expect(ttl?.expireAfterSeconds).toBe(365 * 24 * 60 * 60);
  });
});
