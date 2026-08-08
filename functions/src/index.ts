import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";

if (!getApps().length) initializeApp();
const db = getFirestore();

type Role = "admin" | "consultant" | "requester";
type Permission =
  | "takeUnassignedDemand"
  | "createDemand"
  | "editDemand"
  | "changeStatus"
  | "addPublicNote"
  | "addInternalNote"
  | "reopenDemand";

type Profile = {
  name: string;
  role: Role;
  active: boolean;
  companyId?: string | null;
  companyIds?: string[];
  permissions?: Record<string, boolean>;
};

type FunctionErrorCode = "aborted" | "already-exists" | "cancelled" | "data-loss" | "deadline-exceeded" | "failed-precondition" | "internal" | "invalid-argument" | "not-found" | "out-of-range" | "permission-denied" | "resource-exhausted" | "unauthenticated" | "unavailable" | "unimplemented" | "unknown";
function fail(code: FunctionErrorCode, message: string): never {
  throw new HttpsError(code, message);
}

async function caller(uid: string): Promise<Profile> {
  const snapshot = await db.doc(`users/${uid}`).get();
  if (!snapshot.exists) fail("permission-denied", "Perfil de usuário não encontrado.");
  const profile = snapshot.data() as Profile;
  if (!profile.active) fail("permission-denied", "Seu acesso está inativo.");
  return profile;
}

function has(profile: Profile, permission: Permission) {
  return profile.role === "admin" || profile.permissions?.[permission] === true;
}

function demandAccess(profile: Profile, companyId: string) {
  return profile.role === "admin" ||
    (profile.role === "requester" && profile.companyId === companyId) ||
    (profile.role === "consultant" && profile.companyIds?.includes(companyId) === true);
}

async function writeAudit(input: {
  action: string;
  entityType: string;
  entityId: string;
  actorId: string;
  actor: Profile;
  companyId?: string | null;
  before?: unknown;
  after?: unknown;
}) {
  await db.collection("auditLogs").add({
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    companyId: input.companyId ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
    userId: input.actorId,
    userName: input.actor.name,
    userRole: input.actor.role,
    createdAt: FieldValue.serverTimestamp(),
  });
}

function legacyStatus(status: Record<string, unknown>) {
  const keys = Array.isArray(status.legacyKeys) ? status.legacyKeys : [];
  return typeof keys[0] === "string" ? keys[0] : "analysis";
}

