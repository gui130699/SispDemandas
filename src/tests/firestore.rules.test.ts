import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

const rules = readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");
let environment: RulesTestEnvironment;

const requesterA = { uid: "requester-a", email: "a@example.com" };
const requesterB = { uid: "requester-b", email: "b@example.com" };
const consultantA = { uid: "consultant-a", email: "consultant@example.com" };
const admin = { uid: "admin", email: "admin@example.com" };

async function seed() {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "companies", "company-a"), { legalName: "Empresa A", active: true }),
      setDoc(doc(db, "companies", "company-b"), { legalName: "Empresa B", active: true }),
      setDoc(doc(db, "users", requesterA.uid), { uid: requesterA.uid, name: "Cliente A", role: "requester", active: true, companyId: "company-a", companyIds: [] }),
      setDoc(doc(db, "users", requesterB.uid), { uid: requesterB.uid, name: "Cliente B", role: "requester", active: true, companyId: "company-b", companyIds: [] }),
      setDoc(doc(db, "users", consultantA.uid), { uid: consultantA.uid, name: "Consultor A", role: "consultant", active: true, companyId: null, companyIds: ["company-a"], permissions: { takeUnassignedDemand: true, changeStatus: true, addInternalNote: true } }),
      setDoc(doc(db, "users", admin.uid), { uid: admin.uid, name: "Admin", role: "admin", active: true, companyId: null, companyIds: [] }),
      setDoc(doc(db, "demands", "demand-a"), { id: "demand-a", code: "DEM-2026-000001", sequence: 1, year: 2026, title: "A", description: "A", companyId: "company-a", companyName: "Empresa A", requesterId: requesterA.uid, requesterName: "Cliente A", consultantId: null, consultantName: null, status: "analysis", statusId: "analysis", createdAt: new Date() }),
      setDoc(doc(db, "demands", "demand-b"), { id: "demand-b", code: "DEM-2026-000002", sequence: 2, year: 2026, title: "B", description: "B", companyId: "company-b", companyName: "Empresa B", requesterId: requesterB.uid, requesterName: "Cliente B", consultantId: null, consultantName: null, status: "analysis", statusId: "analysis", createdAt: new Date() }),
    ]);
  });
}

beforeAll(async () => {
  environment = await initializeTestEnvironment({ projectId: "sispdemandas-rules-test", firestore: { rules } });
});
beforeEach(async () => { await environment.clearFirestore(); await seed(); });
afterAll(async () => { await environment.cleanup(); });

describe("Firestore Rules: isolamento e operações privilegiadas", () => {
  it("isola demandas entre empresas", async () => {
    const db = environment.authenticatedContext(requesterA.uid, { email: requesterA.email }).firestore();
    await assertSucceeds(getDoc(doc(db, "demands", "demand-a")));
    await assertFails(getDoc(doc(db, "demands", "demand-b")));
  });

  it("bloqueia escrita direta de demanda, inclusive status, empresa e código", async () => {
    const db = environment.authenticatedContext(requesterA.uid, { email: requesterA.email }).firestore();
    await assertFails(updateDoc(doc(db, "demands", "demand-a"), { companyId: "company-b" }));
    await assertFails(updateDoc(doc(db, "demands", "demand-a"), { consultantId: consultantA.uid }));
    await assertFails(updateDoc(doc(db, "demands", "demand-a"), { status: "completed" }));
    await assertFails(updateDoc(doc(db, "demands", "demand-a"), { code: "DEM-2026-999999" }));
    await assertSucceeds(setDoc(doc(db, "demands", "new-demand"), { companyId: "company-a" }));
  });

  it("não permite auto-vínculo de consultor e mantém leitura multiempresa isolada", async () => {
    const db = environment.authenticatedContext(consultantA.uid, { email: consultantA.email }).firestore();
    await assertSucceeds(getDoc(doc(db, "demands", "demand-a")));
    await assertFails(getDoc(doc(db, "demands", "demand-b")));
    await assertFails(updateDoc(doc(db, "users", consultantA.uid), { companyIds: ["company-a", "company-b"] }));
  });

  it("permite apenas solicitar acesso próprio e impede autoaprovação", async () => {
    const consultantDb = environment.authenticatedContext(consultantA.uid, { email: consultantA.email }).firestore();
    const requestRef = doc(consultantDb, "consultantCompanyRequests", `${consultantA.uid}_company-b`);
    await assertSucceeds(setDoc(requestRef, { id: `${consultantA.uid}_company-b`, consultantId: consultantA.uid, consultantName: "Consultor A", companyId: "company-b", companyName: "Empresa B", status: "pending", requestedAt: new Date() }));
    await assertFails(updateDoc(requestRef, { status: "approved" }));
    const adminDb = environment.authenticatedContext(admin.uid, { email: admin.email }).firestore();
    await assertSucceeds(updateDoc(doc(adminDb, "consultantCompanyRequests", `${consultantA.uid}_company-b`), { status: "approved" }));
  });

  it("protege counters, auditLogs e notas de escrita web direta", async () => {
    const requesterDb = environment.authenticatedContext(requesterA.uid, { email: requesterA.email }).firestore();
    const consultantDb = environment.authenticatedContext(consultantA.uid, { email: consultantA.email }).firestore();
    await assertFails(setDoc(doc(requesterDb, "counters", "demands"), { sequence: 99 }));
    await assertFails(setDoc(doc(consultantDb, "counters", "demands"), { sequence: 99 }));
    await assertFails(setDoc(doc(requesterDb, "auditLogs", "fake"), { userId: admin.uid }));
    await assertFails(setDoc(doc(consultantDb, "auditLogs", "fake"), { userId: admin.uid }));
    await assertFails(setDoc(doc(consultantDb, "demands", "demand-b", "internalNotes", "note"), { text: "não autorizado" }));
  });

  it("mantém auditLogs somente leitura para administrador", async () => {
    await environment.withSecurityRulesDisabled(async (context) => setDoc(doc(context.firestore(), "auditLogs", "server-event"), { action: "DEMAND_CREATED" }));
    await assertSucceeds(getDoc(doc(environment.authenticatedContext(admin.uid, { email: admin.email }).firestore(), "auditLogs", "server-event")));
    await assertFails(getDoc(doc(environment.authenticatedContext(requesterA.uid, { email: requesterA.email }).firestore(), "auditLogs", "server-event")));
  });
});
