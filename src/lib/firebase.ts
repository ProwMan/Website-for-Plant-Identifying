import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "REPLACED_FOR_SECURITY",
  authDomain: "REPLACED_FOR_SECURITY",
  projectId: "REPLACED_FOR_SECURITY",
  storageBucket: "REPLACED_FOR_SECURITY",
  messagingSenderId: "REPLACED_FOR_SECURITY",
  appId: "REPLACED_FOR_SECURITY",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