export const createDemandSecure = onCall({ region: "southamerica-east1" }, async (request) => {
  if (!request.auth) fail("unauthenticated", "Entre para criar uma demanda.");
  const actor = await caller(request.auth.uid);
  const data = request.data as Record<string, unknown>;
  const companyId = String(data.companyId ?? "").trim();
  const title = String(data.title ?? "").trim();
  const description = String(data.description ?? "").trim();
  const screenName = String(data.screenName ?? "").trim();
  const formName = String(data.formName ?? "").trim();
  const levelId = String(data.levelId ?? "").trim();
  const levelName = String(data.levelName ?? "").trim();
  const priority = String(data.priority ?? "normal");
  const requesterSector = String(data.requesterSector ?? "").trim();
  if (!companyId || !title || !description || !screenName || !formName || !levelId || !levelName) {
    fail("invalid-argument", "Preencha todos os campos obrigatórios da demanda.");
  }
  if (!["low", "normal", "high", "urgent"].includes(priority)) fail("invalid-argument", "Prioridade inválida.");
  if (!demandAccess(actor, companyId) || (actor.role === "consultant" && !has(actor, "createDemand"))) {
    fail("permission-denied", "Você não pode criar demandas para esta empresa.");
  }

  const companyRef = db.doc(`companies/${companyId}`);
  const initialStatuses = await db.collection("demandStatuses").where("active", "==", true).where("isInitial", "==", true).limit(2).get();
  if (initialStatuses.size !== 1) fail("failed-precondition", "Configure exatamente um status inicial ativo.");
  const initial = initialStatuses.docs[0];
  const demandRef = db.collection("demands").doc();
  const historyRef = demandRef.collection("history").doc();
  let code = "";
  await db.runTransaction(async (transaction) => {
    const [companySnapshot, counterSnapshot] = await Promise.all([
      transaction.get(companyRef),
      transaction.get(db.doc("counters/demands")),
    ]);
    if (!companySnapshot.exists || companySnapshot.data()?.active !== true) {
      fail("failed-precondition", "A empresa selecionada não está ativa.");
    }
    const sequence = Number(counterSnapshot.data()?.sequence ?? 0) + 1;
    const year = new Date().getFullYear();
    code = `DEM-${year}-${String(sequence).padStart(6, "0")}`;
    const status = initial.data();
    transaction.set(db.doc("counters/demands"), { sequence, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(demandRef, {
      id: demandRef.id, code, sequence, year, title, description,
      companyId, companyName: companySnapshot.data()?.legalName ?? "Empresa",
      requesterId: request.auth!.uid, requesterName: actor.name, requesterSector,
      screenName, screenNameNormalized: screenName.toLocaleLowerCase("pt-BR"),
      formName, formNameNormalized: formName.toLocaleLowerCase("pt-BR"),
      levelId, levelName, priority,
      status: legacyStatus(status), statusId: initial.id, statusName: status.name,
      statusColor: status.color, statusUpdatedAt: FieldValue.serverTimestamp(),
      statusHistoryId: historyRef.id, consultantId: null, consultantName: null,
      createdBy: request.auth!.uid, updatedBy: request.auth!.uid,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      lastActivityAt: FieldValue.serverTimestamp(), schemaVersion: 2,
    });
    transaction.set(historyRef, {
      type: "status", statusId: initial.id, statusName: status.name,
      observation: "Demanda registrada.", authorId: request.auth!.uid,
      authorName: actor.name, createdAt: FieldValue.serverTimestamp(),
    });
  });
  await writeAudit({ action: "DEMAND_CREATED", entityType: "demand", entityId: demandRef.id, actorId: request.auth.uid, actor, companyId, after: { code } });
  return { demandId: demandRef.id, code };
});

export const mutateDemandSecure = onCall({ region: "southamerica-east1" }, async (request) => {
  if (!request.auth) fail("unauthenticated", "Entre para atualizar uma demanda.");
  const actor = await caller(request.auth.uid);
  const input = request.data as Record<string, unknown>;
  const demandId = String(input.demandId ?? "");
  const action = String(input.action ?? "");
  const demandRef = db.doc(`demands/${demandId}`);
  const snapshot = await demandRef.get();
  if (!snapshot.exists) fail("not-found", "Demanda não encontrada.");
  const demand = snapshot.data() as Record<string, unknown>;
  const companyId = String(demand.companyId ?? "");
  if (!demandAccess(actor, companyId)) fail("permission-denied", "Você não possui acesso a esta demanda.");
  const assigned = demand.consultantId === request.auth.uid;

  if (action === "accept") {
    if (actor.role !== "consultant" || !has(actor, "takeUnassignedDemand") || demand.consultantId) fail("permission-denied", "Você não pode assumir esta demanda.");
    const workflowStatusIds = Array.isArray(input.workflowStatusIds) ? [...new Set(input.workflowStatusIds.filter((item): item is string => typeof item === "string"))] : [];
    if (!workflowStatusIds.length) fail("invalid-argument", "Selecione ao menos um status.");
    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(demandRef);
      if (current.data()?.consultantId) fail("aborted", "A demanda acabou de ser assumida por outro consultor.");
      transaction.update(demandRef, { consultantId: request.auth!.uid, consultantName: actor.name, workflowStatusIds, updatedBy: request.auth!.uid, updatedAt: FieldValue.serverTimestamp(), lastActivityAt: FieldValue.serverTimestamp() });
      transaction.set(demandRef.collection("history").doc(), { type: "assignment", consultantId: request.auth!.uid, consultantName: actor.name, authorId: request.auth!.uid, authorName: actor.name, createdAt: FieldValue.serverTimestamp() });
    });
    await writeAudit({ action: "DEMAND_ASSIGNED", entityType: "demand", entityId: demandId, actorId: request.auth.uid, actor, companyId, before: { consultantId: null }, after: { consultantId: request.auth.uid } });
    return { ok: true };
  }

  if (action === "workflow") {
    if (actor.role !== "consultant" || !assigned || !has(actor, "editDemand")) fail("permission-denied", "Você não pode configurar as etapas.");
    const workflowStatusIds = Array.isArray(input.workflowStatusIds) ? [...new Set(input.workflowStatusIds.filter((item): item is string => typeof item === "string"))] : [];
    if (!workflowStatusIds.length || (typeof demand.statusId === "string" && !workflowStatusIds.includes(demand.statusId))) fail("invalid-argument", "Mantenha o status atual e selecione ao menos uma etapa.");
    await demandRef.update({ workflowStatusIds, updatedBy: request.auth.uid, updatedAt: FieldValue.serverTimestamp() });
    return { ok: true };
  }

  if (action === "status") {
    if (actor.role !== "consultant" || !assigned || !has(actor, "changeStatus")) fail("permission-denied", "Você não pode alterar o status desta demanda.");
    const statusId = String(input.statusId ?? "");
    const observation = String(input.observation ?? "").trim();
    if (!statusId || !observation) fail("invalid-argument", "Informe o status e a observação.");
    const next = await db.doc(`demandStatuses/${statusId}`).get();
    if (!next.exists || next.data()?.active !== true) fail("failed-precondition", "O status selecionado não está disponível.");
    const current = await db.doc(`demandStatuses/${String(demand.statusId ?? "")}`).get();
    const allowed = current.data()?.allowedNextStatusIds;
    if (Array.isArray(allowed) && allowed.length && !allowed.includes(statusId)) fail("failed-precondition", "Essa transição de status não é permitida.");
    const workflow = Array.isArray(demand.workflowStatusIds) ? demand.workflowStatusIds : [];
    if (workflow.length && !workflow.includes(statusId) && next.data()?.finalType !== "cancelled") fail("failed-precondition", "Esse status não foi habilitado para esta demanda.");
    const nextData = next.data()!;
    const patch: Record<string, unknown> = {
      status: legacyStatus(nextData), statusId, statusName: nextData.name, statusColor: nextData.color,
      statusUpdatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid,
      updatedAt: FieldValue.serverTimestamp(), lastActivityAt: FieldValue.serverTimestamp(),
    };
    if (nextData.isPaused) { patch.pausedAt = FieldValue.serverTimestamp(); patch.pauseReason = observation; }
    if (nextData.finalType === "completed") { patch.completedAt = FieldValue.serverTimestamp(); patch.completedBy = request.auth.uid; }
    if (nextData.finalType === "cancelled") patch.cancelledAt = FieldValue.serverTimestamp();
    await db.runTransaction(async (transaction) => {
      const historyRef = demandRef.collection("history").doc();
      transaction.update(demandRef, { ...patch, statusHistoryId: historyRef.id });
      transaction.set(historyRef, { type: "status", statusId, statusName: nextData.name, observation, authorId: request.auth!.uid, authorName: actor.name, createdAt: FieldValue.serverTimestamp() });
    });
    await writeAudit({ action: nextData.finalType === "cancelled" ? "DEMAND_CANCELLED" : "DEMAND_STATUS_CHANGED", entityType: "demand", entityId: demandId, actorId: request.auth.uid, actor, companyId, before: { statusId: demand.statusId }, after: { statusId } });
    return { ok: true };
  }

  if (action === "note") {
    const internal = input.internal === true;
    const text = String(input.text ?? "").trim();
    if (!text) fail("invalid-argument", "Informe a observação.");
    if (internal && (actor.role !== "consultant" || !assigned || !has(actor, "addInternalNote"))) fail("permission-denied", "Você não pode criar uma nota interna.");
    if (!internal && actor.role === "consultant" && (!assigned || !has(actor, "addPublicNote"))) fail("permission-denied", "Você não pode criar uma nota pública.");
    await demandRef.collection(internal ? "internalNotes" : "publicNotes").add({ text, authorId: request.auth.uid, authorName: actor.name, authorRole: actor.role, createdAt: FieldValue.serverTimestamp(), edited: false });
    return { ok: true };
  }
  fail("invalid-argument", "Ação de demanda inválida.");
});

