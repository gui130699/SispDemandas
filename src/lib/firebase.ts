import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getFunctions } from 'firebase/functions'
export const firebaseConfig = { apiKey: 'AIzaSyA8GkfsgB6GwMZbAi30YKUutC8vfU5BZ9A', authDomain: 'sispdemandas.firebaseapp.com', projectId: 'sispdemandas', storageBucket: 'sispdemandas.firebasestorage.app', messagingSenderId: '1059379643571', appId: '1:1059379643571:web:62193e978e19b0139c1cc6' }
export const app = initializeApp(firebaseConfig); export const auth = getAuth(app); export const db = getFirestore(app); export const storage = getStorage(app); export const functions = getFunctions(app, 'southamerica-east1')
export async function secondaryAuth(): Promise<{ app: FirebaseApp; auth: Auth; close: () => Promise<void> }> { const secondary = initializeApp(firebaseConfig, `user-creator-${crypto.randomUUID()}`); return { app: secondary, auth: getAuth(secondary), close: () => deleteApp(secondary) } }
