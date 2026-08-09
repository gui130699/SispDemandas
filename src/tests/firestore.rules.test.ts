import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";

const rules = readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");
let environment: RulesTestEnvironment;

const requesterA = { uid: "requester-a", email: "a@example.com" };
const requesterB = { uid: "requester-b", email: "b@example.com" };
const consultantA = { uid: "consultant-a", email: "consultant@example.com" };
const consultantB = { uid: "consultant-b", email: "consultant-b@example.com" };
const admin = { uid: "admin", email: "admin@example.com" };

async function seed() {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "companies", "company-a"), { legalName: "Empresa A", active: true }),
      setDoc(doc(db, "companies", "company-b"), { legalName: "Empresa B", active: true }),
      setDoc(doc(db, "users", requesterA.uid), { uid: requesterA.uid, name: "Cliente A", role: "requester", active: true, companyId: "company-a", companyIds: [] }),
      setDoc(doc(db, "users", requesterB.uid), { uid: requesterB.uid, name: "Cliente B", role: "requester", active: true, companyId: "company-b", companyIds: [] }),
      setDoc(doc(db, "users", consultantA.uid), { uid: consultantA.uid, name: "Consultor A", email: consultantA.email, role: "consultant", active: true, companyId: null, companyIds: ["company-a"], permissions: { takeUnassignedDemand: true, changeStatus: true, addInternalNote: true } }),
      setDoc(doc(db, "users", consultantB.uid), { uid: consultantB.uid, name: "Consultor B", email: consultantB.email, role: "consultant", active: true, companyId: null, companyIds: ["company-a"] }),
      setDoc(doc(db, "users", admin.uid), { uid: admin.uid, name: "Admin", role: "admin", active: true, companyId: null, companyIds: [] }),
      setDoc(doc(db, "demands", "demand-a"), { id: "demand-a", code: "DEM-2026-000001", sequence: 1, year: 2026, title: "A", description: "A", companyId: "company-a", companyName: "Empresa A", requesterId: requesterA.uid, requesterName: "Cliente A", consultantId: null, consultantName: null, status: "analysis", statusId: "analysis", createdAt: new Date() }),
      setDoc(doc(db, "demands", "demand-b"), { id: "demand-b", code: "DEM-2026-000002", sequence: 2, year: 2026, title: "B", description: "B", companyId: "company-b", companyName: "Empresa B", requesterId: requesterB.uid, requesterName: "Cliente B", consultantId: null, consultantName: null, status: "analysis", statusId: "analysis", createdAt: new Date() }),
      setDoc(doc(db, "sectors", "financeiro"), { id: "financeiro", name: "Financeiro", nameNormalized: "financeiro", active: true }),
      setDoc(doc(db, "sectors", "inativo"), { id: "inativo", name: "Inativo", nameNormalized: "inativo", active: false }),
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
    await assertSucceeds(setDoc(doc(db, "demands", "new-demand"), { companyId: "company-a", companyName: "Empresa A" }));
    await assertFails(setDoc(doc(db, "demands", "forged-company-name"), { companyId: "company-a", companyName: "Empresa Forjada" }));
  });

  it("não permite auto-vínculo de consultor e mantém leitura multiempresa isolada", async () => {
    const db = environment.authenticatedContext(consultantA.uid, { email: consultantA.email }).firestore();
    await assertSucceeds(getDoc(doc(db, "demands", "demand-a")));
    await assertFails(getDoc(doc(db, "demands", "demand-b")));
    await assertSucceeds(setDoc(doc(db, "demands", "consultant-demand-a"), { companyId: "company-a", companyName: "Empresa A" }));
    await assertFails(setDoc(doc(db, "demands", "consultant-demand-b"), { companyId: "company-b", companyName: "Empresa B" }));
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

  it("permite ao consultor solicitar nova empresa e reserva a revisão ao administrador", async () => {
    const consultantDb = environment.authenticatedContext(consultantA.uid, { email: consultantA.email }).firestore();
    const requestRef = doc(consultantDb, "companyRegistrationRequests", "registration-a");
    const company = {
      legalName: "Empresa Solicitada",
      tradeName: "Solicitada",
      cnpj: "19131243000197",
      phone: "",
      email: "",
      contactName: "",
      notes: "",
      active: true,
      address: { zipCode: "", street: "", number: "", complement: "", neighborhood: "", city: "Blumenau", state: "SC" },
    };
    await assertSucceeds(setDoc(requestRef, {
      id: "registration-a",
      requestedBy: consultantA.uid,
      requestedByName: "Consultor A",
      requestedByEmail: consultantA.email,
      company,
      status: "pending",
      requestedAt: new Date(),
    }));
    await assertSucceeds(getDoc(requestRef));
    await assertSucceeds(getDocs(query(collection(consultantDb, "companyRegistrationRequests"), where("requestedBy", "==", consultantA.uid))));
    await assertFails(updateDoc(requestRef, { status: "approved" }));

    const requesterDb = environment.authenticatedContext(requesterA.uid, { email: requesterA.email }).firestore();
    await assertFails(getDoc(doc(requesterDb, "companyRegistrationRequests", "registration-a")));
    await assertFails(setDoc(doc(requesterDb, "companyRegistrationRequests", "registration-b"), {
      id: "registration-b",
      requestedBy: requesterA.uid,
      requestedByName: "Cliente A",
      requestedByEmail: requesterA.email,
      company,
      status: "pending",
      requestedAt: new Date(),
    }));

    const adminDb = environment.authenticatedContext(admin.uid, { email: admin.email }).firestore();
    await assertSucceeds(updateDoc(doc(adminDb, "companyRegistrationRequests", "registration-a"), { status: "approved", companyId: "company-new" }));
  });

  it("permite solicitar gerência apenas de empresa vinculada e reserva a aprovação ao administrador", async () => {
    const consultantDb = environment.authenticatedContext(consultantA.uid, { email: consultantA.email }).firestore();
    const request = {
      id: "manager-request-a",
      consultantId: consultantA.uid,
      consultantName: "Consultor A",
      consultantEmail: consultantA.email,
      companyId: "company-a",
      companyName: "Empresa A",
      reason: "Coordenar o projeto",
      status: "pending",
      requestedAt: new Date(),
    };
    await assertSucceeds(setDoc(doc(consultantDb, "projectManagerRequests", request.id), request));
    await assertSucceeds(getDocs(query(collection(consultantDb, "projectManagerRequests"), where("consultantId", "==", consultantA.uid))));
    await assertFails(setDoc(doc(consultantDb, "projectManagerRequests", "manager-request-b"), { ...request, id: "manager-request-b", companyId: "company-b", companyName: "Empresa B" }));
    await assertFails(updateDoc(doc(consultantDb, "projectManagerRequests", request.id), { status: "approved" }));

    const requesterDb = environment.authenticatedContext(requesterA.uid, { email: requesterA.email }).firestore();
    await assertFails(setDoc(doc(requesterDb, "projectManagerRequests", "manager-request-client"), { ...request, id: "manager-request-client", consultantId: requesterA.uid, consultantName: "Cliente A", consultantEmail: requesterA.email }));

    const adminDb = environment.authenticatedContext(admin.uid, { email: admin.email }).firestore();
    await assertSucceeds(updateDoc(doc(adminDb, "projectManagerRequests", request.id), { status: "approved" }));
  });

  it("permite ao gerente listar consultores e distribuir demandas somente na empresa gerenciada", async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await updateDoc(doc(db, "companies", "company-a"), { projectManagerId: consultantA.uid, projectManagerName: "Consultor A" });
      await setDoc(doc(db, "companyAccess", `company-a_${consultantB.uid}`), { id: `company-a_${consultantB.uid}`, companyId: "company-a", companyName: "Empresa A", userId: consultantB.uid, userName: "Consultor B", consultantAccess: true, projectManagerAccess: false, active: true });
      await setDoc(doc(db, "companyAccess", `company-b_${consultantB.uid}`), { id: `company-b_${consultantB.uid}`, companyId: "company-b", companyName: "Empresa B", userId: consultantB.uid, userName: "Consultor B", consultantAccess: true, projectManagerAccess: false, active: true });
    });
    const managerDb = environment.authenticatedContext(consultantA.uid, { email: consultantA.email }).firestore();
    await assertSucceeds(getDocs(query(collection(managerDb, "companyAccess"), where("companyId", "==", "company-a"))));
    await assertFails(getDoc(doc(managerDb, "companyAccess", `company-b_${consultantB.uid}`)));
    await assertSucceeds(updateDoc(doc(managerDb, "demands", "demand-a"), { consultantId: consultantB.uid, consultantName: "Consultor B" }));
    await assertFails(updateDoc(doc(managerDb, "demands", "demand-a"), { consultantId: requesterA.uid, consultantName: "Cliente A" }));
    await assertFails(updateDoc(doc(managerDb, "demands", "demand-b"), { consultantId: consultantB.uid, consultantName: "Consultor B" }));

    const adminDb = environment.authenticatedContext(admin.uid, { email: admin.email }).firestore();
    await assertSucceeds(setDoc(doc(adminDb, "companyAccess", "company-a-admin-write"), { companyId: "company-a", userId: consultantA.uid }));
  });

  it("mantém setores globais e solicitações sem vínculo com empresa", async () => {
    const requesterDb = environment.authenticatedContext(requesterA.uid, { email: requesterA.email }).firestore();
    const consultantDb = environment.authenticatedContext(consultantA.uid, { email: consultantA.email }).firestore();
    await assertSucceeds(getDoc(doc(requesterDb, "sectors", "financeiro")));
    await assertSucceeds(getDoc(doc(consultantDb, "sectors", "financeiro")));
    await assertFails(getDoc(doc(requesterDb, "sectors", "inativo")));

    const requestRef = doc(requesterDb, "sectorRequests", "request-sector");
    await assertSucceeds(setDoc(requestRef, { id: "request-sector", name: "Comercial", nameNormalized: "comercial", requestedBy: requesterA.uid, requestedByName: "Cliente A", requestedByRole: "requester", status: "pending", requestedAt: new Date() }));
    await assertFails(updateDoc(requestRef, { status: "approved" }));
    await assertSucceeds(getDocs(query(collection(requesterDb, "sectorRequests"), where("requestedBy", "==", requesterA.uid))));

    const invalidRef = doc(requesterDb, "sectorRequests", "company-sector");
    await assertFails(setDoc(invalidRef, { id: "company-sector", companyId: "company-a", companyName: "Empresa A", name: "Fiscal", nameNormalized: "fiscal", requestedBy: requesterA.uid, requestedByName: "Cliente A", requestedByRole: "requester", status: "pending", requestedAt: new Date() }));

    await assertFails(deleteDoc(doc(requesterDb, "sectors", "financeiro")));
    const adminDb = environment.authenticatedContext(admin.uid, { email: admin.email }).firestore();
    await assertSucceeds(deleteDoc(doc(adminDb, "sectors", "financeiro")));
    await assertSucceeds(setDoc(doc(adminDb, "appConfig", "defaultSectorCatalog"), { initialized: true }));
    await assertFails(getDoc(doc(requesterDb, "appConfig", "defaultSectorCatalog")));
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
