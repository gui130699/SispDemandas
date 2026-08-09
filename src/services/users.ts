import {
  createUserWithEmailAndPassword,
  deleteUser,
  sendPasswordResetEmail,
  updateProfile,
} from "firebase/auth";
import { arrayUnion, doc, runTransaction, serverTimestamp, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { auth, db, secondaryAuth } from "../lib/firebase";
import { defaultConsultantPermissions, type Company, type Role, type UserProfile } from "../types/models";
import { audit } from "./audit";

export interface CreateUserInput {
  name: string;
  email: string;
  role: Role;
  companyId: string | null;
  companyName: string | null;
  companyIds?: string[];
}

export async function createManagedUser(
  input: CreateUserInput,
  admin: UserProfile,
) {
  const email = input.email.trim().toLowerCase();
  const instance = await secondaryAuth();
  let createdUser:
    Awaited<ReturnType<typeof createUserWithEmailAndPassword>>["user"] | null =
    null;

  try {
    const credential = await createUserWithEmailAndPassword(
      instance.auth,
      email,
      `${crypto.randomUUID()}Aa1!`,
    );
    createdUser = credential.user;
    await updateProfile(createdUser, { displayName: input.name.trim() });
    await setDoc(doc(db, "users", createdUser.uid), {
      uid: createdUser.uid,
      name: input.name.trim(),
      email,
      emailNormalized: email,
      role: input.role,
      companyId: input.companyId,
      companyName: input.companyName,
      companyIds: input.role === "consultant" ? input.companyIds ?? [] : [],
      requestedCompanyIds: [],
      permissions: input.role === "consultant" ? defaultConsultantPermissions : {},
      active: true,
      registrationStatus: "approved",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: admin.uid,
    });
    await audit(
      admin,
      "create",
      "user",
      createdUser.uid,
      input.companyId,
      undefined,
      {
        name: input.name.trim(),
        email,
        role: input.role,
        companyId: input.companyId,
      },
    );
  } catch (error) {
    if (createdUser) {
      try {
        await deleteUser(createdUser);
      } catch {
        // O Firebase pode impedir a reversão somente em falhas externas posteriores.
      }
    }
    throw error;
  } finally {
    await instance.close();
  }

  await sendPasswordResetEmail(auth, email);
  return createdUser.uid;
}

export async function approveRegistration(user: UserProfile, admin: UserProfile, companyIds?: string[], defaultSector?: string) {
  const cleanCompanyIds = [...new Set(companyIds ?? user.requestedCompanyIds ?? user.companyIds ?? [])];
  if (user.role === "requester" && !user.companyId) throw new Error("Cliente sem empresa vinculada.");
  const batch = writeBatch(db);
  batch.update(doc(db, "users", user.uid), {
    active: true, registrationStatus: "approved", rejectionReason: null,
    companyIds: user.role === "consultant" ? cleanCompanyIds : [],
    permissions: user.role === "consultant" ? { ...defaultConsultantPermissions, ...user.permissions } : {},
    defaultSector: defaultSector ?? user.defaultSector ?? "", updatedAt: serverTimestamp(), updatedBy: admin.uid,
    approvedAt: serverTimestamp(), approvedBy: admin.uid, approvedByName: admin.name,
  });
  batch.set(doc(db, "notifications", `${user.uid}_${Date.now()}`), { userId: user.uid, title: "Cadastro aprovado", message: "Seu acesso ao SISPDEMANDAS foi liberado.", read: false, createdAt: serverTimestamp() });
  if (user.role === "consultant") {
    cleanCompanyIds.forEach((companyId) => batch.set(doc(db, "companyAccess", `${companyId}_${user.uid}`), {
      id: `${companyId}_${user.uid}`, companyId, companyName: "", userId: user.uid, userName: user.name,
      consultantAccess: true, projectManagerAccess: false, active: true,
      grantedAt: serverTimestamp(), grantedBy: admin.uid, grantedByName: admin.name, updatedAt: serverTimestamp(),
    }, { merge: true }));
  }
  await batch.commit();
  await audit(admin, "approve", "user", user.uid, user.companyId, { registrationStatus: "pending" }, { registrationStatus: "approved" });
}

export async function rejectRegistration(user: UserProfile, admin: UserProfile, reason: string) {
  await updateDoc(doc(db, "users", user.uid), { active: false, registrationStatus: "rejected", rejectionReason: reason.trim() || "Cadastro não aprovado.", updatedAt: serverTimestamp(), updatedBy: admin.uid, rejectedAt: serverTimestamp(), rejectedBy: admin.uid, rejectedByName: admin.name });
  await audit(admin, "reject", "user", user.uid, user.companyId, undefined, { reason });
}

export async function updateConsultantAccess(user: UserProfile, admin: UserProfile, companyIds: string[], permissions: NonNullable<UserProfile["permissions"]>) {
  const cleanCompanyIds = [...new Set(companyIds)];
  const batch = writeBatch(db);
  batch.update(doc(db, "users", user.uid), { companyIds: cleanCompanyIds, permissions, updatedAt: serverTimestamp(), updatedBy: admin.uid });
  [...new Set([...(user.companyIds ?? []), ...cleanCompanyIds])].forEach((companyId) => batch.set(doc(db, "companyAccess", `${companyId}_${user.uid}`), {
    id: `${companyId}_${user.uid}`, companyId, companyName: "", userId: user.uid, userName: user.name,
    consultantAccess: cleanCompanyIds.includes(companyId), active: cleanCompanyIds.includes(companyId) && user.active,
    projectManagerAccess: user.projectManagerCompanyIds?.includes(companyId) ?? false,
    updatedAt: serverTimestamp(),
  }, { merge: true }));
  await batch.commit();
  await audit(admin, "update_access", "user", user.uid, undefined, undefined, { companyIds, permissions });
}

export async function setUserActive(
  user: UserProfile,
  active: boolean,
  admin: UserProfile,
) {
  const batch = writeBatch(db);
  batch.update(doc(db, "users", user.uid), {
    active,
    updatedAt: serverTimestamp(),
    updatedBy: admin.uid,
  });
  if (user.role === "consultant") {
    (user.companyIds ?? []).forEach((companyId) => batch.set(doc(db, "companyAccess", `${companyId}_${user.uid}`), {
      id: `${companyId}_${user.uid}`,
      companyId,
      companyName: "",
      userId: user.uid,
      userName: user.name,
      consultantAccess: true,
      projectManagerAccess: user.projectManagerCompanyIds?.includes(companyId) ?? false,
      active,
      updatedAt: serverTimestamp(),
    }, { merge: true }));
  }
  await batch.commit();
  await audit(
    admin,
    active ? "activate" : "deactivate",
    "user",
    user.uid,
    user.companyId,
    { active: user.active },
    { active },
  );
}

export const resendPasswordSetup = (email: string) =>
  sendPasswordResetEmail(auth, email.trim().toLowerCase());

export async function requestConsultantCompanyAccess(consultant: UserProfile, company: Company) {
  if (consultant.role !== "consultant") {
    throw new Error("Apenas consultores podem solicitar empresas.");
  }
  const id = `${consultant.uid}_${company.id}`;
  await setDoc(doc(db, "consultantCompanyRequests", id), {
    id, consultantId: consultant.uid, consultantName: consultant.name,
    companyId: company.id, companyName: company.legalName, status: "pending",
    requestedAt: serverTimestamp(),
  });
}

export async function reviewConsultantCompanyAccess(requestId: string, decision: "approved" | "rejected", admin: UserProfile, rejectionReason?: string) {
  if (admin.role !== "admin") throw new Error("Apenas administradores podem revisar solicitações.");
  const requestRef = doc(db, "consultantCompanyRequests", requestId);
  await runTransaction(db, async (transaction) => {
    const requestSnapshot = await transaction.get(requestRef);
    if (!requestSnapshot.exists() || requestSnapshot.data().status !== "pending") throw new Error("Esta solicitação já foi revisada.");
    const request = requestSnapshot.data();
    const userRef = doc(db, "users", request.consultantId);
    const companyRef = doc(db, "companies", request.companyId);
    const [userSnapshot, companySnapshot] = await Promise.all([transaction.get(userRef), transaction.get(companyRef)]);
    if (!userSnapshot.exists() || userSnapshot.data().role !== "consultant") throw new Error("Consultor não encontrado.");
    if (!companySnapshot.exists() || companySnapshot.data().active !== true) throw new Error("Empresa indisponível.");
    if (decision === "approved") {
      transaction.update(userRef, { companyIds: arrayUnion(request.companyId), updatedAt: serverTimestamp(), updatedBy: admin.uid });
      transaction.set(doc(db, "companyAccess", `${request.companyId}_${request.consultantId}`), {
        id: `${request.companyId}_${request.consultantId}`, companyId: request.companyId, companyName: request.companyName,
        userId: request.consultantId, userName: request.consultantName, consultantAccess: true,
        projectManagerAccess: false, active: true, grantedAt: serverTimestamp(), grantedBy: admin.uid,
        grantedByName: admin.name, updatedAt: serverTimestamp(),
      }, { merge: true });
    }
    transaction.update(requestRef, {
      status: decision,
      reviewedAt: serverTimestamp(),
      reviewedBy: admin.uid,
      reviewedByName: admin.name,
      rejectionReason: decision === "rejected" ? rejectionReason?.trim() || "Solicitação não aprovada." : null,
    });
  });
}

export function userCreationError(error: unknown) {
  const code =
    typeof error === "object" && error && "code" in error
      ? String(error.code)
      : "";
  if (code.includes("email-already-in-use"))
    return "Já existe um usuário com este e-mail.";
  if (code.includes("invalid-email")) return "Informe um e-mail válido.";
  if (code.includes("operation-not-allowed"))
    return "Ative o provedor E-mail/Senha no Firebase Authentication.";
  if (code.includes("permission-denied"))
    return "Você não tem permissão para cadastrar usuários.";
  if (code.includes("network-request-failed"))
    return "Falha de conexão. Verifique a internet e tente novamente.";
  return "Não foi possível cadastrar o usuário. Tente novamente.";
}