export const reviewConsultantCompanyRequest = onCall({ region: "southamerica-east1" }, async (request) => {
  if (!request.auth) fail("unauthenticated", "Entre para revisar solicitações.");
  const actor = await caller(request.auth.uid);
  if (actor.role !== "admin") fail("permission-denied", "Apenas administradores podem revisar solicitações.");
  const requestId = String(request.data?.requestId ?? "");
  const decision = String(request.data?.decision ?? "");
  const rejectionReason = String(request.data?.rejectionReason ?? "").trim();
  if (!requestId || !["approved", "rejected"].includes(decision)) fail("invalid-argument", "Revisão inválida.");
  const requestRef = db.doc(`consultantCompanyRequests/${requestId}`);
  await db.runTransaction(async (transaction) => {
    const link = await transaction.get(requestRef);
    if (!link.exists || link.data()?.status !== "pending") fail("failed-precondition", "Esta solicitação já foi revisada ou não existe.");
    const data = link.data()!;
    const userRef = db.doc(`users/${data.consultantId}`);
    if (decision === "approved") transaction.update(userRef, { companyIds: FieldValue.arrayUnion(data.companyId), updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth!.uid });
    transaction.update(requestRef, { status: decision, reviewedAt: FieldValue.serverTimestamp(), reviewedBy: request.auth!.uid, reviewedByName: actor.name, rejectionReason: decision === "rejected" ? (rejectionReason || "Solicitação não aprovada.") : null });
  });
  await writeAudit({ action: decision === "approved" ? "CONSULTANT_COMPANY_APPROVED" : "CONSULTANT_COMPANY_REJECTED", entityType: "consultantCompanyRequest", entityId: requestId, actorId: request.auth.uid, actor });
  return { ok: true };
});

/** Server-side audit for administrative writes that are still made directly by admins. */
export const auditAdministrativeWrite = onDocumentWritten(
  { region: "southamerica-east1", document: "{collectionId}/{documentId}" },
  async (event) => {
    const collectionId = event.params.collectionId;
    if (!["users", "companies", "consultantCompanyRequests"].includes(collectionId)) return;
    const before = event.data?.before;
    const after = event.data?.after;
    const data = after?.exists ? after.data() : before?.data();
    if (!data) return;
    const action = !before?.exists ? "CREATED" : !after?.exists ? "DELETED" : "UPDATED";
    await db.collection("auditLogs").add({
      action: `${collectionId.toUpperCase()}_${action}`,
      entityType: collectionId,
      entityId: event.params.documentId,
      companyId: data.companyId ?? null,
      before: before?.exists ? before.data() : null,
      after: after?.exists ? after.data() : null,
      userId: data.updatedBy ?? data.uid ?? "system",
      userName: data.updatedByName ?? data.name ?? "Sistema",
      userRole: "server",
      createdAt: FieldValue.serverTimestamp(),
    });
  },
);
