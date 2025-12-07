// src/lib/pageService.ts

import {
  doc, getDoc, updateDoc, arrayUnion, arrayRemove, DocumentData,
  collection, query, where, getDocs
} from "firebase/firestore";
import { db } from "./firebaseClient";

// Tipo para os dados de um link individual (com campo 'icon' opcional)
export type LinkData = {
  title: string;
  url: string;
  type: string; // Mantido para futura customização, se necessário
  order: number;
  icon?: string; // NOVO CAMPO para nome do ícone (ex: 'github', 'instagram')
  clicks?: number; // NOVO CAMPO: Contador de cliques
};

// Tipo para os dados da página inteira (com campo 'theme' opcional)
export type PageData = {
  title: string;
  bio: string;
  profileImageUrl?: string; // Tornar opcional caso o usuário não tenha foto
  backgroundImage?: string; // NOVO CAMPO: URL da imagem de fundo personalizada
  links: LinkData[];
  theme?: string; // NOVO CAMPO para nome do tema (ex: 'dark', 'ocean')
  userId: string; // Adicionado para garantir que o tipo esteja completo e para regras de segurança
  slug: string; // Adicionado para garantir que o tipo esteja completo
};

// --- ADICIONADO TIPO UserData ---
export type UserData = {
  plan: string;
  pageSlug: string;
  displayName?: string;
  email?: string;
  role?: string;
};

/**
 * Busca os dados da página de um usuário pelo ID do usuário.
 */
