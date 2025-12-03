import { app, ANIM_PREVIEW_WIDGET } from '../../../scripts/app.js';
import { createImageHost } from "../../../scripts/ui/imagePreview.js"

const BASE_SIZE = 768;

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

export function addVideoPreview(nodeType, options = {}) {
    const createVideoNode = (url) => {
        return new Promise((cb) => {
            const videoEl = document.createElement('video');
            videoEl.addEventListener('loadedmetadata', () => {
                // Show native controls so user can unmute if desired
                videoEl.controls = true;
                videoEl.loop = true;
                // Start muted to satisfy autoplay policies; allow user to unmute via click/controls
                videoEl.muted = true;
                // iOS/Safari inline playback with sound after gesture
                videoEl.playsInline = true;
                // Click to unmute and continue playback with audio
                videoEl.addEventListener('click', () => {
                    if (videoEl.muted) {
                        videoEl.muted = false;
                        videoEl.play();
                    }
                });
                resizeVideoAspectRatio(videoEl, BASE_SIZE, BASE_SIZE);
                cb(videoEl);
            });
            videoEl.addEventListener('error', () => {
                cb();
            });
            videoEl.src = url;
        });
    };

    nodeType.prototype.onDrawBackground = function (ctx) {
        if (this.flags.collapsed) return;

        let imageURLs = this.images ?? [];
        let imagesChanged = false;

        if (JSON.stringify(this.displayingImages) !== JSON.stringify(imageURLs)) {
            this.displayingImages = imageURLs;
            imagesChanged = true;
        }

        if (!imagesChanged) {
            return;
        }

        if (!imageURLs.length) {
            this.imgs = null;
            this.animatedImages = false;
            return;
        }

        const promises = imageURLs.map((url) => {
            return createVideoNode(url);
        });

        Promise.all(promises)
            .then((imgs) => {
                this.imgs = imgs.filter(Boolean);
            })
            .then(() => {
                if (!this.imgs.length) return;

                this.animatedImages = true;
                const widgetIdx = this.widgets?.findIndex((w) => w.name === ANIM_PREVIEW_WIDGET);

                // Set node size to 1024x1024
                this.size[0] = BASE_SIZE;
                this.size[1] = BASE_SIZE;

                if (widgetIdx > -1) {
                    // Replace content
                    const widget = this.widgets[widgetIdx];
                    widget.options.host.updateImages(this.imgs);
                } else {
                    const host = createImageHost(this);
                    const widget = this.addDOMWidget(ANIM_PREVIEW_WIDGET, 'img', host.el, {
                        host,
                        getHeight: host.getHeight,
                        onDraw: host.onDraw,
                        hideOnZoom: false,
                    });
                    widget.serializeValue = () => ({
                        height: BASE_SIZE,
                    });

                    widget.options.host.updateImages(this.imgs);
                }

                this.imgs.forEach((img) => {
                    if (img instanceof HTMLVideoElement) {
                        // Keep initial autoplay muted; user can unmute via controls or click
                        img.muted = true;
                        img.autoplay = true;
                        // Best-effort autoplay; ignore promise rejection from blocked autoplay with sound
                        const playPromise = img.play();
                        if (playPromise && typeof playPromise.catch === 'function') {
                            playPromise.catch(() => {});
                        }
                    }
                });

                // Force canvas update
                this.setDirtyCanvas(true, true);
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