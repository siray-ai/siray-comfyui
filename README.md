# ComfyUI-Siray-API

Custom ComfyUI nodes for calling [Siray](https://siray.ai) image/video generation APIs directly from your workflows using the official [siray-python](https://github.com/siray-ai/siray-python) SDK. The nodes mirror the workflow of `wavespeed-comfyui`: you configure a client, trigger async generations, and optionally poll for results.

- ✅ Supports Siray image and video async generation
- ✅ Uses the official Siray Python SDK for all API calls
- ✅ Converts ComfyUI tensors to Siray-compatible data URLs automatically
- ✅ Polls tasks and separates image/video/text outputs for you
- ✅ Optional config file for safely storing `SIRAY_API_KEY`

> Siray API reference: https://docs.siray.ai/api-reference

## Installation
1. Go to your `ComfyUI/custom_nodes` folder.
2. Clone or copy this repo into `siray-comfyui`.
3. Install dependencies (usually already bundled with ComfyUI):  
   `pip install -r requirements.txt`
4. Add your API key:
   - Either pass it in the `Siray Client` node, or
   - Copy `config.ini.tmp` to `config.ini` and set `SIRAY_API_KEY=...`.
5. Restart ComfyUI.

## Nodes
- **Siray Client**: Builds an authenticated client (reads `config.ini` when the input is empty).
- **Siray Image Generate**: Submits an image generation task. Accepts optional init image or image URL plus extra JSON parameters. Can wait for completion.
- **Siray Video Generate**: Submits a video generation task with the same wait/poll options.
- **Siray Task Status**: Polls an existing task (image or video) and returns the latest outputs.
- **Siray Preview Video**: Convenience node to download a video URL to the output folder and surface it in the UI.
- **Siray Video Player**: Paste any HTTP/HTTPS video URL and play it directly in the ComfyUI UI (no download required).
- **Siray File Downloader**: Download a URL to disk; pick an output directory from the dropdown or type a custom path.

Each generation/status node outputs a tuple of `(task_id, video_url, image, audio_url, text)` so you can wire it into preview or save nodes easily.

## Usage tips
- `extra_params_json` lets you pass any Siray model-specific fields (e.g. size, cfg scale, seed) directly as JSON.
- When providing an `IMAGE` input, the node converts it to a data URL expected by Siray.
- If you only need the task id, set `wait_for_completion` to `False` and poll later with **Siray Task Status**.

## Requirements
The nodes depend on the official `siray` SDK plus `requests` and `Pillow` (see `requirements.txt`). ComfyUI already bundles `torch`/`numpy`, which are used for tensor conversion.

## License
Apache-2.0.
