import React, {useCallback, useState} from "react";

export default function KeyboardComposer({
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
        <div className="keyboard-composer">
            <div className="keyboard-composer-row">
                <input
                    type="text"
                    className="keyboard-composer-input"
                    value={text}
                    disabled={disabled || sending}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            submit();
                        }
                    }}
                    placeholder="Type a message"
                    aria-label="Message Bob"
                />
                <button
                    type="button"
                    className="keyboard-composer-send"
                    onClick={submit}
                    disabled={disabled || sending || !text.trim()}
                >
                    {sending ? "..." : "Send"}
                </button>
            </div>
            {error ? <div className="keyboard-composer-error">{error}</div> : null}
        </div>
    );
}
