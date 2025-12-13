// src/lib/pageService.ts

import {
  doc, getDoc, updateDoc, arrayUnion, arrayRemove, DocumentData,
  collection, query, where, getDocs
} from "firebase/firestore";
import { db } from "./firebaseClient";

export type LinkData = {
  title: string;
  url?: string;
  type: string; 
  order: number;
  icon?: string;
  clicks?: number;
  price?: string;
  description?: string;
  imageUrl?: string;
  category?: string;
};

export type PageData = {
  title: string;
  bio: string;
  address?: string;
  whatsapp?: string;
  profileImageUrl?: string;
  backgroundImage?: string;
  links: LinkData[];
  theme?: string;
  userId: string;
  slug: string;
  plan?: string;
  isOpen?: boolean; // NOVO: Controla se a loja está aberta ou fechada
};

export type UserData = {
  plan: string;
  pageSlug: string;
  displayName?: string;
  email?: string;
  role?: string;
};

// --- Funções de Leitura ---

export const getPageDataForUser = async (userId: string): Promise<{ slug: string, data: DocumentData } | null> => {
  try {
    const userDocRef = doc(db, "users", userId);
    const userDocSnap = await getDoc(userDocRef);

    if (!userDocSnap.exists()) return null;

    const userData = userDocSnap.data();
    const pageSlug = userData?.pageSlug;
    
    if (!pageSlug) {
      const pagesRef = collection(db, "pages");
      const q = query(pagesRef, where("userId", "==", userId));
      const pagesSnap = await getDocs(q);
      if (!pagesSnap.empty) {
        const pageDoc = pagesSnap.docs[0];
        return { slug: pageDoc.id, data: { ...pageDoc.data(), plan: userData?.plan || 'free' } };
      }
      return null;
    }

    const pageDocRef = doc(db, "pages", pageSlug);
    const pageDocSnap = await getDoc(pageDocRef);

    if (pageDocSnap.exists()) {
       return { slug: pageSlug, data: { ...pageDocSnap.data(), plan: userData?.plan || 'free' } };
    }
    return null;
  } catch (error) {
    console.error("Erro ao buscar dados:", error);
    return null;
  }
};

// No arquivo src/lib/pageService.ts

export const getPageDataBySlug = async (slug: string): Promise<DocumentData | null> => {
  try {
    // 1. Busca o Cardápio (Agora é público pelas regras do Firebase)
    const pageDocRef = doc(db, "pages", slug);
    const pageDocSnap = await getDoc(pageDocRef);
    
    if (!pageDocSnap.exists()) return null;

    const pageData = pageDocSnap.data();
    let plan = 'free'; // Padrão

    // 2. Tenta descobrir o plano do dono
    if (pageData.userId) {
        try {
            const userDocRef = doc(db, "users", pageData.userId);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
                plan = userDocSnap.data().plan || 'free';
            }
        } catch (error) {
            // SE FALHAR (ERRO DE PERMISSÃO), NÃO FAZ NADA!
            // O visitante não tem permissão de ler o 'users' do dono, 
            // então a gente ignora o erro e segue mostrando o cardápio como 'free'.
            // Isso evita que a tela fique piscando/travada.
            console.log("Visitante acessando: não foi possível ler detalhes do dono (OK).");
        }
    }

    return { ...pageData, plan }; 
  } catch (error) {
    console.error("Erro fatal ao buscar página:", error);
    return null;
  }
};

// --- Funções de Escrita ---

export const addLinkToPage = async (pageSlug: string, newLink: LinkData): Promise<void> => {
  const pageDocRef = doc(db, "pages", pageSlug);
  await updateDoc(pageDocRef, { links: arrayUnion(newLink) });
};

export const deleteLinkFromPage = async (pageSlug: string, linkToDelete: LinkData): Promise<void> => {
  const pageDocRef = doc(db, "pages", pageSlug);
  await updateDoc(pageDocRef, { links: arrayRemove(linkToDelete) });
};

export const updateLinksOnPage = async (pageSlug: string, updatedLinks: LinkData[]): Promise<void> => {
  const pageDocRef = doc(db, "pages", pageSlug);
  await updateDoc(pageDocRef, { links: updatedLinks });
};

export const updatePageTheme = async (pageSlug: string, theme: string): Promise<void> => {
  await updateDoc(doc(db, "pages", pageSlug), { theme });
};

export const updatePageBackground = async (pageSlug: string, imageUrl: string): Promise<void> => {
  await updateDoc(doc(db, "pages", pageSlug), { backgroundImage: imageUrl });
};

export const updateProfileImage = async (pageSlug: string, imageUrl: string): Promise<void> => {
  await updateDoc(doc(db, "pages", pageSlug), { profileImageUrl: imageUrl });
};

// ATUALIZADO: Recebe isOpen
// Substitua a função antiga por esta NOVA:

export const updatePageProfileInfo = async (
  pageSlug: string, 
  title: string, 
  bio: string, 
  address: string, 
  isOpen: boolean, 
  whatsapp: string  // <--- Agora ela aceita o whatsapp!
): Promise<void> => {
  await updateDoc(doc(db, "pages", pageSlug), { 
    title, 
    bio, 
    address, 
    isOpen, 
    whatsapp 
  });
};

export const incrementLinkClick = async (pageSlug: string, itemId: string): Promise<void> => {
  try {
    const pageDocRef = doc(db, "pages", pageSlug);
    const pageSnap = await getDoc(pageDocRef);
    if (pageSnap.exists()) {
      const pageData = pageSnap.data() as PageData;
      const links = pageData.links || [];
      const linkIndex = links.findIndex(l => l.title === itemId || l.url === itemId);
      if (linkIndex !== -1) {
        const updatedLinks = [...links];
        updatedLinks[linkIndex] = { ...updatedLinks[linkIndex], clicks: (updatedLinks[linkIndex].clicks || 0) + 1 };
        await updateDoc(pageDocRef, { links: updatedLinks });
      }
    }
  } catch (error) { console.error(error); }
};

export const findUserByEmail = async (email: string): Promise<(UserData & { uid: string }) | null> => {
  if (!email) return null;
  const q = query(collection(db, "users"), where("email", "==", email.trim()));
  const snapshot = await getDocs(q);
  return snapshot.empty ? null : { uid: snapshot.docs[0].id, ...(snapshot.docs[0].data() as UserData) };
};

export const updateUserPlan = async (userId: string, newPlan: 'free' | 'pro'): Promise<void> => {
  await updateDoc(doc(db, "users", userId), { plan: newPlan });
};