"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import {
    signInWithEmailAndPassword,
    signOut as firebaseSignOut,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    User
} from "firebase/auth";
import api from "@/lib/api";

interface UserData {
    id: number;
    email: string;
    role: "master_admin" | "team_lead" | "member";
}

interface AuthContextType {
    user: User | null;
    userData: UserData | null;
    loading: boolean;
    signIn: (email: string, password: string) => Promise<void>;
    signInWithGoogle: () => Promise<void>;
    signOut: () => Promise<void>;
    refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [userData, setUserData] = useState<UserData | null>(null);
    const [loading, setLoading] = useState(true);

    // Fetch user data, optionally injecting a token directly (avoids race with currentUser)
    const fetchUserData = async (idToken?: string) => {
        try {
            // If no token provided, get it from the current user (may need a small wait)
            let tokenHeader: string | undefined;
            if (idToken) {
                tokenHeader = `Bearer ${idToken}`;
            } else {
                // Wait up to 3s for currentUser to be set
                let attempts = 0;
                while (!auth?.currentUser && attempts < 6) {
                    await new Promise((r) => setTimeout(r, 500));
                    attempts++;
                }
                if (auth?.currentUser) {
                    const token = await auth.currentUser.getIdToken();
                    tokenHeader = `Bearer ${token}`;
                }
            }

            if (!tokenHeader) {
                console.warn("fetchUserData: no auth token available, skipping");
                return;
            }

            const response = await api.post("/api/auth/verify", {}, {
                headers: { Authorization: tokenHeader }
            });
            setUserData(response.data);
        } catch (error: any) {
            // If user not registered (403), try to register them
            if (error.response && error.response.status === 403) {
                try {
                    console.log("User not found in backend, attempting registration...");
                    // Get fresh token for registration too
                    const user = auth?.currentUser;
                    if (!user) return;
                    const token = await user.getIdToken();
                    const authHeader = { Authorization: `Bearer ${token}` };
                    await api.post("/api/auth/register-member", {}, { headers: authHeader });
                    // Re-verify after registration
                    const response = await api.post("/api/auth/verify", {}, { headers: authHeader });
                    setUserData(response.data);
                } catch (regError) {
                    console.error("Registration failed:", regError);
                    setUserData(null);
                }
            } else {
                console.error("Error fetching user data:", error.response?.status, error.response?.data || error.message);
                setUserData(null);
            }
        }
    };

    useEffect(() => {
        if (!auth) {
            setLoading(false);
            return;
        }

        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            setUser(firebaseUser);
            if (firebaseUser) {
                // Get a fresh token directly from the user object — guaranteed to be ready here
                const token = await firebaseUser.getIdToken();
                await fetchUserData(token);
            } else {
                setUserData(null);
            }
            setLoading(false);
        });

        return unsubscribe;
    }, []);

    const signIn = async (email: string, password: string) => {
        if (!auth) throw new Error("Firebase not initialized");
        const credential = await signInWithEmailAndPassword(auth, email, password);
        // Get token directly from the credential - no race condition
        const token = await credential.user.getIdToken();
        await fetchUserData(token);
    };

    const signInWithGoogle = async () => {
        if (!auth) throw new Error("Firebase not initialized");
        const provider = new GoogleAuthProvider();
        const credential = await signInWithPopup(auth, provider);
        // Get token directly from the credential - no race condition
        const token = await credential.user.getIdToken();
        await fetchUserData(token);
    };

    const signOut = async () => {
        if (auth) await firebaseSignOut(auth);
        setUserData(null);
    };

    const refreshUserData = async () => {
        if (user) {
            await fetchUserData();
        }
    };

    return (
        <AuthContext.Provider value={{ user, userData, loading, signIn, signInWithGoogle, signOut, refreshUserData }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
