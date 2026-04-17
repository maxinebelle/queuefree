import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState
} from "react";
import { auth, db } from "./firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

const AuthContext = createContext(null);

function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const buildUserObject = (firebaseUser, profileData = null) => {
    if (!firebaseUser) return null;

    if (profileData) {
      return {
        uid: firebaseUser.uid,
        auth_email: firebaseUser.email || "",
        email: profileData.email || firebaseUser.email || "",
        first_name: profileData.first_name || "",
        last_name: profileData.last_name || "",
        student_no: profileData.student_no || "",
        role: profileData.role || "user",
        user_type: profileData.user_type || "Student",
        is_priority: profileData.is_priority === true,
        priority_type: profileData.priority_type || "Regular",
        priority_status: profileData.priority_status || "not_applicable",
        priority_proof_file_name: profileData.priority_proof_file_name || "",
        priority_proof_data: profileData.priority_proof_data || "",
        office_assignment: profileData.office_assignment || "",
        window_assignment: profileData.window_assignment || "",
        profile_image: profileData.profile_image || "",
        account_status: profileData.account_status || "active",
        is_deleted: profileData.is_deleted === true,
        created_at: profileData.created_at || null,
        ...profileData
      };
    }

    return {
      uid: firebaseUser.uid,
      auth_email: firebaseUser.email || "",
      email: firebaseUser.email || "",
      first_name: "",
      last_name: "",
      student_no: "",
      role: "user",
      user_type: "Student",
      is_priority: false,
      priority_type: "Regular",
      priority_status: "not_applicable",
      priority_proof_file_name: "",
      priority_proof_data: "",
      office_assignment: "",
      window_assignment: "",
      profile_image: "",
      account_status: "active",
      is_deleted: false,
      created_at: null
    };
  };

  const refreshCurrentUserProfile = useCallback(async (firebaseUser) => {
    if (!firebaseUser) {
      setCurrentUser(null);
      return null;
    }

    const userRef = doc(db, "users", firebaseUser.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const profileData = userSnap.data();
      const mergedUser = buildUserObject(firebaseUser, profileData);
      setCurrentUser(mergedUser);
      return mergedUser;
    }

    const fallbackUser = buildUserObject(firebaseUser, null);
    setCurrentUser(fallbackUser);
    return fallbackUser;
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        setAuthLoading(true);

        if (!firebaseUser) {
          setCurrentUser(null);
          setAuthLoading(false);
          return;
        }

        await refreshCurrentUserProfile(firebaseUser);
      } catch (error) {
        console.error("AuthContext error:", error);
        setCurrentUser(null);
      } finally {
        setAuthLoading(false);
      }
    });

    return () => unsubscribe();
  }, [refreshCurrentUserProfile]);

  const signup = async ({
    firstName,
    lastName,
    email,
    password,
    studentNo,
    isPriority,
    priorityType,
    priorityProofFileName,
    priorityProofData
  }) => {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedPassword = String(password || "");
    const normalizedFirstName = String(firstName || "").trim();
    const normalizedLastName = String(lastName || "").trim();
    const normalizedStudentNo = String(studentNo || "").trim();
    const normalizedPriorityType =
      isPriority === true
        ? String(priorityType || "").trim() || "Priority"
        : "Regular";

    const userCredential = await createUserWithEmailAndPassword(
      auth,
      normalizedEmail,
      normalizedPassword
    );

    const firebaseUser = userCredential.user;

    await setDoc(doc(db, "users", firebaseUser.uid), {
      first_name: normalizedFirstName,
      last_name: normalizedLastName,
      email: normalizedEmail,
      student_no: normalizedStudentNo,
      role: "user",
      user_type: "Student",
      is_priority: isPriority === true,
      priority_type: normalizedPriorityType,
      priority_status: isPriority === true ? "pending" : "not_applicable",
      priority_proof_file_name:
        isPriority === true ? priorityProofFileName || "" : "",
      priority_proof_data:
        isPriority === true ? priorityProofData || "" : "",
      office_assignment: "",
      window_assignment: "",
      profile_image: "",
      account_status: "active",
      is_deleted: false,
      created_at: serverTimestamp()
    });

    await refreshCurrentUserProfile(firebaseUser);

    return firebaseUser;
  };

  const login = async (email, password) => {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedPassword = String(password || "");

    const userCredential = await signInWithEmailAndPassword(
      auth,
      normalizedEmail,
      normalizedPassword
    );

    await refreshCurrentUserProfile(userCredential.user);

    return userCredential;
  };

  const logout = async () => {
    await signOut(auth);
    setCurrentUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        authLoading,
        signup,
        login,
        logout,
        refreshCurrentUserProfile
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}

export { AuthProvider, useAuth };