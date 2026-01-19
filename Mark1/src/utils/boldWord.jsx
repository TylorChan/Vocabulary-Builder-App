export default function highlightWords(text = "", words = []) {
    if (!words.length || !text) return text;

    // escape regex special chars
    const normalized = words.map((w) => w.trim()).filter(Boolean);
    const escaped = normalized
        .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .sort((a, b) => b.length - a.length); // longer first

    const regex = new RegExp(`(${escaped.join("|")})`, "gi");

    const parts = text.split(regex);
    return parts.map((part, i) => {
        const match = words.find((w) => w.toLowerCase() === part.toLowerCase());
        return match ? <strong key={i}>{part}</strong> : part;
    });
}