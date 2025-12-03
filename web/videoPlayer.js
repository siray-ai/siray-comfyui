import { app } from "/scripts/app.js";

const EXTENSION_NAME = "siray.videoPlayer";
const MODAL_ID = "siray-video-player-modal";

function buildModal() {
    let modal = document.getElementById(MODAL_ID);
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = MODAL_ID;
    modal.style.position = "fixed";
    modal.style.inset = "0";
    modal.style.display = "none";
    modal.style.alignItems = "center";
    modal.style.justifyContent = "center";
    modal.style.background = "rgba(0,0,0,0.6)";
    modal.style.zIndex = "9999";
    modal.addEventListener("click", () => hideModal());

    const panel = document.createElement("div");
    panel.style.background = "#0f0f0f";
    panel.style.border = "1px solid #2a2a2a";
    panel.style.borderRadius = "10px";
    panel.style.width = "min(860px, 92vw)";
    panel.style.padding = "12px";
    panel.style.boxSizing = "border-box";
    panel.addEventListener("click", (event) => event.stopPropagation());

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.justifyContent = "space-between";
    header.style.gap = "10px";
    header.style.marginBottom = "8px";

    const title = document.createElement("div");
    title.dataset.role = "siray-video-title";
    title.style.fontSize = "15px";
    title.style.fontWeight = "600";
    title.style.color = "#f5f5f5";
    title.textContent = "Siray Video";

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.alignItems = "center";
    controls.style.gap = "10px";

    const openLink = document.createElement("a");
    openLink.dataset.role = "siray-video-link";
    openLink.target = "_blank";
    openLink.rel = "noreferrer noopener";
    openLink.style.color = "#8ec5ff";
    openLink.style.fontSize = "12px";
    openLink.style.textDecoration = "none";
    openLink.textContent = "Open in new tab";

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Close";
    closeBtn.style.cursor = "pointer";
    closeBtn.onclick = () => hideModal();

    controls.append(openLink, closeBtn);
    header.append(title, controls);

    const video = document.createElement("video");
    video.dataset.role = "siray-video-element";
    video.controls = true;
    video.style.width = "100%";
    video.style.maxHeight = "70vh";
    video.style.borderRadius = "8px";
    video.style.background = "#111";

    panel.append(header, video);
    modal.appendChild(panel);
    document.body.appendChild(modal);
    return modal;
}

function hideModal() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    const video = modal.querySelector("[data-role='siray-video-element']");
    if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
    }
    modal.style.display = "none";
}

function openModal(payload) {
    if (!payload?.video_url) return;
    const modal = buildModal();
    const video = modal.querySelector("[data-role='siray-video-element']");
    const title = modal.querySelector("[data-role='siray-video-title']");
    const link = modal.querySelector("[data-role='siray-video-link']");

    title.textContent = payload.title || "Siray Video";
    link.href = payload.video_url;

    video.loop = !!payload.loop;
    video.muted = payload.muted === undefined ? true : !!payload.muted;
    video.autoplay = !!payload.autoplay;
    if (payload.poster) {
        video.poster = payload.poster;
    } else {
        video.removeAttribute("poster");
    }

    if (video.src !== payload.video_url) {
        video.src = payload.video_url;
        video.load();
    }

    modal.style.display = "flex";
    setTimeout(() => {
        video.play().catch(() => {});
    }, 30);
}

function attachButton(node) {
    if (node.sirayVideoWidget) return;
    const widget = node.addWidget("button", "Play video", null, () => {
        if (node.sirayVideoPayload?.video_url) {
            openModal(node.sirayVideoPayload);
        }
    });
    widget.serialize = false;
    node.sirayVideoWidget = widget;
}

function updateButton(node) {
    if (!node.sirayVideoWidget) return;
    const label = node.sirayVideoPayload?.title || "Play video";
    node.sirayVideoWidget.name = label;
    node.setDirtyCanvas(true, true);
}

function normalizePayload(raw) {
    if (!raw?.video_url) return null;
    return {
        video_url: raw.video_url,
        title: raw.title || "Siray Video",
        loop: !!raw.loop,
        muted: raw.muted === undefined ? true : !!raw.muted,
        autoplay: !!raw.autoplay,
        poster: raw.poster || "",
    };
}

app.registerExtension({
    name: EXTENSION_NAME,
    nodeCreated(node) {
        if (node.comfyClass === "Siray Video Player" || node.type === "Siray Video Player") {
            attachButton(node);
            node.size = [
                Math.max(node.size?.[0] || 0, 260),
                Math.max(node.size?.[1] || 0, 80),
            ];
        }
    },
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData?.name !== "Siray Video Player") return;
        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            onExecuted?.apply(this, arguments);
            const payload =
                message?.ui?.siray_video_preview ||
                message?.siray_video_preview ||
                (message?.video_url ? { video_url: message.video_url } : null);
            const normalized = normalizePayload(payload);
            if (!normalized) return;
            this.sirayVideoPayload = normalized;
            attachButton(this);
            updateButton(this);
        };
    },
});
