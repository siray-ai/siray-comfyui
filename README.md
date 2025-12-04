<div align="center">
  <a href="https://siray.ai" aria-label="Siray">
    <img src="https://www.siray.ai/black-logo.svg" alt="Siray logo" width="220">
  </a>
  <p>
    <a href="https://discord.com/invite/CmSbUzPSVP">
      <img src="https://console.siray.ai/images/discord-fill.webp" alt="Discord" width="18" style="vertical-align: middle; margin-right: 6px;">
      Join the Siray Discord
    </a>
  </p>
</div>

# Siray ComfyUI Nodes

Custom ComfyUI nodes that call [Siray](https://siray.ai) image/video models through the official [siray-python](https://github.com/siray-ai/siray-python) SDK. Model nodes are generated dynamically from Siray Model Verse schemas, so the inputs match the API for each model.

## What you get
- **Siray Client**: Creates an authenticated client. Reads `config.ini` when the input is empty; auto-creates `config.ini` beside this repo if missing.
- **Siray Video Player**: Output node that streams any HTTP/HTTPS video URL in the UI (no download). Frontend lives in `web/videoPlayer.js`. Not compatible with ComfyUI Nodes 2.0.
- **Siray <model_name>**: One node per Siray model fetched from Model Verse (`text-to-image`, `image-to-image`, `text-to-video`, `image-to-video`, `image`, `video` tags). When a schema includes an `images` array, nodes create `image_0`...`image_n` inputs based on `minItems`/`maxItems`.

## How generated model nodes behave
- Inputs are derived from the model JSON schema:
  - Numbers → `FLOAT` (step 0.01) or `INT`; booleans → `BOOLEAN`; enums → dropdown.
  - Fields containing `prompt` are multiline; fields containing `image` accept a ComfyUI image tensor and are converted to Siray data URLs.
  - Array fields accept newline-separated strings; `images` arrays become multiple `image_*` inputs to match `minItems`/`maxItems`.
  - `model` defaults to the model’s own name.
  - Extra controls: `max_wait_time` (image default 300s, video default 600s) and `force_rerun`.
- Execution:
  - Image nodes return `(task_id, image_url, image)` where `image` is a tensor fetched from `image_url`.
  - Video nodes return `(task_id, video_url)`.
  - Tasks are created via the Siray SDK and polled until completion (`poll_interval` defaults to 5s).

## Install
1) Place this repo in `ComfyUI/custom_nodes/siray-comfyui`.  
2) Install deps (ComfyUI usually has most already):
   ```bash
   pip install -r requirements.txt
   ```
3) Add API key: pass it to **Siray Client** or fill `config.ini` (copy from `config.ini.tmp`).  
4) Restart ComfyUI. On load, nodes fetch model schemas from Siray; if offline, only **Siray Client** and **Siray Video Player** will appear.

## Usage
1) Drop **Siray Client** and supply an API key (or rely on `config.ini`).  
2) Pick a **Siray <model_name>** node, set prompts/params, and execute.  
3) For video URLs, connect to **Siray Video Player** to preview inline.

## Requirements
`siray`, `requests`, `Pillow` (see `requirements.txt`); ComfyUI provides `torch`/`numpy`.

## License
Apache-2.0.

## Roadmap
- Optional download-to-output node for videos with file management controls.
- Batch task orchestration helpers (queue, cancel, retry) for Siray jobs.
- Support more models from Siray.
