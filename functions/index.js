import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

initializeApp();

const database = getFirestore();

export const deleteManagedUser = onCall(
  { region: "southamerica-east1" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Autenticação obrigatória.");
    const targetUid = request.data?.uid;
    if (typeof targetUid !== "string" || !targetUid) throw new HttpsError("invalid-argument", "Usuário inválido.");
    if (targetUid === request.auth.uid) throw new HttpsError("failed-precondition", "Você não pode excluir sua própria conta.");

    const actor = await database.doc(`users/${request.auth.uid}`).get();
    if (!actor.exists || actor.data()?.role !== "admin" || actor.data()?.active !== true) {
      throw new HttpsError("permission-denied", "Ação exclusiva de administradores ativos.");
    }

    const target = await database.doc(`users/${targetUid}`).get();
    if (!target.exists) throw new HttpsError("not-found", "Usuário não encontrado.");

    try {
      await getAuth().deleteUser(targetUid);
    } catch (error) {
      if (error?.code !== "auth/user-not-found") throw error;
    }

    const batch = database.batch();
    batch.delete(target.ref);
    batch.set(database.collection("auditLogs").doc(), {
      action: "delete",
      entity: "user",
      entityId: targetUid,
      actorId: request.auth.uid,
      actorName: actor.data()?.name ?? "Administrador",
      before: { email: target.data()?.email, role: target.data()?.role },
      createdAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
    return { deleted: true };
  },
);