export const getPageDataForUser = async (userId: string): Promise<{ slug: string, data: DocumentData } | null> => {
  try {
    const userDocRef = doc(db, "users", userId);
    const userDocSnap = await getDoc(userDocRef);

    if (!userDocSnap.exists()) {
      console.error("Documento de usuário não encontrado para getPageDataForUser!");
      return null;
    }

    const pageSlug = userDocSnap.data()?.pageSlug;
    if (!pageSlug) {
      console.warn(`pageSlug não encontrado em /users/${userId}. Tentando fallback...`);
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
    console.error("Erro ao buscar dados da página do usuário:", error);
    return null;
  }
};

/**
 * Adiciona um novo link
 */
export const addLinkToPage = async (pageSlug: string, newLink: LinkData): Promise<void> => {
  try {
    const pageDocRef = doc(db, "pages", pageSlug);
    await updateDoc(pageDocRef, {
      links: arrayUnion(newLink)
    });
  } catch (error) {
    console.error("Erro ao adicionar novo link:", error);
    throw new Error("Não foi possível adicionar o link.");
  }
};

/**
 * Remove um link
 */
export const deleteLinkFromPage = async (pageSlug: string, linkToDelete: LinkData): Promise<void> => {
  try {
    const pageDocRef = doc(db, "pages", pageSlug);
    await updateDoc(pageDocRef, {
      links: arrayRemove(linkToDelete)
    });
  } catch (error) {
    console.error("Erro ao excluir link:", error);
    throw new Error("Não foi possível excluir o link.");
  }
};

/**
 * Atualiza todos os links
 */
export const updateLinksOnPage = async (pageSlug: string, updatedLinks: LinkData[]): Promise<void> => {
  try {
    const pageDocRef = doc(db, "pages", pageSlug);
    await updateDoc(pageDocRef, {
      links: updatedLinks
    });
  } catch (error) {
    console.error("Erro ao atualizar os links:", error);
    throw new Error("Não foi possível atualizar os links.");
  }
};

/**
 * Incrementa cliques
 */
export const incrementLinkClick = async (pageSlug: string, linkUrl: string): Promise<void> => {
  try {
    const pageDocRef = doc(db, "pages", pageSlug);
    const pageSnap = await getDoc(pageDocRef);

    if (pageSnap.exists()) {
      const pageData = pageSnap.data() as PageData;
      const links = pageData.links || [];
      const linkIndex = links.findIndex(l => l.url === linkUrl);

      if (linkIndex !== -1) {
        const updatedLinks = [...links];
        const currentClicks = updatedLinks[linkIndex].clicks || 0;
        updatedLinks[linkIndex] = { ...updatedLinks[linkIndex], clicks: currentClicks + 1 };
        await updateDoc(pageDocRef, { links: updatedLinks });
      }
    }
  } catch (error) {
    console.error("Erro ao incrementar clique:", error);
  }
};

/**
 * Busca dados públicos
 */
export const getPageDataBySlug = async (slug: string): Promise<DocumentData | null> => {
  try {
    const pageDocRef = doc(db, "pages", slug);
    const pageDocSnap = await getDoc(pageDocRef);

    if (pageDocSnap.exists()) {
      return pageDocSnap.data();
    } else {
      return null;
    }
  } catch (error) {
    console.error("Erro ao buscar dados da página pelo slug:", error);
    return null;
  }
};

/**
 * Atualiza o tema
 */
export const updatePageTheme = async (pageSlug: string, theme: string): Promise<void> => {
  try {
    const pageDocRef = doc(db, "pages", pageSlug);
    await updateDoc(pageDocRef, {
      theme: theme
    });
  } catch (error) {
    console.error("Erro ao atualizar o tema:", error);
    throw new Error("Não foi possível atualizar o tema.");
  }
};

/**
 * Atualiza Fundo
 */
export const updatePageBackground = async (pageSlug: string, imageUrl: string): Promise<void> => {
  try {
    const pageDocRef = doc(db, "pages", pageSlug);
    await updateDoc(pageDocRef, {
      backgroundImage: imageUrl
    });
  } catch (error) {
    console.error("Erro ao atualizar a imagem de fundo:", error);
    throw new Error("Não foi possível atualizar a imagem de fundo.");
  }
};

/**
 * Atualiza Foto de Perfil
 */
export const updateProfileImage = async (pageSlug: string, imageUrl: string): Promise<void> => {
  try {
    const pageDocRef = doc(db, "pages", pageSlug);
    await updateDoc(pageDocRef, {
      profileImageUrl: imageUrl
    });
  } catch (error) {
    console.error("Erro ao atualizar a foto de perfil:", error);
    throw new Error("Não foi possível atualizar a foto de perfil.");
  }
};

/**
 * NOVA FUNÇÃO: ATUALIZA TÍTULO E BIO (TEXTOS)
 */
export const updatePageProfileInfo = async (pageSlug: string, title: string, bio: string): Promise<void> => {
  try {
    const pageDocRef = doc(db, "pages", pageSlug);
    await updateDoc(pageDocRef, {
      title: title,
      bio: bio
    });
  } catch (error) {
    console.error("Erro ao atualizar perfil:", error);
    throw new Error("Não foi possível atualizar as informações do perfil.");
  }
};

// --- FUNÇÃO AUXILIAR: Gerar VCard (Cartão de Visita) ---
export const generateVCardBlob = (pageData: PageData): Blob => {
  // Tenta encontrar um número de telefone nos links (para Whatsapp/Tel)
  const phoneLink = pageData.links.find(l => l.url.includes('wa.me') || l.url.includes('tel:'));
  const phoneNumber = phoneLink ? phoneLink.url.split('/').pop()?.replace(/\D/g, '') : '';
  
  // Tenta encontrar email
  const emailLink = pageData.links.find(l => l.url.includes('mailto:'));
  const email = emailLink ? emailLink.url.replace('mailto:', '') : '';

  const vcard = `BEGIN:VCARD
VERSION:3.0
FN:${pageData.title}
N:;${pageData.title};;;
NOTE:${pageData.bio}
${phoneNumber ? `TEL;TYPE=CELL:${phoneNumber}` : ''}
${email ? `EMAIL;TYPE=WORK:${email}` : ''}
URL:${typeof window !== 'undefined' ? window.location.href : ''}
END:VCARD`;

  return new Blob([vcard], { type: "text/vcard;charset=utf-8" });
};

// --- FUNÇÕES ADMIN ---

export const findUserByEmail = async (email: string): Promise<(UserData & { uid: string }) | null> => {
  if (!email) return null;
  try {
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("email", "==", email.trim()));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return null;
    }
    const userDoc = querySnapshot.docs[0];
    return { uid: userDoc.id, ...(userDoc.data() as UserData) };

  } catch (error) {
    console.error("Erro ao buscar usuário por email:", error);
    return null;
  }
};

export const updateUserPlan = async (targetUserId: string, newPlan: 'free' | 'pro'): Promise<void> => {
  if (!targetUserId) {
    throw new Error("UID do usuário alvo não pode ser vazio.");
  }
  try {
    const userDocRef = doc(db, "users", targetUserId);
    await updateDoc(userDocRef, {
      plan: newPlan
    });
  } catch (error) {
    console.error(`Erro ao atualizar plano:`, error);
    throw new Error("Falha ao atualizar o plano do usuário.");
  }
};