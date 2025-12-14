// src/lib/authService.ts
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  User 
} from "firebase/auth";
import { 
  doc, 
  getDoc, 
  setDoc, 
  serverTimestamp,
  Timestamp 
} from "firebase/firestore";
import { auth, db } from "./firebaseClient";

// Função para gerar Slug
const generateSlug = (name: string) => {
  return name
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    + "-" + Math.floor(Math.random() * 1000);
};

export const signInWithGoogle = async () => {
  try {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    const userDocRef = doc(db, "users", user.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (!userDocSnap.exists()) {
      // --- USUÁRIO NOVO: COMEÇA COM 7 DIAS DE PRO ---
      
      const newSlug = generateSlug(user.displayName || "restaurante");
      
      // Calcula a data de expiração (Hoje + 7 dias)
      const trialDate = new Date();
      trialDate.setDate(trialDate.getDate() + 7);
      const trialTimestamp = Timestamp.fromDate(trialDate);

      // 1. Cria o Usuário PRO (Trial)
      await setDoc(userDocRef, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        pageSlug: newSlug,
        plan: 'pro', // Começa PRO!
        trialDeadline: trialTimestamp, // Data que acaba a mamata
        role: 'user',
        createdAt: serverTimestamp(),
      });

      // 2. Cria o Cardápio PRO (Trial)
      const pageDocRef = doc(db, "pages", newSlug);
      await setDoc(pageDocRef, {
        userId: user.uid,
        slug: newSlug,
        title: user.displayName || "Meu Restaurante",
        bio: "Bem-vindo ao nosso cardápio digital!",
        links: [],
        theme: "light",
        plan: 'pro', // Começa PRO!
        trialDeadline: trialTimestamp, // Data que acaba
        createdAt: serverTimestamp(),
        isOpen: true
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

export const observeAuthState = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback);
};