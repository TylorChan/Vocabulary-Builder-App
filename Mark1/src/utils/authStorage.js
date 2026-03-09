import { storageGet, storageSet, storageRemove } from "./chromeStorage";

const AUTH_USER_KEY = "auth.currentUser";
const AUTH_USERS_KEY = "auth.users";

const PBKDF2_ITERATIONS = 210000;
const PBKDF2_HASH = "SHA-256";
const PBKDF2_KEY_BYTES = 32;
const SALT_BYTES = 16;

function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}

function normalizeName(name, fallbackEmail) {
    const trimmed = String(name || "").trim();
    if (trimmed) return trimmed;
    return (fallbackEmail || "").split("@")[0] || "User";
}

function bytesToBase64(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

async function derivePasswordHash(password, saltBase64, iterations = PBKDF2_ITERATIONS) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveBits"]
    );

    const bits = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            hash: PBKDF2_HASH,
            salt: base64ToBytes(saltBase64),
            iterations,
        },
        keyMaterial,
        PBKDF2_KEY_BYTES * 8
    );

    return bytesToBase64(new Uint8Array(bits));
}

function createSalt() {
    const saltBytes = new Uint8Array(SALT_BYTES);
    crypto.getRandomValues(saltBytes);
    return bytesToBase64(saltBytes);
}

async function loadAuthUsersMap() {
    const result = await storageGet([AUTH_USERS_KEY]);
    const users = result[AUTH_USERS_KEY];
    return users && typeof users === "object" ? users : {};
}

async function saveAuthUsersMap(usersMap) {
    await storageSet({ [AUTH_USERS_KEY]: usersMap });
}

function toSessionUser(userRecord) {
    return {
        id: userRecord.email,
        email: userRecord.email,
        name: userRecord.name,
        createdAt: userRecord.createdAt,
        lastLoginAt: new Date().toISOString(),
    };
}

export async function loadAuthUser() {
    const result = await storageGet([AUTH_USER_KEY]);
    return result[AUTH_USER_KEY] ?? null;
}

export async function saveAuthUser(user) {
    await storageSet({ [AUTH_USER_KEY]: user });
    return user;
}

export async function clearAuthUser() {
    await storageRemove([AUTH_USER_KEY]);
}

export async function registerAuthUser({ email, name, password }) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) throw new Error("Email is required.");

    const normalizedName = normalizeName(name, normalizedEmail);
    const usersMap = await loadAuthUsersMap();

    if (usersMap[normalizedEmail]) {
        throw new Error("This email is already registered. Please sign in.");
    }

    const salt = createSalt();
    const hash = await derivePasswordHash(password, salt, PBKDF2_ITERATIONS);

    const userRecord = {
        email: normalizedEmail,
        name: normalizedName,
        createdAt: new Date().toISOString(),
        password: {
            hash,
            salt,
            iterations: PBKDF2_ITERATIONS,
            algorithm: `PBKDF2-${PBKDF2_HASH}`,
        },
    };

    usersMap[normalizedEmail] = userRecord;
    await saveAuthUsersMap(usersMap);

    const sessionUser = toSessionUser(userRecord);
    await saveAuthUser(sessionUser);
    return sessionUser;
}

export async function signInAuthUser({ email, password }) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) throw new Error("Email is required.");

    const usersMap = await loadAuthUsersMap();
    const userRecord = usersMap[normalizedEmail];

    // Keep generic error to avoid account enumeration behavior.
    if (!userRecord?.password?.salt || !userRecord?.password?.hash) {
        throw new Error("Invalid email or password.");
    }

    const candidateHash = await derivePasswordHash(
        password,
        userRecord.password.salt,
        userRecord.password.iterations || PBKDF2_ITERATIONS
    );

    if (candidateHash !== userRecord.password.hash) {
        throw new Error("Invalid email or password.");
    }

    const sessionUser = toSessionUser(userRecord);
    await saveAuthUser(sessionUser);
    return sessionUser;
}

export { AUTH_USER_KEY, AUTH_USERS_KEY };
