import { app } from "/scripts/app.js";

const MODAL_ID = "siray-video-player-modal";
const DOWNLOAD_BUTTON_ROLE = "siray-video-download";
const INLINE_WIDGET_TYPE = "siray-video-inline";
const INLINE_HEIGHT = 260;

function deriveFilename(payload) {
    if (!payload?.video_url) return `siray_video_${Date.now()}.mp4`;
    try {
        const parsed = new URL(payload.video_url);
        const base = parsed.pathname.split("/").filter(Boolean).pop() || "";
        if (base) {
            return base.includes(".") ? base : `${base}.mp4`;
        }
    } catch (err) {
        console.warn("[Siray] Failed to parse video filename from URL", err);
    }
    const title = (payload.title || "").trim().replace(/[^\w.-]+/g, "_");
    return `${title || "siray_video"}_${Date.now()}.mp4`;
}

async function saveUrlToDirectory(url, dirHandle, filename) {
    const permission = await dirHandle.requestPermission?.({ mode: "readwrite" });
    if (permission === "denied") {
        throw new Error("Write permission denied for selected directory.");
    }

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} while downloading.`);
    }

    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();

    if (response.body?.getReader) {
        const reader = response.body.getReader();
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) {
                await writable.write(value);
            }
        }
    } else {
        const blob = await response.blob();
        await writable.write(blob);
    }

    await writable.close();
}

function ensureInlinePlayer(node) {
    if (node.sirayInlineWidget) {
        const existing = node.sirayInlineWidget;
        if (existing.painter_wrap && !existing.painter_wrap.isConnected) {
            document.body.appendChild(existing.painter_wrap);
        }
        return existing;
    }

    const container = document.createElement("div");
    container.className = "siray-inline-video";
    container.style.position = "absolute";
    container.style.pointerEvents = "auto";
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "6px";
    container.style.padding = "6px";
    container.style.background = "#0f0f0f";
    container.style.border = "1px solid #2f2f2f";
    container.style.borderRadius = "10px";
    container.style.boxShadow = "0 10px 30px rgba(0,0,0,0.35)";
    container.style.boxSizing = "border-box";
    container.style.minWidth = "240px";

    const label = document.createElement("div");
    label.style.color = "#e8e8e8";
    label.style.fontSize = "12px";
    label.style.fontWeight = "600";
    label.textContent = "Siray Video";

    const video = document.createElement("video");
    video.controls = true;
    video.muted = true;
    video.loop = true;
    video.autoplay = true;
    video.playsInline = true;
    video.style.width = "100%";
    video.style.height = `${INLINE_HEIGHT - 40}px`;
    video.style.borderRadius = "8px";
    video.style.objectFit = "contain";
    video.style.background = "#111";

    container.append(label, video);

    const widget = {
        type: INLINE_WIDGET_TYPE,
        name: INLINE_WIDGET_TYPE,
        draw: function (ctx, _, widgetWidth, y) {
            const margin = 10;
            const rect = ctx.canvas.getBoundingClientRect();
            const transform = new DOMMatrix()
                .scaleSelf(rect.width / ctx.canvas.width, rect.height / ctx.canvas.height)
                .multiplySelf(ctx.getTransform())
                .translateSelf(margin, margin + y);

            const width = widgetWidth - margin * 2 - 10;
            const height = INLINE_HEIGHT;

            Object.assign(container.style, {
                left: `${transform.e}px`,
                top: `${transform.f}px`,
                width: `${Math.max(width * transform.a, 240)}px`,
                height: `${height * transform.d}px`,
                zIndex: app.graph._nodes.indexOf(node) + 1,
            });
        },
    };

    widget.painter_wrap = container;
    widget.videoEl = video;
    widget.labelEl = label;
    widget.parent = node;
    widget.setSource = (payload) => {
        if (!payload?.video_url) return;
        label.textContent = payload.title || "Siray Video";
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
            video.load();
        }
        if (payload.autoplay || !video.paused) {
            setTimeout(() => {
                video.play().catch(() => {});
            }, 10);
        }
    };

    document.body.appendChild(container);
    node.addCustomWidget(widget);

    const onRemoved = node.onRemoved;
    node.onRemoved = function () {
        try {
            if (widget?.painter_wrap?.parentNode) {
                widget.painter_wrap.remove();
            }
        } catch (err) {
            console.warn("[Siray] Failed to remove inline video widget", err);
        }
        onRemoved?.apply(this, arguments);
    };

    node.sirayInlineWidget = widget;
    return widget;
}

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

    const downloadBtn = document.createElement("button");
    downloadBtn.textContent = "Download";
    downloadBtn.dataset.role = DOWNLOAD_BUTTON_ROLE;
    downloadBtn.style.padding = "6px 10px";
    downloadBtn.style.cursor = "pointer";
    downloadBtn.onclick = (event) => {
        event.stopPropagation();
        startDownload(modal);
    };

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Close";
    closeBtn.style.padding = "6px 10px";
    closeBtn.style.cursor = "pointer";
    closeBtn.onclick = () => hideModal();

    footer.append(downloadBtn, closeBtn);
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
    const downloadBtn = modal.querySelector(`[data-role='${DOWNLOAD_BUTTON_ROLE}']`);
    if (downloadBtn) {
        downloadBtn.disabled = false;
        downloadBtn.textContent = "Download";
    }
    modal.sirayVideoPayload = null;
    modal.style.display = "none";
}

async function startDownload(modal) {
    if (!modal?.sirayVideoPayload?.video_url) return;
    const payload = modal.sirayVideoPayload;
    const downloadBtn = modal.querySelector(`[data-role='${DOWNLOAD_BUTTON_ROLE}']`);

    if (!window.showDirectoryPicker) {
        alert("Directory picker is not supported in this browser. Please try a recent Chromium-based browser.");
        return;
    }

    try {
        if (downloadBtn) {
            downloadBtn.disabled = true;
            downloadBtn.textContent = "Choose folder...";
        }
        const dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
        if (downloadBtn) {
            downloadBtn.textContent = "Downloading...";
        }
        await saveUrlToDirectory(payload.video_url, dirHandle, deriveFilename(payload));
        if (downloadBtn) {
            downloadBtn.textContent = "Saved ✓";
        }
    } catch (err) {
        if (err?.name !== "AbortError") {
            console.error("[Siray] Failed to download video", err);
            alert("Download failed. See console for details.");
        }
        if (downloadBtn) {
            downloadBtn.textContent = "Download";
            downloadBtn.disabled = false;
        }
    } finally {
        if (downloadBtn) {
            setTimeout(() => {
                downloadBtn.textContent = "Download";
                downloadBtn.disabled = false;
            }, 1000);
        }
    }
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

    modal.sirayVideoPayload = payload;
    const downloadBtn = modal.querySelector(`[data-role='${DOWNLOAD_BUTTON_ROLE}']`);
    if (downloadBtn) {
        downloadBtn.disabled = false;
        downloadBtn.textContent = "Download";
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
            ensureInlinePlayer(node);
            node.size = [
                Math.max(node.size?.[0] || 0, 360),
                Math.max(node.size?.[1] || 0, INLINE_HEIGHT + 80),
            ];
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
                const inline = ensureInlinePlayer(this);
                inline?.setSource(payload);
                this.size = [
                    Math.max(this.size?.[0] || 0, 360),
                    Math.max(this.size?.[1] || 0, INLINE_HEIGHT + 80),
                ];
                this.setDirtyCanvas(true, true);
            }
        };
    },
});
