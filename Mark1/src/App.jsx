import { lazy, useEffect, useRef, useState } from "react";
import TrackCaption from "./components/TrackCaption";
import { useAuth } from "./contexts/AuthContext";
import { loadMemoryBootstrap, updateMemoryBucket } from "./utils/memoryClient";
import {
    REALTIME_SOUND_PROFILES,
    sanitizeAgentToneWithLLM,
    testAgentVoicePreview,
} from "./utils/agentToneClient";
import "./App.css";

const VoiceAgent = lazy(() => import("./components/VoiceAgent"));
const DEFAULT_SOUND_PROFILE = "shimmer";
const DEFAULT_TEST_SOUND_TEXT = "Hello. This is a quick preview of your selected voice style.";
const CORRECTION_LEVEL_OPTIONS = ["light", "default", "strong"];
const DEFAULT_CORRECTION_LEVEL = "default";
const AGENT_TEXT_MAX_LENGTH = 300;

function LoginGate() {
    const { signIn, signUp } = useAuth();
    const [mode, setMode] = useState("signin");
    const [email, setEmail] = useState("");
    const [name, setName] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const normalizedEmail = email.trim().toLowerCase();
    const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
    const normalizedName = name.trim();
    const isNameValid = normalizedName.length >= 2;
    const isPasswordValid = password.length >= 8;
    const isConfirmValid = confirmPassword === password && confirmPassword.length > 0;
    const canSignIn = isEmailValid && password.length > 0;
    const canSignUp = isEmailValid && isNameValid && isPasswordValid && isConfirmValid;

    const switchMode = (nextMode) => {
        setMode(nextMode);
        setError("");
        setPassword("");
        setConfirmPassword("");
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!normalizedEmail) {
            setError("Please enter your email.");
            return;
        }

        if (!isEmailValid) {
            setError("Please enter a valid email address.");
            return;
        }

        if (mode === "signup" && !isNameValid) {
            setError("Username must be at least 2 characters.");
            return;
        }

        if (!isPasswordValid) {
            setError("Password must be at least 8 characters.");
            return;
        }

        if (mode === "signup" && !isConfirmValid) {
            setError("Passwords do not match.");
            return;
        }

        setSubmitting(true);
        setError("");
        try {
            if (mode === "signin") {
                await signIn({ email: normalizedEmail, password });
            } else {
                await signUp({
                    email: normalizedEmail,
                    name: normalizedName,
                    password,
                });
            }
        } catch (err) {
            setError(err.message || "Authentication failed");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="login-gate">
            <div className="extension-name login-extension-name">
                <span className="extension-title">MARK II</span>
                <div className="login-markii-animation" aria-hidden="true">
                    <svg viewBox="0 0 400 200" xmlns="http://www.w3.org/2000/svg">
                        <g>
                            <animateTransform
                                attributeName="transform"
                                attributeType="XML"
                                type="translate"
                                from="-220 98"
                                to="620 98"
                                dur="4.8s"
                                repeatCount="indefinite"
                            />

                            <g>
                                <g transform="translate(0 -130) scale(0.532)">
                                    <g transform="translate(696 0) scale(-1 1)">
                                        <g fill="none" stroke="rgb(17, 49, 245)" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M263.868 275.581C232.413 275.581 206.931 299.233 206.931 328.425C206.931 357.616 232.413 381.3 263.868 381.3C295.324 381.299 320.837 357.616 320.837 328.425C320.837 299.233 295.324 275.581 263.868 275.581Z" strokeWidth="1.77712" />
                                            <path d="M210.228 313.063C209.524 311.566 226.609 309.746 228.894 309.628C234.225 309.355 249.997 304.524 251.907 307.429" strokeWidth="1" />
                                            <path d="M274.309 303.027C276.95 301.291 294.311 301.884 298.957 301.334C301.557 301.026 308.647 299.98 308.427 300.038C306.317 300.599 311.35 298.911 310.823 299.579" strokeWidth="1" />
                                            <path d="M210.745 313.002C210.443 310.449 211.503 318.606 213.522 320.197C214.478 320.951 229.665 317.236 232.727 316.874C234.979 316.607 247.816 315.906 247.974 315.594C248.857 313.856 252.921 306.285 251.989 308.119" strokeWidth="1" />
                                            <path d="M274.37 303.545C274.345 303.618 278.031 311.837 278.282 311.805C284.517 311.026 295.268 310.039 302.447 308.437C308.144 307.165 308.644 306.334 310.417 301.142C311.632 297.583 309.958 300.004 310.09 301.182" strokeWidth="1" />
                                            <path d="M208.703 338.616C210.645 341.571 221.932 344.956 225.744 346.573C236.129 350.98 250.348 370.867 248.66 379.032" strokeWidth="1" />
                                            <path d="M320.681 328.16C317.704 331.936 306.232 335.038 301.298 338.854C288.105 349.057 288.338 360.929 290.067 375.53" strokeWidth="1" />
                                            <path d="M248.835 379.057C248.414 380.503 251.675 374.703 251.909 374.231C254.066 369.883 254.654 368.406 258.85 367.308C267.084 365.152 287.921 362.538 289.228 376.203" strokeWidth="1" />
                                            <path d="M234.095 285.565C234.403 284.709 239.53 291.046 240.85 290.889C248.124 290.028 256.827 289.479 264.503 289.664C267.063 289.726 274.885 289.202 275.536 286.783C276.134 284.558 276.587 282.259 277.368 280.092C277.559 279.562 278.723 277.018 278.483 277.685" strokeWidth="1" />
                                            <path d="M251.116 306.067C249.578 306.836 258.244 305.651 259.18 305.552C263.682 305.078 270.937 304.821 274.965 302.807" strokeWidth="1" />
                                            <path d="M317.639 304.144C316.95 304.833 317.282 304.438 316.671 305.353" strokeWidth="1.77712" />
                                            <path d="M316.188 305.837C318.04 302.133 332.256 303.419 335.774 303.419C353.257 303.419 370.774 300.275 388.002 300.275" strokeWidth="1.77712" />
                                            <path d="M314.979 353.955C339.576 353.955 365.008 351.053 389.211 351.053" strokeWidth="1.77712" />
                                            <path d="M388.727 300.034C389.892 297.705 397.765 313.399 398.157 315.751C400.656 330.743 404.33 343.252 389.694 350.569" strokeWidth="1.77712" />
                                            <path d="M321.507 331.951C332.713 330.227 350.702 331.136 360.679 326.148" strokeWidth="1.77712" />
                                            <path d="M319.089 346.701C331.547 342.548 353.099 341.623 365.998 341.623" strokeWidth="1.77712" />
                                            <path d="M362.129 325.906C364.033 331.616 370.463 335.837 366.724 343.316" strokeWidth="1.77712" />
                                            <path d="M363.338 326.631C361.417 326.631 365.968 326.631 366.482 326.631C369.395 326.631 372.641 327.077 375.428 326.148C380.436 324.479 373.483 327.703 374.219 328.808C375.465 330.676 382.575 327.942 384.375 329.291C386.113 330.595 380.993 331.703 380.506 332.676C378.506 336.676 374.726 336.523 368.416 342.832" strokeWidth="1.77712" />
                                            <path d="M390.903 300.759C390.899 300.76 394.481 299.935 397.432 300.034C404.122 300.257 410.814 300.465 417.501 300.759C430.722 301.34 443.883 305.837 456.914 305.837" strokeWidth="1.77712" />
                                            <path d="M393.805 349.36C392.744 349.891 409.561 344.372 413.874 342.832C429.128 337.384 444.836 334.67 460.783 332.676" strokeWidth="1.77712" />
                                            <path d="M458.123 306.079C454.776 312.774 460.957 327.144 458.849 335.578" strokeWidth="1.77712" />
                                            <path d="M458.849 306.804C457.488 307.258 467.169 307.586 469.73 308.013C479.53 309.646 478.282 306.186 474.807 311.398C473.08 313.989 485.388 310.305 483.996 313.091C482.785 315.512 477.479 316.833 475.291 317.927C474.091 318.527 470.833 319.298 471.906 320.103C472.89 320.841 473.882 321.648 475.049 322.037C477.73 322.931 484.776 319.994 483.512 322.521C481.756 326.033 467.035 331.243 462.234 333.644" strokeWidth="1.77712" />
                                            <path d="M321.561 320.787C333.361 320.787 340.791 324.128 350.69 329.077" strokeWidth="1.77712" />
                                        </g>
                                        <path d="M403.719 301.001C408.178 315.495 410.813 331.464 405.895 346.217" fill="none" stroke="rgb(17, 49, 245)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.77712" />
                                    </g>
                                </g>

                                <g transform="translate(75 40)" stroke="rgb(17, 49, 245)" strokeWidth="2" strokeLinecap="round" opacity="0.62">
                                    <line x1="22" y1="-6" x2="10" y2="-6">
                                        <animate attributeName="x2" values="-12;-62;-12" dur="0.17s" repeatCount="indefinite" />
                                    </line>
                                    <line x1="20" y1="-4" x2="10" y2="-4">
                                        <animate attributeName="x2" values="-10;-58;-10" dur="0.16s" repeatCount="indefinite" />
                                    </line>
                                    <line x1="18" y1="-2" x2="9" y2="-2">
                                        <animate attributeName="x2" values="-8;-54;-8" dur="0.145s" repeatCount="indefinite" />
                                    </line>
                                    <line x1="18" y1="2" x2="9" y2="2">
                                        <animate attributeName="x2" values="-8;-54;-8" dur="0.13s" repeatCount="indefinite" />
                                    </line>
                                    <line x1="20" y1="4" x2="10" y2="4">
                                        <animate attributeName="x2" values="-10;-58;-10" dur="0.12s" repeatCount="indefinite" />
                                    </line>
                                    <line x1="22" y1="6" x2="10" y2="6">
                                        <animate attributeName="x2" values="-12;-62;-12" dur="0.11s" repeatCount="indefinite" />
                                    </line>
                                </g>
                            </g>
                        </g>
                    </svg>
                </div>
            </div>
            <div className="login-card">
                <form className="login-form" onSubmit={handleSubmit}>
                    <label className="login-label" htmlFor="email">Email</label>
                    <input
                        id="email"
                        className="login-input"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        inputMode="email"
                        autoCapitalize="none"
                        spellCheck={false}
                    />

                    {mode === "signup" ? (
                        <>
                            <label className="login-label" htmlFor="username">Username</label>
                            <input
                                id="username"
                                className="login-input"
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                autoComplete="nickname"
                                maxLength={40}
                            />
                        </>
                    ) : null}

                    <label className="login-label" htmlFor="password">Password</label>
                    <input
                        id="password"
                        className="login-input"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                    />

                    {mode === "signup" ? (
                        <>
                            <label className="login-label" htmlFor="confirm-password">Confirm Password</label>
                            <input
                                id="confirm-password"
                                className="login-input"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                autoComplete="new-password"
                            />
                        </>
                    ) : null}

                    {error ? <div className="login-error">{error}</div> : null}

                    <div className="login-action-row">
                        <button
                            type="submit"
                            disabled={submitting || (mode === "signin" ? !canSignIn : !canSignUp)}
                            className="login-button"
                        >
                            {mode === "signin" ? "Sign in" : "Sign up"}
                        </button>
                        <button
                            type="button"
                            className="login-button login-switch-inline"
                            onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}
                        >
                            {mode === "signin" ? "Sign up" : "Sign in"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function App() {
    const { user, userId, loading, isAuthenticated, logout } = useAuth();
    const [currentInterface, setCurrentInterface] = useState("trackCaption");
    const [isAnimating, setIsAnimating] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [voiceAccountPeek, setVoiceAccountPeek] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [settingsScrolled, setSettingsScrolled] = useState(false);
    const [settingsLoading, setSettingsLoading] = useState(false);
    const [settingsError, setSettingsError] = useState("");
    const [interestItems, setInterestItems] = useState([]);
    const [agentTone, setAgentTone] = useState("");
    const [agentToneDraft, setAgentToneDraft] = useState("");
    const [agentToneEditing, setAgentToneEditing] = useState(false);
    const [agentToneSaving, setAgentToneSaving] = useState(false);
    const [agentToneError, setAgentToneError] = useState("");
    const [agentBehaviorLevel, setAgentBehaviorLevel] = useState(DEFAULT_CORRECTION_LEVEL);
    const [agentBehaviorSaving, setAgentBehaviorSaving] = useState(false);
    const [agentBehaviorError, setAgentBehaviorError] = useState("");
    const [agentVoiceSound, setAgentVoiceSound] = useState(DEFAULT_SOUND_PROFILE);
    const [agentVoiceSoundSaving, setAgentVoiceSoundSaving] = useState(false);
    const [agentVoiceTestText, setAgentVoiceTestText] = useState(DEFAULT_TEST_SOUND_TEXT);
    const [agentVoiceTestDraft, setAgentVoiceTestDraft] = useState(DEFAULT_TEST_SOUND_TEXT);
    const [agentVoiceTestEditing, setAgentVoiceTestEditing] = useState(false);
    const [agentVoiceTestSaving, setAgentVoiceTestSaving] = useState(false);
    const [agentVoiceTestError, setAgentVoiceTestError] = useState("");
    const [agentVoicePreviewing, setAgentVoicePreviewing] = useState(false);
    const [agentVoicePreviewError, setAgentVoicePreviewError] = useState("");
    const previewAudioRef = useRef(null);
    const previewAudioUrlRef = useRef("");
    const menuRef = useRef(null);
    const isVoiceInterface = currentInterface === "voiceAgent";
    const agentToneDraftLength = agentToneDraft.length;
    const agentVoiceTestDraftLength = agentVoiceTestDraft.length;
    const isAgentToneDraftTooLong = agentToneDraftLength > AGENT_TEXT_MAX_LENGTH;
    const isAgentVoiceTestDraftTooLong = agentVoiceTestDraftLength > AGENT_TEXT_MAX_LENGTH;
    const isAgentVoiceTestDraftEmpty = agentVoiceTestDraft.trim().length === 0;

    useEffect(() => {
        const onDocClick = (e) => {
            if (!menuRef.current) return;
            if (!menuRef.current.contains(e.target)) {
                setMenuOpen(false);
                if (isVoiceInterface) {
                    setVoiceAccountPeek(false);
                }
            }
        };

        document.addEventListener("mousedown", onDocClick);
        return () => document.removeEventListener("mousedown", onDocClick);
    }, [isVoiceInterface]);

    useEffect(() => {
        if (!settingsOpen && settingsScrolled) {
            setSettingsScrolled(false);
        }
    }, [settingsOpen, settingsScrolled]);

    useEffect(() => {
        setMenuOpen(false);
        setVoiceAccountPeek(false);
        setSettingsOpen(false);
        setAgentToneEditing(false);
        setAgentToneError("");
        setAgentBehaviorError("");
        setAgentVoiceTestEditing(false);
        setAgentVoiceTestError("");
        setAgentVoicePreviewError("");
    }, [currentInterface]);

    useEffect(() => {
        return () => {
            if (previewAudioRef.current) {
                previewAudioRef.current.pause();
                previewAudioRef.current = null;
            }
            if (previewAudioUrlRef.current) {
                URL.revokeObjectURL(previewAudioUrlRef.current);
                previewAudioUrlRef.current = "";
            }
        };
    }, []);

    useEffect(() => {
        if (!settingsOpen || !userId) return;
        let cancelled = false;

        async function loadSettingsMemory() {
            setSettingsLoading(true);
            setSettingsError("");
            setAgentToneError("");
            setAgentBehaviorError("");
            setInterestItems([]);
            try {
                const { memory } = await loadMemoryBootstrap(userId);
                const semantic = memory?.semantic || {};
                const persistedTone = (() => {
                    const voiceTone = semantic?.profile?.agentVoice?.tone;
                    if (typeof voiceTone === "string") return voiceTone.trim();
                    if (voiceTone && typeof voiceTone === "object") {
                        return String(voiceTone?.sanitized || "").trim();
                    }
                    const raw = semantic?.profile?.agentTone;
                    if (typeof raw === "string") return raw.trim();
                    if (raw && typeof raw === "object") {
                        return String(raw?.sanitized || "").trim();
                    }
                    return "";
                })();
                const persistedSoundProfile = (() => {
                    const raw = String(semantic?.profile?.agentVoice?.soundProfile || "").trim().toLowerCase();
                    return REALTIME_SOUND_PROFILES.includes(raw) ? raw : DEFAULT_SOUND_PROFILE;
                })();
                const persistedTestText = (() => {
                    const raw = semantic?.profile?.agentVoice?.testingText;
                    if (typeof raw === "string") return raw.trim() || DEFAULT_TEST_SOUND_TEXT;
                    if (raw && typeof raw === "object") {
                        return String(raw?.sanitized || "").trim() || DEFAULT_TEST_SOUND_TEXT;
                    }
                    return DEFAULT_TEST_SOUND_TEXT;
                })();
                const persistedBehaviorLevel = (() => {
                    const fromProfile = String(
                        semantic?.profile?.agentBehavior?.correctionLevel || ""
                    ).trim().toLowerCase();
                    if (CORRECTION_LEVEL_OPTIONS.includes(fromProfile)) return fromProfile;
                    const fromLegacy = String(semantic?.profile?.correctionLevel || "").trim().toLowerCase();
                    if (CORRECTION_LEVEL_OPTIONS.includes(fromLegacy)) return fromLegacy;
                    return DEFAULT_CORRECTION_LEVEL;
                })();
                const profileCoreInterests = Array.isArray(semantic?.profile?.coreInterests)
                    ? semantic.profile.coreInterests
                        .map((item) => String(item?.label || "").trim())
                        .filter((t) => t.length > 0)
                    : [];

                const fromSignals = Array.isArray(semantic.interestSignals)
                    ? semantic.interestSignals
                        .map((s) => String(s?.text || "").trim())
                        .filter((t) => t.length > 0)
                    : [];

                const fromPlain = Array.isArray(semantic.interests)
                    ? semantic.interests
                        .map((s) => String(s || "").trim())
                        .filter((t) => t.length > 0)
                    : [];

                const deduped = Array.from(
                    new Set([
                        ...(profileCoreInterests || []),
                        ...(fromSignals || []),
                        ...(fromPlain || []),
                    ])
                ).slice(0, 20);
                if (!cancelled) {
                    setInterestItems(deduped);
                    setAgentTone(persistedTone);
                    setAgentToneDraft(persistedTone);
                    setAgentBehaviorLevel(persistedBehaviorLevel);
                    setAgentVoiceSound(persistedSoundProfile);
                    setAgentVoiceTestText(persistedTestText);
                    setAgentVoiceTestDraft(persistedTestText);
                    setAgentToneEditing(false);
                    setAgentVoiceTestEditing(false);
                }
            } catch (e) {
                if (!cancelled) {
                    setSettingsError(e.message || "Failed to load interests");
                    setInterestItems([]);
                    setAgentTone("");
                    setAgentToneDraft("");
                    setAgentBehaviorLevel(DEFAULT_CORRECTION_LEVEL);
                    setAgentVoiceSound(DEFAULT_SOUND_PROFILE);
                    setAgentVoiceTestText(DEFAULT_TEST_SOUND_TEXT);
                    setAgentVoiceTestDraft(DEFAULT_TEST_SOUND_TEXT);
                    setAgentToneEditing(false);
                    setAgentVoiceTestEditing(false);
                }
            } finally {
                if (!cancelled) {
                    setSettingsLoading(false);
                }
            }
        }

        loadSettingsMemory();
        return () => {
            cancelled = true;
        };
    }, [settingsOpen, userId]);

    const openSettings = () => {
        setMenuOpen(false);
        if (isVoiceInterface) {
            setVoiceAccountPeek(false);
        }
        setSettingsOpen(true);
    };

    const closeSettings = () => {
        setSettingsOpen(false);
        setAgentToneEditing(false);
        setAgentToneError("");
        setAgentBehaviorError("");
        setAgentToneDraft(agentTone);
        setAgentVoiceTestEditing(false);
        setAgentVoiceTestError("");
        setAgentVoicePreviewError("");
        setAgentVoiceTestDraft(agentVoiceTestText);
    };

    const handleEditAgentTone = () => {
        setAgentToneDraft(agentTone);
        setAgentToneEditing(true);
        setAgentToneError("");
    };

    const handleCancelAgentTone = () => {
        setAgentToneDraft(agentTone);
        setAgentToneEditing(false);
        setAgentToneError("");
    };

    const handleEditAgentVoiceTestText = () => {
        setAgentVoiceTestDraft(agentVoiceTestText);
        setAgentVoiceTestEditing(true);
        setAgentVoiceTestError("");
        setAgentVoicePreviewError("");
    };

    const handleCancelAgentVoiceTestText = () => {
        setAgentVoiceTestDraft(agentVoiceTestText);
        setAgentVoiceTestEditing(false);
        setAgentVoiceTestError("");
    };

    const persistAgentVoiceProfile = async ({
        toneRaw,
        toneSanitized,
        correctionLevel,
        soundProfile,
        testTextRaw,
        testTextSanitized,
    }) => {
        const { memory } = await loadMemoryBootstrap(userId);
        const semanticBase = memory?.semantic || {};
        const profileBase = semanticBase?.profile || {};
        const nextCorrectionLevel = CORRECTION_LEVEL_OPTIONS.includes(
            String(correctionLevel || "").trim().toLowerCase()
        )
            ? String(correctionLevel || "").trim().toLowerCase()
            : CORRECTION_LEVEL_OPTIONS.includes(
                String(profileBase?.agentBehavior?.correctionLevel || "").trim().toLowerCase()
            )
                ? String(profileBase?.agentBehavior?.correctionLevel || "").trim().toLowerCase()
                : DEFAULT_CORRECTION_LEVEL;
        const nextToneRaw = String(toneRaw || "").trim();
        const nextToneSanitized = String(toneSanitized || "").trim();
        const nextSoundProfile = REALTIME_SOUND_PROFILES.includes(String(soundProfile || "").trim())
            ? String(soundProfile || "").trim()
            : DEFAULT_SOUND_PROFILE;
        const nextTestTextRaw = String(testTextRaw || "").trim();
        const nextTestTextSanitized = String(testTextSanitized || "").trim();
        const nowIso = new Date().toISOString();

        const nextSemantic = {
            ...semanticBase,
            profile: {
                ...profileBase,
                agentVoice: {
                    tone: {
                        raw: nextToneRaw,
                        sanitized: nextToneSanitized,
                        updatedAt: nowIso,
                        source: "user_settings",
                    },
                    soundProfile: nextSoundProfile,
                    testingText: {
                        raw: nextTestTextRaw,
                        sanitized: nextTestTextSanitized,
                        updatedAt: nowIso,
                        source: "user_settings",
                    },
                    updatedAt: nowIso,
                },
                agentBehavior: {
                    correctionLevel: nextCorrectionLevel,
                    updatedAt: nowIso,
                    source: "user_settings",
                },
                // Keep a legacy flat key for compatibility.
                correctionLevel: nextCorrectionLevel,
                // Keep legacy field for compatibility with existing flow.
                agentTone: {
                    raw: nextToneRaw,
                    sanitized: nextToneSanitized,
                    updatedAt: nowIso,
                    source: "user_settings",
                },
            },
        };

        await updateMemoryBucket({
            userId,
            bucket: "semantic",
            value: nextSemantic,
        });
    };

    const handleSaveAgentTone = async () => {
        if (!userId || agentToneSaving) return;
        setAgentToneSaving(true);
        setAgentToneError("");

        const rawTone = String(agentToneDraft || "").trim();
        try {
            const sanitized = await sanitizeAgentToneWithLLM({ tone: rawTone });
            if (!sanitized?.accepted) {
                setAgentToneError(sanitized?.reason || "This tone preference is not valid.");
                return;
            }

            const cleanedTone = String(
                sanitized?.sanitizedValue ?? sanitized?.sanitizedTone ?? rawTone
            ).trim();
            await persistAgentVoiceProfile({
                toneRaw: rawTone,
                toneSanitized: cleanedTone,
                correctionLevel: agentBehaviorLevel,
                soundProfile: agentVoiceSound,
                testTextRaw: agentVoiceTestText,
                testTextSanitized: agentVoiceTestText,
            });

            setAgentTone(cleanedTone);
            setAgentToneDraft(cleanedTone);
            setAgentToneEditing(false);
        } catch (e) {
            setAgentToneError(e.message || "Failed to save agent tone.");
        } finally {
            setAgentToneSaving(false);
        }
    };

    const handleSoundProfileChange = async (nextSound) => {
        const normalized = String(nextSound || "").trim().toLowerCase();
        if (!REALTIME_SOUND_PROFILES.includes(normalized)) return;
        setAgentVoiceSound(normalized);
        setAgentVoicePreviewError("");
        if (!userId) return;

        setAgentVoiceSoundSaving(true);
        try {
            await persistAgentVoiceProfile({
                toneRaw: agentTone,
                toneSanitized: agentTone,
                correctionLevel: agentBehaviorLevel,
                soundProfile: normalized,
                testTextRaw: agentVoiceTestText,
                testTextSanitized: agentVoiceTestText,
            });
        } catch (e) {
            setAgentVoicePreviewError(e.message || "Failed to save sound profile.");
        } finally {
            setAgentVoiceSoundSaving(false);
        }
    };

    const handleSaveAgentVoiceTestText = async () => {
        if (!userId || agentVoiceTestSaving) return;
        setAgentVoiceTestSaving(true);
        setAgentVoiceTestError("");
        setAgentVoicePreviewError("");

        const rawText = String(agentVoiceTestDraft || "").trim();
        try {
            const sanitized = await sanitizeAgentToneWithLLM({ tone: rawText, type: "test_text" });
            if (!sanitized?.accepted) {
                setAgentVoiceTestError(sanitized?.reason || "This testing text is not valid.");
                return;
            }

            const cleanedText = String(
                sanitized?.sanitizedValue ?? sanitized?.sanitizedTone ?? rawText
            ).trim();

            await persistAgentVoiceProfile({
                toneRaw: agentTone,
                toneSanitized: agentTone,
                correctionLevel: agentBehaviorLevel,
                soundProfile: agentVoiceSound,
                testTextRaw: rawText,
                testTextSanitized: cleanedText,
            });

            setAgentVoiceTestText(cleanedText);
            setAgentVoiceTestDraft(cleanedText);
            setAgentVoiceTestEditing(false);
        } catch (e) {
            setAgentVoiceTestError(e.message || "Failed to save testing text.");
        } finally {
            setAgentVoiceTestSaving(false);
        }
    };

    const handleCorrectionLevelChange = async (nextLevel) => {
        const normalized = String(nextLevel || "").trim().toLowerCase();
        if (!CORRECTION_LEVEL_OPTIONS.includes(normalized)) return;
        if (normalized === agentBehaviorLevel && !agentBehaviorError) return;

        setAgentBehaviorLevel(normalized);
        setAgentBehaviorError("");
        if (!userId) return;

        setAgentBehaviorSaving(true);
        try {
            await persistAgentVoiceProfile({
                toneRaw: agentTone,
                toneSanitized: agentTone,
                correctionLevel: normalized,
                soundProfile: agentVoiceSound,
                testTextRaw: agentVoiceTestText,
                testTextSanitized: agentVoiceTestText,
            });
        } catch (e) {
            setAgentBehaviorError(e.message || "Failed to save behavior.");
        } finally {
            setAgentBehaviorSaving(false);
        }
    };

    const handleTestSoundPreview = async () => {
        if (agentVoicePreviewing || settingsLoading) return;
        setAgentVoicePreviewing(true);
        setAgentToneError("");
        setAgentVoiceTestError("");
        setAgentVoicePreviewError("");

        try {
            const toneForPreview = String(
                agentToneEditing ? agentToneDraft : agentTone
            ).trim();
            const testTextForPreview = String(
                agentVoiceTestEditing ? agentVoiceTestDraft : agentVoiceTestText
            ).trim();

            if (!testTextForPreview) {
                setAgentVoiceTestError("Testing Sound Text cannot be empty.");
                return;
            }

            const toneValidation = await sanitizeAgentToneWithLLM({ tone: toneForPreview, type: "tone" });
            if (!toneValidation?.accepted) {
                setAgentToneError(toneValidation?.reason || "Tone is not valid for preview.");
                return;
            }

            const testTextValidation = await sanitizeAgentToneWithLLM({
                tone: testTextForPreview,
                type: "test_text",
            });
            if (!testTextValidation?.accepted) {
                setAgentVoiceTestError(testTextValidation?.reason || "Testing text is not valid for preview.");
                return;
            }

            const payload = await testAgentVoicePreview({
                soundProfile: agentVoiceSound,
                tone: String(
                    toneValidation?.sanitizedValue ?? toneValidation?.sanitizedTone ?? toneForPreview
                ).trim(),
                text: String(
                    testTextValidation?.sanitizedValue ?? testTextValidation?.sanitizedTone ?? testTextForPreview
                ).trim(),
            });

            const base64 = String(payload?.audioBase64 || "").trim();
            if (!base64) {
                throw new Error("No preview audio returned.");
            }

            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i += 1) {
                bytes[i] = binary.charCodeAt(i);
            }
            const mimeType = String(payload?.mimeType || "audio/mpeg");
            const blob = new Blob([bytes], { type: mimeType });

            if (previewAudioRef.current) {
                previewAudioRef.current.pause();
                previewAudioRef.current = null;
            }
            if (previewAudioUrlRef.current) {
                URL.revokeObjectURL(previewAudioUrlRef.current);
                previewAudioUrlRef.current = "";
            }

            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            previewAudioUrlRef.current = url;
            previewAudioRef.current = audio;
            await audio.play();
        } catch (e) {
            setAgentVoicePreviewError(e.message || "Failed to play preview sound.");
        } finally {
            setAgentVoicePreviewing(false);
        }
    };

    const navigateToVoiceAgent = () => {
        setIsAnimating(true);
        setTimeout(() => {
            setCurrentInterface("voiceAgent");
            setIsAnimating(false);
        }, 150);
    };

    const navigateBack = () => {
        setIsAnimating(true);
        setTimeout(() => {
            setCurrentInterface("trackCaption");
            setIsAnimating(false);
        }, 150);
    };

    if (loading) {
        return <div className="app-loading">Loading profile...</div>;
    }

    if (!isAuthenticated || !userId) {
        return <LoginGate />;
    }

    return (
        <div className="app-shell">
            <div className={`app-main ${(menuOpen || settingsOpen) ? "is-account-menu-open" : ""}`}>
                {currentInterface === "trackCaption" ? (
                    <div className={`interface-container ${isAnimating ? "fade-out" : "fade-in"}`}>
                        <TrackCaption onNavigateToVoiceAgent={navigateToVoiceAgent} userId={userId} />
                    </div>
                ) : (
                    <div className={`interface-container ${isAnimating ? "fade-out" : "fade-in"}`}>
                        <VoiceAgent onNavigateBack={navigateBack} userId={userId} />
                    </div>
                )}
            </div>

            <div
                className={`account-anchor ${isVoiceInterface ? "is-voice" : "is-track"} ${isVoiceInterface && (voiceAccountPeek || menuOpen) ? "is-expanded" : ""} ${menuOpen ? "is-menu-open" : ""} ${settingsOpen ? "is-blurred" : ""}`}
                ref={menuRef}
                onMouseEnter={() => {
                    if (isVoiceInterface) setVoiceAccountPeek(true);
                }}
                onMouseLeave={() => {
                    if (isVoiceInterface && !menuOpen) setVoiceAccountPeek(false);
                }}
            >
                <button
                    type="button"
                    className="account-probe-dot"
                    aria-label="Open account"
                    tabIndex={isVoiceInterface ? 0 : -1}
                    onMouseEnter={() => {
                        if (isVoiceInterface) setVoiceAccountPeek(true);
                    }}
                    onClick={() => {
                        if (isVoiceInterface) setVoiceAccountPeek(true);
                    }}
                />

                <button
                    className="account-chip"
                    onClick={() => {
                        setMenuOpen((v) => {
                            const next = !v;
                            if (isVoiceInterface) {
                                setVoiceAccountPeek(next);
                            }
                            return next;
                        });
                    }}
                >
                    {user?.name || user?.id}
                </button>

                {menuOpen ? (
                    <div className="account-menu">
                        <div className="account-menu-name">{user?.name || user?.id}</div>
                        <div className="account-menu-id">{user?.email || user?.id}</div>
                        <div className="account-menu-actions">
                            <button
                                className="account-settings"
                                onClick={openSettings}
                            >
                                Setting
                            </button>
                            <button
                                className="account-logout"
                                onClick={async () => {
                                    setMenuOpen(false);
                                    setCurrentInterface("trackCaption");
                                    await logout();
                                }}
                            >
                                Logout
                            </button>
                        </div>
                    </div>
                ) : null}
            </div>

            {settingsOpen ? (
                <div className="settings-overlay" onClick={closeSettings}>
                    <div
                        className="settings-window"
                        onClick={(e) => e.stopPropagation()}
                        onScroll={(e) => {
                            const nextScrolled = e.currentTarget.scrollTop > 0;
                            setSettingsScrolled((prev) => (prev === nextScrolled ? prev : nextScrolled));
                        }}
                    >
                        <div className={`settings-window-header ${settingsScrolled ? "is-scrolled" : ""}`}>
                            <span className="settings-window-title">Setting</span>
                            <button className="settings-close" onClick={closeSettings} aria-label="Close settings">×</button>
                        </div>

                        <div className="settings-card-section">
                            <div className="settings-section-head">
                                <div className="settings-section-title">User Interests</div>
                                {settingsLoading ? (
                                    <span className="settings-inline-spinner" aria-label="Loading interests" />
                                ) : null}
                            </div>
                            {settingsError ? (
                                <div className="settings-error">{settingsError}</div>
                            ) : !settingsLoading && interestItems.length === 0 ? (
                                <div className="settings-empty">No interests yet</div>
                            ) : !settingsLoading ? (
                                <div className="settings-interest-list">
                                    {interestItems.map((item) => (
                                        <span key={item} className="settings-interest-chip">{item}</span>
                                    ))}
                                </div>
                            ) : null}
                        </div>

                        <div className="settings-card-section">
                            <div className="settings-section-head settings-agent-tone-head">
                                <div className="settings-section-title">Agent Behavior</div>
                            </div>
                            <div className="settings-agent-voice-block">
                                <div className="settings-agent-voice-subtitle-wrap">
                                    <div className="settings-agent-voice-subtitle">Correction Intensity</div>
                                    <span
                                        className="settings-tooltip-trigger"
                                        aria-label="Correction intensity help"
                                        title=""
                                    >
                                        ?
                                        <span className="settings-tooltip-bubble">
                                            Higher means more correction and a coach-like style; lower means less correction and a chat-like style.
                                        </span>
                                    </span>
                                </div>
                                <div className="settings-behavior-levels">
                                    {CORRECTION_LEVEL_OPTIONS.map((level) => (
                                        <button
                                            key={level}
                                            type="button"
                                            className={`settings-agent-tone-btn ${agentBehaviorLevel === level ? "is-active" : ""}`}
                                            disabled={settingsLoading || agentBehaviorSaving}
                                            onClick={() => handleCorrectionLevelChange(level)}
                                        >
                                            {level}
                                        </button>
                                    ))}
                                </div>
                                {agentBehaviorError ? <div className="settings-error">{agentBehaviorError}</div> : null}
                            </div>
                        </div>

                        <div className="settings-card-section">
                            <div className="settings-section-head settings-agent-tone-head">
                                <div className="settings-section-title">Agent Voice</div>
                            </div>

                            <div className="settings-agent-voice-block">
                                <div className="settings-agent-voice-subtitle">Sound</div>
                                <select
                                    className="settings-agent-voice-select"
                                    value={agentVoiceSound}
                                    onChange={(e) => handleSoundProfileChange(e.target.value)}
                                    disabled={settingsLoading || agentVoiceSoundSaving}
                                >
                                    {REALTIME_SOUND_PROFILES.map((profile) => (
                                        <option key={profile} value={profile}>
                                            {profile}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="settings-agent-voice-block">
                                <div className="settings-agent-voice-subtitle">Tone</div>
                                {agentToneEditing ? (
                                    <div className="settings-agent-tone-input-wrap">
                                        <textarea
                                            className="settings-agent-tone-input"
                                            value={agentToneDraft}
                                            onChange={(e) => setAgentToneDraft(e.target.value)}
                                            maxLength={AGENT_TEXT_MAX_LENGTH}
                                            placeholder="Enter preferred agent speaking tone..."
                                        />
                                        <div className="settings-agent-tone-counter">
                                            {agentToneDraftLength} / {AGENT_TEXT_MAX_LENGTH}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="settings-agent-tone-value">{agentTone || "Empty"}</div>
                                )}
                                <div className="settings-agent-tone-actions">
                                    <button
                                        type="button"
                                        className="settings-agent-tone-btn"
                                        onClick={agentToneEditing ? handleSaveAgentTone : handleEditAgentTone}
                                        disabled={agentToneSaving || settingsLoading || (agentToneEditing && isAgentToneDraftTooLong)}
                                    >
                                        {agentToneEditing ? (agentToneSaving ? "Saving..." : "Done") : "Edit"}
                                    </button>
                                    {agentToneEditing ? (
                                        <button
                                            type="button"
                                            className="settings-agent-tone-btn"
                                            onClick={handleCancelAgentTone}
                                            disabled={agentToneSaving}
                                        >
                                            Cancel
                                        </button>
                                    ) : null}
                                </div>
                                {agentToneError ? <div className="settings-error">{agentToneError}</div> : null}
                            </div>

                            <div className="settings-agent-voice-block">
                                <div className="settings-agent-voice-subtitle">Testing Sound Text</div>
                                {agentVoiceTestEditing ? (
                                    <div className="settings-agent-tone-input-wrap">
                                        <textarea
                                            className="settings-agent-tone-input"
                                            value={agentVoiceTestDraft}
                                            onChange={(e) => setAgentVoiceTestDraft(e.target.value)}
                                            maxLength={AGENT_TEXT_MAX_LENGTH}
                                            placeholder="Enter text for sound preview..."
                                        />
                                        <div className="settings-agent-tone-counter">
                                            {agentVoiceTestDraftLength} / {AGENT_TEXT_MAX_LENGTH}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="settings-agent-tone-value">{agentVoiceTestText || "Empty"}</div>
                                )}
                                <div className="settings-agent-tone-actions">
                                    <button
                                        type="button"
                                        className="settings-agent-tone-btn"
                                        onClick={agentVoiceTestEditing ? handleSaveAgentVoiceTestText : handleEditAgentVoiceTestText}
                                        disabled={agentVoiceTestSaving || settingsLoading || (agentVoiceTestEditing && isAgentVoiceTestDraftTooLong)}
                                    >
                                        {agentVoiceTestEditing ? (agentVoiceTestSaving ? "Saving..." : "Done") : "Edit"}
                                    </button>
                                    <button
                                        type="button"
                                        className="settings-agent-tone-btn"
                                        onClick={handleTestSoundPreview}
                                        disabled={
                                            agentVoicePreviewing
                                            || settingsLoading
                                            || agentToneSaving
                                            || agentVoiceTestSaving
                                            || (agentToneEditing && isAgentToneDraftTooLong)
                                            || (agentVoiceTestEditing && (isAgentVoiceTestDraftTooLong || isAgentVoiceTestDraftEmpty))
                                        }
                                    >
                                        {agentVoicePreviewing ? "Testing..." : "Test Sound"}
                                    </button>
                                    {agentVoiceTestEditing ? (
                                        <button
                                            type="button"
                                            className="settings-agent-tone-btn"
                                            onClick={handleCancelAgentVoiceTestText}
                                            disabled={agentVoiceTestSaving}
                                        >
                                            Cancel
                                        </button>
                                    ) : null}
                                </div>
                                {agentVoiceTestError ? <div className="settings-error">{agentVoiceTestError}</div> : null}
                                {agentVoicePreviewError ? <div className="settings-error">{agentVoicePreviewError}</div> : null}
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

export default App;
