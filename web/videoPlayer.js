import { app } from "/scripts/app.js";

const MODAL_ID = "siray-video-player-modal";

function ensureModal() {
    let modal = document.getElementById(MODAL_ID);
    if (modal) {
        return modal;
    }

    modal = document.createElement("div");
    modal.id = MODAL_ID;
    modal.style.position = "fixed";
    modal.style.inset = "0";
    modal.style.display = "none";
    modal.style.alignItems = "center";
    modal.style.justifyContent = "center";
    modal.style.background = "rgba(0,0,0,0.65)";
    modal.style.zIndex = "9999";

    const panel = document.createElement("div");
    panel.style.background = "#0f0f0f";
    panel.style.border = "1px solid #2f2f2f";
    panel.style.borderRadius = "12px";
    panel.style.width = "min(900px, 90vw)";
    panel.style.padding = "12px";
    panel.style.boxShadow = "0 10px 40px rgba(0,0,0,0.45)";
    panel.style.display = "flex";
    panel.style.flexDirection = "column";
    panel.style.gap = "8px";
    panel.addEventListener("click", (event) => event.stopPropagation());

    const title = document.createElement("div");
    title.dataset.role = "siray-video-title";
    title.style.color = "#f8f8f8";
    title.style.fontSize = "15px";
    title.style.fontWeight = "600";
    title.textContent = "Siray Video";

    const video = document.createElement("video");
    video.dataset.role = "siray-video-element";
    video.controls = true;
    video.style.width = "100%";
    video.style.maxHeight = "70vh";
    video.style.borderRadius = "10px";
    video.setAttribute("playsinline", "playsinline");

    const footer = document.createElement("div");
    footer.style.display = "flex";
    footer.style.justifyContent = "flex-end";
    footer.style.gap = "8px";

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Close";
    closeBtn.style.padding = "6px 10px";
    closeBtn.style.cursor = "pointer";
    closeBtn.onclick = () => hideModal();

    footer.appendChild(closeBtn);
    panel.append(title, video, footer);
    modal.appendChild(panel);

    modal.addEventListener("click", () => hideModal());
    document.body.appendChild(modal);
    return modal;
}

function hideModal() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    const video = modal.querySelector("video");
    if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
    }
    modal.style.display = "none";
}

function openModal(payload) {
    if (!payload?.video_url) return;
    const modal = ensureModal();
    const video = modal.querySelector("[data-role='siray-video-element']");
    const title = modal.querySelector("[data-role='siray-video-title']");

    title.textContent = payload.title || "Siray Video";

    video.loop = !!payload.loop;
    video.muted = !!payload.muted;
    video.autoplay = !!payload.autoplay;
    if (payload.poster) {
        video.poster = payload.poster;
    } else {
        video.removeAttribute("poster");
    }

    if (video.src !== payload.video_url) {
        video.src = payload.video_url;
    }

    modal.style.display = "flex";
    if (payload.autoplay) {
        setTimeout(() => {
            video.play().catch(() => {});
        }, 30);
    }
}

function attachButton(node) {
    const widget = node.addWidget("button", "Play video", null, () => {
        const payload = node.sirayVideoPreview;
        if (payload?.video_url) {
            openModal(payload);
        }
    });
    widget.serialize = false;
    node.sirayVideoWidget = widget;
}

function updateButtonLabel(node) {
    if (!node.sirayVideoWidget || !node.sirayVideoPreview) return;
    const label = node.sirayVideoPreview.title || "Play video";
    node.sirayVideoWidget.name = label;
    node.setDirtyCanvas(true, true);
}

app.registerExtension({
    name: "siray.videoPlayer",
    nodeCreated(node) {
        if (node.comfyClass === "Siray Video Player") {
            attachButton(node);
        }
    },
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData?.name !== "Siray Video Player") {
            return;
        }

        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            onExecuted?.apply(this, arguments);
            const payload = message?.ui?.siray_video_preview;
            if (payload?.video_url) {
                this.sirayVideoPreview = payload;
                updateButtonLabel(this);
            }
        };
    },
});
