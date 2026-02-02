// src/lib/authService.ts
import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { auth, db } from "./firebaseClient";
import { doc, getDoc, setDoc, serverTimestamp, Timestamp } from "firebase/firestore";

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

    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      let pageSlug = null;
      let plan = role === 'owner' ? 'pro' : null;
      let trialDeadline = null;

      if (role === 'owner') {
          const nextWeek = new Date();
          nextWeek.setDate(nextWeek.getDate() + 7); 
          trialDeadline = Timestamp.fromDate(nextWeek);
          pageSlug = generateSlug(user.displayName);

          const pageRef = doc(db, "pages", pageSlug);
          await setDoc(pageRef, {
              userId: user.uid,
              slug: pageSlug,
              title: user.displayName || "Meu Salão BeautyPro",
              bio: "Agende seu horário e realce sua beleza!",
              links: [],
              createdAt: serverTimestamp(),
              plan: 'pro',
              trialDeadline: trialDeadline,
              isOpen: true
          });
      }

      await setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        role: role,
        plan: plan,
        trialDeadline: trialDeadline,
        pageSlug: pageSlug,
        createdAt: serverTimestamp(),
      });
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