// src/lib/authService.ts
import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { auth, db } from "./firebaseClient";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

// Agora aceita um papel (role), padrao é 'owner'
export const signInWithGoogle = async (role: 'owner' | 'customer' = 'owner') => {
  try {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    // Verifica se o usuário já existe no Banco de Dados
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      // SE NÃO EXISTE: Cria com o Role (Papel) especificado na entrada
      await setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        role: role, // 'owner' ou 'customer'
        // Se for dono, começa free. Se for cliente, null.
        plan: role === 'owner' ? 'free' : null, 
        createdAt: serverTimestamp(),
      });
    } else {
        // SE JÁ EXISTE: Não muda o role original. 
        // Isso impede que um dono vire cliente sem querer ou vice-versa.
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