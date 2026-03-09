import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
    clearAuthUser,
    loadAuthUser,
    saveAuthUser,
    registerAuthUser,
    signInAuthUser,
} from "../utils/authStorage";
import { registerAuthUserRemote, signInAuthUserRemote } from "../utils/authClient";

const AuthContext = createContext(undefined);

function normalizeUser(input) {
    const email = String(input?.email ?? input?.id ?? "").trim().toLowerCase();
    const id = email;
    const name = String(input?.name ?? email).trim() || email;
    return {
        id,
        email,
        name,
        createdAt: input?.createdAt ?? new Date().toISOString(),
        lastLoginAt: input?.lastLoginAt ?? new Date().toISOString(),
    };
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        async function bootstrap() {
            try {
                const stored = await loadAuthUser();
                if (!cancelled && stored?.id) {
                    setUser(normalizeUser(stored));
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        bootstrap();
        return () => {
            cancelled = true;
        };
    }, []);

    const signIn = useCallback(async ({ email, password }) => {
        try {
            const remoteSessionUser = await signInAuthUserRemote({ email, password });
            const normalized = normalizeUser(remoteSessionUser);
            await saveAuthUser(normalized);
            setUser(normalized);
            return normalized;
        } catch (remoteError) {
            const status = Number(remoteError?.status || 0);
            const shouldTryLocalFallback =
                status === 0 || status >= 500 || status === 401 || status === 404;
            if (!shouldTryLocalFallback) {
                throw remoteError;
            }

            // Fallback for local-dev / migration from older local-only auth.
            // If local auth also fails, keep original remote error semantics.
            let localSessionUser = null;
            try {
                localSessionUser = await signInAuthUser({ email, password });
            } catch {
                throw remoteError;
            }
            const normalized = normalizeUser(localSessionUser);
            await saveAuthUser(normalized);
            setUser(normalized);

            // Best-effort backfill to remote auth so future sign-ins work cross-device.
            try {
                await registerAuthUserRemote({
                    email: normalized.email,
                    name: normalized.name,
                    password,
                });
            } catch {
                // no-op
            }

            return normalized;
        }
    }, []);

    const signUp = useCallback(async ({ email, name, password }) => {
        try {
            const remoteSessionUser = await registerAuthUserRemote({ email, name, password });
            const normalized = normalizeUser(remoteSessionUser);
            await saveAuthUser(normalized);
            setUser(normalized);
            return normalized;
        } catch (remoteError) {
            const status = Number(remoteError?.status || 0);
            const remoteDown = status === 0 || status >= 500;
            if (!remoteDown) {
                throw remoteError;
            }

            // Fallback for local-dev only.
            const localSessionUser = await registerAuthUser({ email, name, password });
            const normalized = normalizeUser(localSessionUser);
            await saveAuthUser(normalized);
            setUser(normalized);
            return normalized;
        }
    }, []);

    const logout = useCallback(async () => {
        await clearAuthUser();
        setUser(null);
    }, []);

    const value = useMemo(() => ({
        user,
        userId: user?.id ?? null,
        isAuthenticated: !!user?.id,
        loading,
        signIn,
        signUp,
        logout,
    }), [user, loading, signIn, signUp, logout]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error("useAuth must be used within AuthProvider");
    }
    return ctx;
}
