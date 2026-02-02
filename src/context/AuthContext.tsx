// src/context/AuthContext.tsx
'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebaseClient';

interface AuthContextType {
  user: User | null;
  userData: any | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userData: null,
  loading: true,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  // Seu UID de Super Admin
  const SUPER_ADMIN_UID = "HYyAPj9xDEYKPTymoRdklZxxXR33";

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      if (firebaseUser) {
        setUser(firebaseUser);
        const userRef = doc(db, "users", firebaseUser.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          setUserData(userSnap.data());
        } else {
          // LÓGICA DE AUTO-CRIAÇÃO: Se for você (Super Admin), cria o documento se não existir
          if (firebaseUser.uid === SUPER_ADMIN_UID) {
            console.log("Sábio detectado! Criando perfil de Super Admin no Firestore...");
            const newAdminData = {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: firebaseUser.displayName || "Sábio dos 6 Caninos",
              photoURL: firebaseUser.photoURL,
              role: 'owner',
              plan: 'pro',
              createdAt: serverTimestamp(),
              isSuperAdmin: true
            };
            await setDoc(userRef, newAdminData);
            setUserData(newAdminData);
          } else {
            console.warn(`Documento do usuário não encontrado no Firestore para UID: ${firebaseUser.uid}`);
            setUserData(null);
          }
        }
      } else {
        setUser(null);
        setUserData(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, userData, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);