// src/lib/pageService.ts

import {
  doc, getDoc, updateDoc, arrayUnion, arrayRemove, DocumentData,
  collection, query, where, getDocs, orderBy, limit, Timestamp, addDoc
} from "firebase/firestore";
import { db } from "./firebaseClient";

// --- TIPOS ---

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
  durationMinutes?: number; 
  active?: boolean;         
};

export type CouponData = {
  code: string;       
  type: 'percent' | 'fixed'; 
  value: number;      
  minValue?: number;  
  active: boolean;    
};

export type PageData = {
  title: string;
  bio: string;
  address?: string;
  whatsapp?: string;
  pixKey?: string;
  profileImageUrl?: string;
  backgroundImage?: string;
  links: LinkData[];
  coupons?: CouponData[]; 
  theme?: string;
  userId: string;
  slug: string;
  plan?: string;
  trialDeadline?: Timestamp;
  isOpen?: boolean;
  createdAt?: any;
};

export type AppointmentData = {
  id?: string;
  pageSlug: string;
  serviceId?: string;
  serviceName: string;
  
  // Dados do Cliente (Login Google)
  customerId?: string; // ID do usuário que agendou
  customerEmail?: string; 
  customerPhoto?: string;

  customerName: string;
  customerPhone: string;
  
  startAt: Timestamp; 
  endAt: Timestamp;   
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  createdAt: any;
  totalValue: number;
  notes?: string;
};

export type UserData = {
  plan: string;
  pageSlug: string;
  displayName?: string;
  email?: string;
  role?: string;
  trialDeadline?: any; 
  cpfCnpj?: string;   
  phone?: string;     
  createdAt?: any;    
};

// FUNÇÃO AUXILIAR
const checkPlanValidity = (data: any) => {
    if (data.plan === 'pro' && data.trialDeadline) {
        const now = new Date();
        const deadline = data.trialDeadline.toDate();
        if (now > deadline) return 'free'; 
    }
    return data.plan || 'free';
};

// --- LEITURA ---

export const getRecentPages = async (): Promise<PageData[]> => {
  try {
    const pagesRef = collection(db, "pages");
    const q = query(pagesRef, orderBy("createdAt", "desc"), limit(4)); 
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as PageData);
  } catch (error) {
    console.error("Erro ao buscar recentes:", error);
    return [];
  }
};

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
        const pageData = pageDoc.data();
        const realPlan = checkPlanValidity(userData); 
        return { slug: pageDoc.id, data: { ...pageData, plan: realPlan } };
      }
      return null;
    }

    const pageDocRef = doc(db, "pages", pageSlug);
    const pageDocSnap = await getDoc(pageDocRef);

    if (pageDocSnap.exists()) {
       const pageData = pageDocSnap.data();
       const realPlan = checkPlanValidity(userData);
       return { slug: pageSlug, data: { ...pageData, plan: realPlan } };
    }
    return null;
  } catch (error) {
    console.error("Erro ao buscar dados:", error);
    return null;
  }
};

export const getPageDataBySlug = async (slug: string): Promise<DocumentData | null> => {
  try {
    const pageDocRef = doc(db, "pages", slug);
    const pageDocSnap = await getDoc(pageDocRef);
    if (!pageDocSnap.exists()) return null;

    const pageData = pageDocSnap.data();
    const realPlan = checkPlanValidity(pageData);
    return { ...pageData, plan: realPlan }; 
  } catch (error) { return null; }
};

export const getAllUsers = async (): Promise<(UserData & { uid: string, createdAt?: any })[]> => {
  try {
    const usersRef = collection(db, "users");
    const snapshot = await getDocs(usersRef);
    
    return snapshot.docs.map(doc => ({
      uid: doc.id,
      ...(doc.data() as UserData)
    }));
  } catch (error) {
    console.error("Erro ao listar usuários:", error);
    return [];
  }
};

// --- AGENDAMENTOS (CORE DO SISTEMA) ---

export const getAppointmentsByDate = async (pageSlug: string, dateStart: Date, dateEnd: Date): Promise<AppointmentData[]> => {
  try {
    const appsRef = collection(db, "appointments");
    const q = query(
      appsRef, 
      where("pageSlug", "==", pageSlug),
      where("startAt", ">=", Timestamp.fromDate(dateStart)),
      where("startAt", "<=", Timestamp.fromDate(dateEnd))
    );
    
    const snapshot = await getDocs(q);
    const appointments = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as AppointmentData))
      .filter(a => a.status !== 'cancelled');
      
    return appointments;
  } catch (error) {
    console.error("Erro ao buscar agendamentos:", error);
    return [];
  }
};

export const getUpcomingAppointments = async (pageSlug: string): Promise<AppointmentData[]> => {
    try {
        const appsRef = collection(db, "appointments");
        const today = new Date();
        today.setHours(0,0,0,0);

        const q = query(
            appsRef,
            where("pageSlug", "==", pageSlug),
            where("startAt", ">=", Timestamp.fromDate(today)),
            orderBy("startAt", "asc")
        );

        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppointmentData));
    } catch (error) {
        console.error("Erro ao buscar agenda:", error);
        return [];
    }
};

export const createAppointment = async (appointment: AppointmentData): Promise<string> => {
  try {
    const appsRef = collection(db, "appointments");
    const docRef = await addDoc(appsRef, appointment);
    return docRef.id;
  } catch (error) {
    console.error("Erro ao criar agendamento:", error);
    throw error;
  }
};

export const updateAppointmentStatus = async (appointmentId: string, status: 'confirmed' | 'cancelled' | 'completed'): Promise<void> => {
    try {
        const appRef = doc(db, "appointments", appointmentId);
        await updateDoc(appRef, { status });
    } catch (error) {
        console.error("Erro ao atualizar status:", error);
        throw error;
    }
};

// --- ESCRITA ---

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

export const updatePageCoupons = async (pageSlug: string, coupons: CouponData[]): Promise<void> => {
  const pageDocRef = doc(db, "pages", pageSlug);
  await updateDoc(pageDocRef, { coupons });
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

export const updatePageProfileInfo = async (
    pageSlug: string, title: string, bio: string, address: string, 
    isOpen: boolean, whatsapp: string, pixKey: string
): Promise<void> => {
  const dataToUpdate = { title, bio, address, isOpen, whatsapp, pixKey: pixKey || "" };
  await updateDoc(doc(db, "pages", pageSlug), dataToUpdate);
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
  await updateDoc(doc(db, "users", userId), { plan: newPlan, trialDeadline: null });
  const pagesRef = collection(db, "pages");
  const q = query(pagesRef, where("userId", "==", userId));
  const snapshot = await getDocs(q);
  if (!snapshot.empty) {
      const pageId = snapshot.docs[0].id;
      await updateDoc(doc(db, "pages", pageId), { plan: newPlan, trialDeadline: null });
  }
};

export const updateUserFiscalData = async (userId: string, cpfCnpj: string, phone: string): Promise<void> => {
  const userRef = doc(db, "users", userId);
  await updateDoc(userRef, { cpfCnpj, phone });
};