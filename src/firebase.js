import { initializeApp } from "firebase/app";
import {
  initializeFirestore,
  memoryLocalCache
} from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBfQllEMPNKbyBH5dYJcRa4n9txWREJ5AE",
  authDomain: "queuefree-web2.firebaseapp.com",
  projectId: "queuefree-web2",
  storageBucket: "queuefree-web2.firebasestorage.app",
  messagingSenderId: "529852064703",
  appId: "1:529852064703:web:0ac1c1b21732eb2dbcf70a"
};

const app = initializeApp(firebaseConfig);

const db = initializeFirestore(app, {
  cache: memoryLocalCache(),
  experimentalForceLongPolling: true,
  useFetchStreams: false
});

const auth = getAuth(app);

export { app, db, auth };