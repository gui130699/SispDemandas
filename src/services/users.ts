import {
  createUserWithEmailAndPassword,
  deleteUser,
  sendPasswordResetEmail,
  updateProfile,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { auth, db, secondaryAuth } from "../lib/firebase";
import type { Role, UserProfile } from "../types/models";
import { audit } from "./audit";

export interface CreateUserInput {
  name: string;
  email: string;
  role: Role;
  companyId: string | null;
  companyName: string | null;
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
      active: true,
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
