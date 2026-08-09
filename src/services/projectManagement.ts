import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { Company, CompanyAccess, Demand, ProjectManagerRequest, UserProfile } from "../types/models";

export async function requestProjectManagerAccess(consultant: UserProfile, company: Company, reason: string) {
  if (consultant.role !== "consultant") throw new Error("Somente consultores podem solicitar a função de gerente.");
  if (!consultant.companyIds?.includes(company.id)) throw new Error("Você precisa estar vinculado à empresa antes de solicitar a gerência.");
  if (company.projectManagerId === consultant.uid) throw new Error("Você já é gerente desta empresa.");
  if (company.projectManagerId) throw new Error("Esta empresa já possui um gerente de projeto.");
  const ownRequests = await getDocs(query(collection(db, "projectManagerRequests"), where("consultantId", "==", consultant.uid)));
  const pending = ownRequests.docs.some((item) => item.data().companyId === company.id && item.data().status === "pending");
  if (pending) throw new Error("Já existe uma solicitação pendente para esta empresa.");
  const ref = doc(collection(db, "projectManagerRequests"));
  await setDoc(ref, {
    id: ref.id,
    consultantId: consultant.uid,
    consultantName: consultant.name,
    consultantEmail: consultant.email,
    companyId: company.id,
    companyName: company.legalName,
    reason: reason.trim(),
    status: "pending",
    requestedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function approveProjectManagerRequest(request: ProjectManagerRequest, admin: UserProfile) {
  if (admin.role !== "admin") throw new Error("Apenas administradores podem aprovar gerentes.");
  const linkedUsers = await getDocs(query(collection(db, "users"), where("companyIds", "array-contains", request.companyId)));
  const requestRef = doc(db, "projectManagerRequests", request.id);
  const companyRef = doc(db, "companies", request.companyId);
  const consultantRef = doc(db, "users", request.consultantId);
  const notificationRef = doc(db, "notifications", `${request.consultantId}_${Date.now()}`);
  await runTransaction(db, async (transaction) => {
    const [requestSnapshot, companySnapshot, consultantSnapshot] = await Promise.all([
      transaction.get(requestRef),
      transaction.get(companyRef),
      transaction.get(consultantRef),
    ]);
    if (!requestSnapshot.exists() || requestSnapshot.data().status !== "pending") throw new Error("Esta solicitação já foi revisada.");
    if (!companySnapshot.exists() || companySnapshot.data().active !== true) throw new Error("A empresa não está ativa.");
    const currentManagerId = companySnapshot.data().projectManagerId;
    if (currentManagerId && currentManagerId !== request.consultantId) throw new Error("Esta empresa já possui um gerente de projeto.");
    if (!consultantSnapshot.exists() || consultantSnapshot.data().role !== "consultant" || consultantSnapshot.data().active !== true || !consultantSnapshot.data().companyIds?.includes(request.companyId)) throw new Error("O consultor não possui vínculo ativo com esta empresa.");

    transaction.update(companyRef, {
      projectManagerId: request.consultantId,
      projectManagerName: request.consultantName,
      projectManagerAssignedAt: serverTimestamp(),
      projectManagerAssignedBy: admin.uid,
      updatedAt: serverTimestamp(),
    });
    transaction.update(consultantRef, {
      projectManagerCompanyIds: arrayUnion(request.companyId),
      updatedAt: serverTimestamp(),
      updatedBy: admin.uid,
    });
    transaction.update(requestRef, {
      status: "approved",
      rejectionReason: null,
      reviewedAt: serverTimestamp(),
      reviewedBy: admin.uid,
      reviewedByName: admin.name,
    });
    linkedUsers.docs.forEach((member) => {
      const memberData = member.data() as UserProfile;
      transaction.set(doc(db, "companyAccess", `${request.companyId}_${member.id}`), {
        id: `${request.companyId}_${member.id}`,
        companyId: request.companyId,
        companyName: request.companyName,
        userId: member.id,
        userName: memberData.name,
        consultantAccess: true,
        projectManagerAccess: member.id === request.consultantId,
        active: memberData.active === true,
        grantedAt: serverTimestamp(),
        grantedBy: admin.uid,
        grantedByName: admin.name,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    });
    transaction.set(notificationRef, {
      userId: request.consultantId,
      title: "Gerência de projeto aprovada",
      message: `Você agora é gerente de projeto da empresa ${request.companyName}.`,
      read: false,
      createdAt: serverTimestamp(),
    });
  });
}

export async function rejectProjectManagerRequest(request: ProjectManagerRequest, admin: UserProfile, reason: string) {
  if (admin.role !== "admin") throw new Error("Apenas administradores podem rejeitar solicitações.");
  const cleanReason = reason.trim();
  if (!cleanReason) throw new Error("Informe o motivo da rejeição.");
  const batch = writeBatch(db);
  batch.update(doc(db, "projectManagerRequests", request.id), {
    status: "rejected",
    rejectionReason: cleanReason,
    reviewedAt: serverTimestamp(),
    reviewedBy: admin.uid,
    reviewedByName: admin.name,
  });
  batch.set(doc(db, "notifications", `${request.consultantId}_${Date.now()}`), {
    userId: request.consultantId,
    title: "Solicitação de gerência não aprovada",
    message: `${request.companyName}: ${cleanReason}`,
    read: false,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function removeProjectManager(company: Company, admin: UserProfile) {
  if (admin.role !== "admin") throw new Error("Apenas administradores podem remover gerentes.");
  if (!company.projectManagerId) return;
  const managerId = company.projectManagerId;
  const companyRef = doc(db, "companies", company.id);
  const managerRef = doc(db, "users", managerId);
  await runTransaction(db, async (transaction) => {
    const managerSnapshot = await transaction.get(managerRef);
    transaction.update(companyRef, {
      projectManagerId: null,
      projectManagerName: null,
      projectManagerAssignedAt: null,
      projectManagerAssignedBy: null,
      updatedAt: serverTimestamp(),
    });
    if (managerSnapshot.exists()) {
      transaction.update(managerRef, {
        projectManagerCompanyIds: arrayRemove(company.id),
        updatedAt: serverTimestamp(),
        updatedBy: admin.uid,
      });
    }
    transaction.set(doc(db, "companyAccess", `${company.id}_${managerId}`), {
      id: `${company.id}_${managerId}`,
      companyId: company.id,
      companyName: company.legalName,
      userId: managerId,
      userName: managerSnapshot.exists() ? managerSnapshot.data().name : company.projectManagerName || "Consultor",
      consultantAccess: true,
      projectManagerAccess: false,
      active: managerSnapshot.exists() ? managerSnapshot.data().active === true : false,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  });
}

export async function assignManagedDemand(demand: Demand, manager: UserProfile, member: CompanyAccess | null) {
  if (manager.role !== "consultant" || !manager.projectManagerCompanyIds?.includes(demand.companyId)) throw new Error("Você não gerencia esta empresa.");
  if (member && (member.companyId !== demand.companyId || !member.active || !member.consultantAccess)) throw new Error("Consultor sem vínculo ativo com a empresa.");
  await updateDoc(doc(db, "demands", demand.id), {
    consultantId: member?.userId ?? null,
    consultantName: member?.userName ?? null,
    updatedBy: manager.uid,
    updatedAt: serverTimestamp(),
    lastActivityAt: serverTimestamp(),
  });
}
