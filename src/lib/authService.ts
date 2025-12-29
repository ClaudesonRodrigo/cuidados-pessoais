// src/lib/authService.ts
import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { auth, db } from "./firebaseClient";
import { doc, getDoc, setDoc, serverTimestamp, collection, addDoc, updateDoc, Timestamp } from "firebase/firestore";

// Helper para criar slug amigável (ex: barbearia-do-carioca-a1b2)
const generateSlug = (name: string | null) => {
    const base = name ? name.toLowerCase().replace(/[^a-z0-9]/g, '-') : 'barbearia';
    const random = Math.random().toString(36).substring(2, 6);
    return `${base}-${random}`;
};

export const signInWithGoogle = async (role: 'owner' | 'customer' = 'owner') => {
  try {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    // 1. Verifica se o usuário já existe
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      // --- USUÁRIO NOVO (O Pulo do Gato) ---
      
      let pageSlug = null;
      let plan = role === 'owner' ? 'pro' : null; // Começa como PRO (Trial)
      let trialDeadline = null;

      // Se for Dono, configura os 7 dias grátis e cria a página
      if (role === 'owner') {
          // Calcula data de hoje + 7 dias
          const nextWeek = new Date();
          nextWeek.setDate(nextWeek.getDate() + 7); 
          trialDeadline = Timestamp.fromDate(nextWeek);

          // Gera o link da barbearia (Slug)
          pageSlug = generateSlug(user.displayName);

          // CRIA A PÁGINA IMEDIATAMENTE (Para evitar erro de "Não salva perfil")
          const pageRef = doc(db, "pages", pageSlug);
          await setDoc(pageRef, {
              userId: user.uid,
              slug: pageSlug,
              title: user.displayName || "Minha Barbearia",
              bio: "Agende seu horário com a gente!",
              links: [], // Começa sem serviços
              createdAt: serverTimestamp(),
              plan: 'pro', // Página nasce Pro
              trialDeadline: trialDeadline, // Com data de validade
              isOpen: true
          });
      }

      // Salva os dados do Usuário vinculado à página criada
      await setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        role: role,
        plan: plan,
        trialDeadline: trialDeadline,
        pageSlug: pageSlug, // Salva o link aqui também
        createdAt: serverTimestamp(),
      });

    } else {
        // --- USUÁRIO EXISTENTE ---
        // Se o usuário já existe mas por algum erro não tem página (casos antigos)
        // Podemos tentar corrigir aqui ou deixar o admin resolver. 
        // Por segurança, mantemos como está para não sobrescrever dados.
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