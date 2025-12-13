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
  serverTimestamp 
} from "firebase/firestore";
import { auth, db } from "./firebaseClient";

// Função para gerar Slug a partir do nome
const generateSlug = (name: string) => {
  return name
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .replace(/[^a-z0-9]/g, "-") // Troca espaços/símbolos por traço
    .replace(/-+/g, "-") // Remove traços duplicados
    .replace(/^-|-$/g, "") // Remove traços no início/fim
    + "-" + Math.floor(Math.random() * 1000); // Adiciona número aleatório para garantir unicidade
};

export const signInWithGoogle = async () => {
  try {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    // Verifica se o usuário já existe no Firestore
    const userDocRef = doc(db, "users", user.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (!userDocSnap.exists()) {
      // --- USUÁRIO NOVO: CRIA TUDO AGORA ---
      
      const newSlug = generateSlug(user.displayName || "restaurante");

      // 1. Cria o documento do Usuário
      await setDoc(userDocRef, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        pageSlug: newSlug,
        plan: 'free', // Começa como Free
        role: 'user',
        createdAt: serverTimestamp(),
      });

      // 2. CRIA O CARDÁPIO (PÁGINA) AUTOMATICAMENTE
      // Isso evita o erro 404 na página pública!
      const pageDocRef = doc(db, "pages", newSlug);
      await setDoc(pageDocRef, {
        userId: user.uid,
        slug: newSlug,
        title: user.displayName || "Meu Restaurante",
        bio: "Bem-vindo ao nosso cardápio digital!",
        links: [], // Começa vazio
        theme: "light",
        createdAt: serverTimestamp(),
        isOpen: true // Já nasce aberto
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