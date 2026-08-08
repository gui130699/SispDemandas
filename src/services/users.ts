import {
  createUserWithEmailAndPassword,
  deleteUser,
  sendPasswordResetEmail,
  updateProfile,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { auth, db, secondaryAuth } from "../lib/firebase";
import { functions } from "../lib/firebase";
import { httpsCallable } from "firebase/functions";
import type { Role, UserProfile } from "../types/models";
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
    defaultSector: defaultSector ?? user.defaultSector ?? "", updatedAt: serverTimestamp(), updatedBy: admin.uid,
  });
  batch.set(doc(db, "notifications", `${user.uid}_${Date.now()}`), { userId: user.uid, title: "Cadastro aprovado", message: "Seu acesso ao SISPDEMANDAS foi liberado.", read: false, createdAt: serverTimestamp() });
  await batch.commit();
  await audit(admin, "approve", "user", user.uid, user.companyId, { registrationStatus: "pending" }, { registrationStatus: "approved" });
}

export async function rejectRegistration(user: UserProfile, admin: UserProfile, reason: string) {
  await updateDoc(doc(db, "users", user.uid), { active: false, registrationStatus: "rejected", rejectionReason: reason.trim() || "Cadastro não aprovado.", updatedAt: serverTimestamp(), updatedBy: admin.uid });
  await audit(admin, "reject", "user", user.uid, user.companyId, undefined, { reason });
}

export async function updateConsultantAccess(user: UserProfile, admin: UserProfile, companyIds: string[], permissions: NonNullable<UserProfile["permissions"]>) {
  await updateDoc(doc(db, "users", user.uid), { companyIds: [...new Set(companyIds)], permissions, updatedAt: serverTimestamp(), updatedBy: admin.uid });
  await audit(admin, "update_access", "user", user.uid, undefined, undefined, { companyIds, permissions });
}

export async function setUserActive(
  user: UserProfile,
  active: boolean,
  admin: UserProfile,
) {
  await updateDoc(doc(db, "users", user.uid), {
    active,
    updatedAt: serverTimestamp(),
    updatedBy: admin.uid,
  });
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

export async function deleteManagedUser(user: UserProfile, admin: UserProfile) {
  if (user.uid === admin.uid) throw new Error("Você não pode excluir sua própria conta.");
  const remove = httpsCallable<{ uid: string }, { deleted: true }>(functions, "deleteManagedUser");
  await remove({ uid: user.uid });
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
