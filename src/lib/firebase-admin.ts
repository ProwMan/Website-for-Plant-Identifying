import { initializeApp, getApps, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

let adminApp: App | undefined;

export async function getAdminApp() {
  if (typeof window !== "undefined") throw new Error("Server-only module!");
  
  if (getApps().length > 0) return getApps()[0];

  return initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || "REPLACED_FOR_SECURITY",
  });
}

export async function getAdminFirestore() {
  await getAdminApp();
  return getFirestore();
}

export async function getAdminAuth() {
  await getAdminApp();
  return getAuth();
}
