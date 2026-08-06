import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { onAuthStateChanged, signOut, type User } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../../lib/firebase'
import type { UserProfile } from '../../types/models'
type AuthState={user:User|null;profile:UserProfile|null;loading:boolean;logout:()=>Promise<void>}
const Context=createContext<AuthState>({user:null,profile:null,loading:true,logout:async()=>{}})
export function AuthProvider({children}:{children:ReactNode}) { const [user,setUser]=useState<User|null>(null); const [profile,setProfile]=useState<UserProfile|null>(null); const [loading,setLoading]=useState(true); useEffect(()=>{ let stopProfile:(()=>void)|undefined; const stopAuth=onAuthStateChanged(auth,(current)=>{setUser(current);stopProfile?.();if(!current){setProfile(null);setLoading(false);return} stopProfile=onSnapshot(doc(db,'users',current.uid),(snapshot)=>{setProfile(snapshot.exists()?({uid:current.uid,...snapshot.data()} as UserProfile):null);setLoading(false)})});return()=>{stopAuth();stopProfile?.()} },[]);return <Context.Provider value={{user,profile,loading,logout:()=>signOut(auth)}}>{children}</Context.Provider> }
export const useAuth=()=>useContext(Context)
