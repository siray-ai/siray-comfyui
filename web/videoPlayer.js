import { app, ANIM_PREVIEW_WIDGET } from '../../../scripts/app.js';
import { createImageHost } from "../../../scripts/ui/imagePreview.js"

const BASE_SIZE = 768;
const VIDEO_STATE_KEY = "__sirayVideoPreviewState";

function setVideoDimensions(videoElement, width, height) {
    videoElement.style.width = `${width}px`;
    videoElement.style.height = `${height}px`;
}

// Resize video maintaining aspect ratio
export function resizeVideoAspectRatio(videoElement, maxWidth, maxHeight) {
    const aspectRatio = videoElement.videoWidth / videoElement.videoHeight;
    let newWidth, newHeight;

    // Check which dimension is the limiting factor
    if (videoElement.videoWidth / maxWidth > videoElement.videoHeight / maxHeight) {
        // Width is the limiting factor
        newWidth = maxWidth;
        newHeight = newWidth / aspectRatio;
    } else {
        // Height is the limiting factor
        newHeight = maxHeight;
        newWidth = newHeight * aspectRatio;
    }

    setVideoDimensions(videoElement, newWidth, newHeight);
}

export function chainCallback(object, property, callback) {
    if (object == undefined) {
        //This should not happen.
        console.error("Tried to add callback to non-existant object");
        return;
    }
    if (property in object) {
        const callback_orig = object[property];
        object[property] = function () {
            const r = callback_orig.apply(this, arguments);
            callback.apply(this, arguments);
            return r;
        };
    } else {
        object[property] = callback;
    }
};

const getPreviewState = (node) => {
    if (!node[VIDEO_STATE_KEY]) {
        node[VIDEO_STATE_KEY] = {
            cache: new Map(),
            pendingSignature: "",
            appliedSignature: "",
            widget: null,
        };
    }
    return node[VIDEO_STATE_KEY];
};

const normalizeUrls = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean);
    return [value];
};

const buildSignature = (urls) => urls.join("|");

const setupVideoElement = (videoEl) => {
    if (videoEl.__siraySetupDone) return;

    videoEl.controls = true;
    videoEl.loop = true;
    videoEl.muted = true;
    videoEl.autoplay = true;
    videoEl.playsInline = true;
    videoEl.preload = "metadata";
    videoEl.__siraySetupDone = true;

    videoEl.addEventListener("click", () => {
        if (videoEl.muted) {
            videoEl.muted = false;
            videoEl.play();
        }
    });
};

const loadVideoWithCache = (url, state) => {
    const cached = state.cache.get(url);
    if (cached?.ready) {
        return Promise.resolve(cached.el);
    }
    if (cached?.loading) {
        return cached.loading;
    }

    const videoEl = cached?.el ?? document.createElement("video");
    setupVideoElement(videoEl);

    const loading = new Promise((resolve) => {
        const cleanup = () => {
            videoEl.removeEventListener("loadedmetadata", handleLoaded);
            videoEl.removeEventListener("error", handleError);
        };

        const handleLoaded = () => {
            cleanup();
            resizeVideoAspectRatio(videoEl, BASE_SIZE, BASE_SIZE);
            state.cache.set(url, { el: videoEl, ready: true });
            const playPromise = videoEl.play();
            if (playPromise && typeof playPromise.catch === "function") {
                playPromise.catch(() => { });
            }
            resolve(videoEl);
        };

        const handleError = () => {
            cleanup();
            state.cache.delete(url);
            resolve(null);
        };

        videoEl.addEventListener("loadedmetadata", handleLoaded);
        videoEl.addEventListener("error", handleError);
        videoEl.src = url;
    });

    state.cache.set(url, { el: videoEl, ready: false, loading });
    return loading;
};

const cleanupStaleCache = (state, activeUrls) => {
    const active = new Set(activeUrls);
    for (const [url, entry] of state.cache.entries()) {
        if (active.has(url)) continue;
        try {
            entry.el.pause();
            entry.el.removeAttribute("src");
            entry.el.load();
        } catch (err) {
            console.warn("Failed to cleanup cached video", err);
        }
        state.cache.delete(url);
    }
};

const ensurePreviewWidget = (node) => {
    const state = getPreviewState(node);
    if (state.widget) return state.widget;

    const existingIdx = node.widgets?.findIndex((w) => w.name === ANIM_PREVIEW_WIDGET) ?? -1;
    if (existingIdx > -1) {
        const existingWidget = node.widgets[existingIdx];
        if (existingWidget?.options?.host?.updateImages) {
            state.widget = existingWidget;
            return state.widget;
        }
    }

    const host = createImageHost(node);
    const widget = node.addDOMWidget(ANIM_PREVIEW_WIDGET, "img", host.el, {
        host,
        getHeight: host.getHeight,
        onDraw: host.onDraw,
        hideOnZoom: false,
    });
    widget.serializeValue = () => ({
        height: BASE_SIZE,
    });
    state.widget = widget;
    return widget;
};

const updatePreview = (node, videos, urls, urlsSignature) => {
    const state = getPreviewState(node);

    node.imgs = videos;
    node.displayingImages = [...urls];
    node.animatedImages = videos.length > 0;
    node.size[0] = BASE_SIZE;
    node.size[1] = BASE_SIZE;

    if (videos.length) {
        const widget = ensurePreviewWidget(node);
        widget.options.host.updateImages(videos);
    }

    state.appliedSignature = urlsSignature;
    state.pendingSignature = "";
    node.setDirtyCanvas(true, true);
};

export function addVideoPreview(nodeType, options = {}) {
    nodeType.prototype.onDrawBackground = function (ctx) {
        if (this.flags.collapsed) return;

        const state = getPreviewState(this);
        const urls = normalizeUrls(this.images);
        const signature = buildSignature(urls);

        if (!signature) {
            cleanupStaleCache(state, []);
            state.appliedSignature = "";
            state.pendingSignature = "";
            this.imgs = null;
            this.displayingImages = [];
            this.animatedImages = false;
            return;
        }

        if (signature === state.appliedSignature || signature === state.pendingSignature) {
            return;
        }

        state.pendingSignature = signature;
        const loadAll = urls.map((url) => loadVideoWithCache(url, state));

        Promise.all(loadAll)
            .then((videos) => {
                const readyVideos = videos.filter(Boolean);
                if (state.pendingSignature !== signature) {
                    return;
                }
                cleanupStaleCache(state, urls);
                if (!readyVideos.length) {
                    this.imgs = null;
                    this.displayingImages = [];
                    this.animatedImages = false;
                    state.appliedSignature = signature;
                    state.pendingSignature = "";
                    return;
                }
                updatePreview(this, readyVideos, urls, signature);
                readyVideos.forEach((video) => {
                    if (video.paused) {
                        const playPromise = video.play();
                        if (playPromise && typeof playPromise.catch === "function") {
                            playPromise.catch(() => { });
                        }
                    }
                });
            })
            .catch((err) => {
                console.error("Failed to load video preview", err);
                state.pendingSignature = "";
            });
    };

    chainCallback(nodeType.prototype, "onExecuted", function (message) {
        if (message?.video_url) {
            this.images = message?.video_url;
            this.setDirtyCanvas(true);
        }
    });
}

app.registerExtension({
    name: "SirayVideoPlayer",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "Siray Video Player") {
            return;
        }
        addVideoPreview(nodeType);
    },
});
