import React, {useCallback, useState} from "react";

export default function KeyboardTestComposer({
    visible = false,
    disabled = false,
    onSend,
}) {
    const [text, setText] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState("");

    const submit = useCallback(async () => {
        const next = text.trim();
        if (!next || disabled || sending) return;
        setSending(true);
        setError("");
        try {
            const result = await onSend?.(next);
            if (result?.ok === false) {
                setError(result.reason || "Send failed");
                return;
            }
            setText("");
        } catch (e) {
            setError(e?.message || "Send failed");
        } finally {
            setSending(false);
        }
    }, [disabled, onSend, sending, text]);

    if (!visible) return null;

    return (
        <div className="keyboard-test-floating">
            <div className="keyboard-test-row">
                <input
                    type="text"
                    className="keyboard-test-input"
                    value={text}
                    disabled={disabled || sending}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            submit();
                        }
                    }}
                    placeholder="Type to test agent (keyboard mode)"
                />
                <button
                    type="button"
                    className="keyboard-test-send"
                    onClick={submit}
                    disabled={disabled || sending || !text.trim()}
                >
                    {sending ? "..." : "Send"}
                </button>
            </div>
            {error ? <div className="keyboard-test-error">{error}</div> : null}
        </div>
    );
}

