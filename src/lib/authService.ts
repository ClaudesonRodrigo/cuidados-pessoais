// src/lib/authService.ts
import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebaseClient";

const generateSlug = (name: string | null) => {
    const base = name ? name.toLowerCase().replace(/[^a-z0-9]/g, '-') : 'salao';
    const random = Math.random().toString(36).substring(2, 6);
    return `${base}-${random}`;
};

export const signInWithGoogle = async (role: 'owner' | 'customer' = 'owner') => {
  try {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    const existingUser = await getDoc(doc(db, "users", user.uid));
    const existingData = existingUser.exists() ? existingUser.data() : null;
    const existingOwnerSlug =
      existingData?.role === 'owner' && typeof existingData.pageSlug === 'string'
        ? existingData.pageSlug
        : null;
    const body = role === 'owner'
      ? {
          accountType: 'owner',
          slug: existingOwnerSlug || generateSlug(user.displayName),
          title: user.displayName || "Meu Salão BeautyPro",
          ...(user.displayName ? { displayName: user.displayName } : {}),
          ...(user.photoURL ? { photoURL: user.photoURL } : {}),
        }
      : {
          accountType: 'customer',
          ...(user.displayName ? { displayName: user.displayName } : {}),
          ...(user.photoURL ? { photoURL: user.photoURL } : {}),
        };
    const response = await fetch('/api/onboarding', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await user.getIdToken()}`,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    if (!response.ok) {
      throw new Error("Não foi possível concluir o onboarding.");
    }

    return user;
  } catch (error) {
    console.error("Erro no login Google:", error);
    throw error;
  }
};

export const signOutUser = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Erro ao sair:", error);
  }
};
