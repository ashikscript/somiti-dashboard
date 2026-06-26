// ============================================================
// FIREBASE CONFIG — replace with YOUR project's values.
// Get these from: Firebase Console → Project settings → General
//   → "Your apps" → Web app → SDK setup and configuration
// This file is safe to make public — these are not secret keys,
// access is controlled by Firestore security rules (firestore.rules)
// and Firebase Authentication, not by hiding this config.
// ============================================================

export const firebaseConfig = {
  apiKey: "REPLACE_WITH_YOUR_API_KEY",
  authDomain: "REPLACE_WITH_YOUR_PROJECT.firebaseapp.com",
  projectId: "REPLACE_WITH_YOUR_PROJECT_ID",
  storageBucket: "REPLACE_WITH_YOUR_PROJECT.appspot.com",
  messagingSenderId: "REPLACE_WITH_SENDER_ID",
  appId: "REPLACE_WITH_APP_ID"
};

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCebewYZloYRu0IX0Daw3qg7nwTUL1if3M",
  authDomain: "our-somiti.firebaseapp.com",
  projectId: "our-somiti",
  storageBucket: "our-somiti.firebasestorage.app",
  messagingSenderId: "527957710804",
  appId: "1:527957710804:web:68fa91fbf1e2126560e841"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
