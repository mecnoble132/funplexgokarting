// ============================================
//  FIREBASE CONFIG — FunPlex Go Karting
// ============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDrDwSToWH14aJKabUGDeCRvmzCqx4DqDE",
  authDomain: "funplexgokarting.firebaseapp.com",
  projectId: "funplexgokarting",
  storageBucket: "funplexgokarting.firebasestorage.app",
  messagingSenderId: "1077328178994",
  appId: "1:1077328178994:web:371958fc1fc62acf41b12b"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

export { db };