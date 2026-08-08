import "server-only";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const requiredServerVariable = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Configuração server-side ausente: ${name}`);
  return value;
};

const getFirebaseAdminApp = () => {
  const defaultApp = getApps().find((app) => app.name === "[DEFAULT]");
  if (defaultApp) return defaultApp;

  if (process.env.FIRESTORE_EMULATOR_HOST) {
    return initializeApp({
      projectId:
        process.env.FIREBASE_PROJECT_ID ||
        process.env.GCLOUD_PROJECT ||
        "demo-beautypro-local",
    });
  }

  const projectId = requiredServerVariable("FIREBASE_PROJECT_ID");
  const clientEmail = requiredServerVariable("FIREBASE_CLIENT_EMAIL");
  const privateKey = requiredServerVariable("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n");

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    projectId,
  });
};

export const getAdminAuth = () => getAuth(getFirebaseAdminApp());
export const getAdminFirestore = () => getFirestore(getFirebaseAdminApp());
