// src/lib/pageService.ts

import {
  doc, getDoc, updateDoc, arrayUnion, arrayRemove, DocumentData,
  collection, query, where, getDocs
} from "firebase/firestore";
import { db } from "./firebaseClient";

// ATUALIZADO: Agora suporta estrutura de Pratos/Produtos
export type LinkData = {
  title: string;
  url?: string; // Opcional agora (pode ser só visualização)
  type: string; 
  order: number;
  icon?: string;
  clicks?: number;
  // Novos campos para Cardápio Digital
  price?: string;
  description?: string;
  imageUrl?: string;
};

export type PageData = {
  title: string;
  bio: string;
  profileImageUrl?: string;
  backgroundImage?: string;
  links: LinkData[]; // Mantivemos o nome 'links' no banco para compatibilidade, mas no front trataremos como 'itens/pratos'
  theme?: string;
  userId: string;
  slug: string;
};

export type UserData = {
  plan: string;
  pageSlug: string;
  displayName?: string;
  email?: string;
  role?: string;
};

// ... (Restante das funções getPageDataForUser, addLinkToPage, etc. permanecem iguais, pois manipulam o objeto genérico)

export const getPageDataForUser = async (userId: string): Promise<{ slug: string, data: DocumentData } | null> => {
  try {
    const userDocRef = doc(db, "users", userId);
    const userDocSnap = await getDoc(userDocRef);

    if (!userDocSnap.exists()) {
      return null;
    }

    const pageSlug = userDocSnap.data()?.pageSlug;
    if (!pageSlug) {
      const pagesRef = collection(db, "pages");
      const q = query(pagesRef, where("userId", "==", userId));
      const pagesSnap = await getDocs(q);
      if (!pagesSnap.empty) {
        const pageDoc = pagesSnap.docs[0];
        return { slug: pageDoc.id, data: pageDoc.data() };
      } else {
         return null;
      }
    }

    const pageDocRef = doc(db, "pages", pageSlug);
    const pageDocSnap = await getDoc(pageDocRef);

    if (pageDocSnap.exists()) {
      return { slug: pageSlug, data: pageDocSnap.data() };
    } else {
      return null;
    }
  } catch (error) {
    console.error("Erro:", error);
    return null;
  }
};

export const addLinkToPage = async (pageSlug: string, newLink: LinkData): Promise<void> => {
  const pageDocRef = doc(db, "pages", pageSlug);
  await updateDoc(pageDocRef, {
    links: arrayUnion(newLink)
  });
};

export const deleteLinkFromPage = async (pageSlug: string, linkToDelete: LinkData): Promise<void> => {
  const pageDocRef = doc(db, "pages", pageSlug);
  await updateDoc(pageDocRef, {
    links: arrayRemove(linkToDelete)
  });
};

export const updateLinksOnPage = async (pageSlug: string, updatedLinks: LinkData[]): Promise<void> => {
  const pageDocRef = doc(db, "pages", pageSlug);
  await updateDoc(pageDocRef, {
    links: updatedLinks
  });
};

export const incrementLinkClick = async (pageSlug: string, linkUrl: string): Promise<void> => {
  // Para cardápio, pode ser usado para contar "cliques no prato" (ex: abrir foto ou detalhe)
  try {
    const pageDocRef = doc(db, "pages", pageSlug);
    const pageSnap = await getDoc(pageDocRef);

    if (pageSnap.exists()) {
      const pageData = pageSnap.data() as PageData;
      const links = pageData.links || [];
      const linkIndex = links.findIndex(l => l.title === linkUrl || l.url === linkUrl); // Adaptado para buscar por título também

      if (linkIndex !== -1) {
        const updatedLinks = [...links];
        const currentClicks = updatedLinks[linkIndex].clicks || 0;
        updatedLinks[linkIndex] = { ...updatedLinks[linkIndex], clicks: currentClicks + 1 };
        await updateDoc(pageDocRef, { links: updatedLinks });
      }
    }
  } catch (error) {
    console.error(error);
  }
};

export const getPageDataBySlug = async (slug: string): Promise<DocumentData | null> => {
  try {
    const pageDocRef = doc(db, "pages", slug);
    const pageDocSnap = await getDoc(pageDocRef);
    return pageDocSnap.exists() ? pageDocSnap.data() : null;
  } catch (error) {
    return null;
  }
};

export const updatePageTheme = async (pageSlug: string, theme: string): Promise<void> => {
  const pageDocRef = doc(db, "pages", pageSlug);
  await updateDoc(pageDocRef, { theme: theme });
};

export const updatePageBackground = async (pageSlug: string, imageUrl: string): Promise<void> => {
  const pageDocRef = doc(db, "pages", pageSlug);
  await updateDoc(pageDocRef, { backgroundImage: imageUrl });
};

export const updateProfileImage = async (pageSlug: string, imageUrl: string): Promise<void> => {
  const pageDocRef = doc(db, "pages", pageSlug);
  await updateDoc(pageDocRef, { profileImageUrl: imageUrl });
};

export const updatePageProfileInfo = async (pageSlug: string, title: string, bio: string): Promise<void> => {
  const pageDocRef = doc(db, "pages", pageSlug);
  await updateDoc(pageDocRef, { title: title, bio: bio });
};

export const generateVCardBlob = (pageData: PageData): Blob => {
  const vcard = `BEGIN:VCARD
VERSION:3.0
FN:${pageData.title}
ORG:${pageData.title}
NOTE:${pageData.bio}
URL:${typeof window !== 'undefined' ? window.location.href : ''}
END:VCARD`;
  return new Blob([vcard], { type: "text/vcard;charset=utf-8" });
};

export const findUserByEmail = async (email: string): Promise<(UserData & { uid: string }) | null> => {
  if (!email) return null;
  try {
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("email", "==", email.trim()));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) return null;
    const userDoc = querySnapshot.docs[0];
    return { uid: userDoc.id, ...(userDoc.data() as UserData) };
  } catch (error) {
    return null;
  }
};

export const updateUserPlan = async (targetUserId: string, newPlan: 'free' | 'pro'): Promise<void> => {
    const userDocRef = doc(db, "users", targetUserId);
    await updateDoc(userDocRef, { plan: newPlan });
};