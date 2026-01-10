import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// 1. Verifica se o Netlify avisou que é ambiente de TESTE
const useDev = process.env.NEXT_PUBLIC_USE_DEV_DB === "true";

// 2. Log para você ver no Console do navegador (F12) qual banco está usando
if (typeof window !== "undefined") {
  console.log(
    `🔥 Firebase conectando em: %c${useDev ? "DEVELOPMENT (TESTE)" : "PRODUCTION (OFICIAL)"}`,
    `color: ${useDev ? "orange" : "green"}; font-weight: bold; font-size: 12px;`
  );
}

// 3. Escolhe as chaves certas (Se for DEV, pega _DEV. Se não, pega a normal)
const firebaseConfig = {
  apiKey: useDev
    ? process.env.NEXT_PUBLIC_FIREBASE_API_KEY_DEV
    : process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: useDev
    ? process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN_DEV
    : process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: useDev
    ? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID_DEV
    : process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: useDev
    ? process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET_DEV
    : process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: useDev
    ? process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID_DEV
    : process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: useDev
    ? process.env.NEXT_PUBLIC_FIREBASE_APP_ID_DEV
    : process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: useDev
    ? process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID_DEV
    : process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// 4. Inicializa
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };