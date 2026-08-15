/* global chrome */
if (!globalThis.__MARKII_COMPANION_AURA__) {
    const AURA_HOST_ID = "markii-companion-aura";
    let removalTimer = null;

    function getAuraHost() {
        return document.getElementById(AURA_HOST_ID);
    }

    function createAuraHost() {
        const existingHost = getAuraHost();
        if (existingHost) return existingHost;

        const host = document.createElement("div");
        host.id = AURA_HOST_ID;
        host.setAttribute("aria-hidden", "true");

        const shadowRoot = host.attachShadow({ mode: "closed" });
        const style = document.createElement("style");
        style.textContent = `
            :host {
                all: initial;
                position: fixed;
                inset: 0;
                z-index: 2147483647;
                pointer-events: none;
            }

            .aura {
                position: absolute;
                inset: 0;
                opacity: 0;
                transition: opacity 240ms ease-out;
            }

            .aura.is-visible {
                opacity: 1;
            }

            .edge {
                position: absolute;
                background: #1131f5;
                box-shadow:
                    0 0 7px 2px rgba(17, 49, 245, 0.58),
                    0 0 18px 7px rgba(17, 49, 245, 0.24);
                animation: markii-companion-breathe 4.2s ease-in-out infinite;
                will-change: opacity;
            }

            .edge-top,
            .edge-bottom {
                left: 0;
                width: 100%;
                height: 2px;
            }

            .edge-left,
            .edge-right {
                top: 0;
                width: 2px;
                height: 100%;
            }

            .edge-top { top: 0; }
            .edge-right { right: 0; animation-delay: -1.05s; }
            .edge-bottom { bottom: 0; animation-delay: -2.1s; }
            .edge-left { left: 0; animation-delay: -3.15s; }

            @keyframes markii-companion-breathe {
                0%, 100% { opacity: 0.46; }
                50% { opacity: 1; }
            }

            @media (prefers-reduced-motion: reduce) {
                .edge {
                    animation: none;
                    opacity: 0.72;
                }
            }
        `;

        const aura = document.createElement("div");
        aura.className = "aura";
        aura.innerHTML = `
            <span class="edge edge-top"></span>
            <span class="edge edge-right"></span>
            <span class="edge edge-bottom"></span>
            <span class="edge edge-left"></span>
        `;

        shadowRoot.append(style, aura);
        host.setVisible = (visible) => {
            aura.classList.toggle("is-visible", Boolean(visible));
        };
        document.documentElement.appendChild(host);
        return host;
    }

    function setVisible(visible) {
        if (removalTimer) {
            window.clearTimeout(removalTimer);
            removalTimer = null;
        }

        if (!visible) {
            const host = getAuraHost();
            host?.setVisible?.(false);
            removalTimer = window.setTimeout(() => {
                host?.remove();
                removalTimer = null;
            }, 260);
            return;
        }

        createAuraHost().setVisible(true);
    }

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message?.type !== "COMPANION_AURA_STATE") return;
        setVisible(message.enabled);
        sendResponse({ success: true });
    });

    globalThis.__MARKII_COMPANION_AURA__ = { setVisible };
}
