# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

siray-comfyui is a ComfyUI custom nodes package that integrates Siray's AI image/video generation models. It dynamically generates ComfyUI nodes from Siray Model Verse API schemas, providing a schema-driven approach where node inputs automatically match each model's API parameters.

## Architecture

### Dynamic Node Generation

The core architecture revolves around runtime node generation:

1. **Model Schema Fetching** (`py/nodes.py:168-176`): On ComfyUI startup, fetches model schemas from `https://api-gateway.siray.ai/api/model-verse/models`
2. **Schema-to-Node Conversion** (`py/nodes.py:126-165`): Transforms JSON schemas into ComfyUI `INPUT_TYPES` dictionaries with automatic type mapping
3. **Node Registration** (`py/nodes.py:284-362`): Dynamically creates and registers one node class per supported model

### Node Types

**Static Nodes:**
- **Siray Client** (`SirayClientNode`): Authentication node that reads API key from `config.ini` or user input
- **Siray Video Player** (`VideoPreviewNode`): Output node for inline video streaming (requires `web/videoPlayer.js` frontend)

**Dynamic Model Nodes** (generated per-model):
- Created from models tagged with: `image-to-image`, `text-to-image`, `image`, `text-to-video`, `image-to-video`, or `video`
- Each node gets schema-derived inputs plus common controls (`max_wait_time`, `force_rerun`)
- Image nodes return `(task_id, image_url, image_tensor)`
- Video nodes return `(task_id, video_url)`

### Data Flow

1. **Client Creation**: User provides API key → `SirayClientNode` creates `SIRAY_CLIENT` output
2. **Task Submission**: Model node receives client + parameters → converts inputs to API payload → submits via `siray-python` SDK
3. **Polling**: Node polls task status every 5s (configurable) until completion or timeout
4. **Output Conversion**: For images, fetches URL and converts to ComfyUI tensor format; videos return URL directly

### Schema Mapping Logic (`py/nodes.py:82-123`)

**Type Conversions:**
- JSON `integer` → `INT`
- JSON `number` → `FLOAT` (step 0.01)
- JSON `boolean` → `BOOLEAN`
- JSON `array` → multiline `STRING` (split by newlines)
- JSON `enum` → dropdown list
- Fields containing "prompt" → multiline text
- Fields containing "image" → `IMAGE` input (auto-converted to base64 data URLs)

**Special Handling:**
- `images` array fields → creates `image_0`...`image_n` inputs based on `minItems`/`maxItems`
- `model` field → defaults to the model's own name
- `required` fields from schema → placed in `required` dict, others in `optional`

### API Client Wrapper (`py/siray_api/client.py`)

Thin wrapper around the official `siray-python` SDK:
- `create_image_task()` / `create_video_task()`: Submit async tasks
- `get_task_status()`: Query task state
- `wait_for_task()`: Poll with timeout/interval controls
- Normalizes SDK responses (handles both object and dict formats)

### Image Conversion Utilities (`py/siray_api/utils.py`)

- `image_to_base64()`: ComfyUI tensor → JPEG base64 data URL (for API submission)
- `image_url_to_tensor()`: HTTP URL → ComfyUI tensor (for output conversion)
- `tensor2images()` / `images2tensor()`: Bidirectional PIL ↔ tensor conversion

### Frontend Integration (`web/videoPlayer.js`)

Custom ComfyUI extension for video preview:
- Registers `SirayVideoPlayer` extension
- Implements video caching, aspect-ratio sizing, and autoplay
- Uses ComfyUI's `createImageHost` API to embed videos in the node UI
- Not compatible with ComfyUI Nodes 2.0

## Development Commands

### Installation

**Option 1: ComfyUI Manager (Recommended)**
1. Open ComfyUI and go to Manager
2. Search for "siray-comfyui" or "Siray" in the custom nodes list
3. Click Install
4. Restart ComfyUI

**Option 2: Manual Installation**
```bash
# Clone to ComfyUI's custom_nodes directory
cd ComfyUI/custom_nodes
git clone https://github.com/siray-ai/siray-comfyui.git
cd siray-comfyui

# Install dependencies
pip install -r requirements.txt

# Restart ComfyUI
```

### Configuration
API key is read from `config.ini` in the project root. If missing, it's auto-created from `config.ini.tmp` template. Format:
```ini
[API]
SIRAY_API_KEY = your_key_here
```

### Testing
No automated tests currently exist. Manual testing workflow:
1. Start ComfyUI
2. Check console logs for "[Siray] Failed to fetch model schemas" errors
3. Verify dynamic model nodes appear in the node menu under "Siray/Models"
4. Test a workflow with Siray Client → Siray <model_name> → Siray Video Player

### Debugging Model Schema Issues
If nodes don't appear:
- Check network access to `https://api-gateway.siray.ai/api/model-verse/models`
- Inspect `_fetch_model_schemas()` console output
- Verify model tags match `SUPPORTED_IMAGE_TAG` or `SUPPORTED_VIDEO_TAG` sets
- Check `_should_include_model()` filtering logic

## Key Implementation Details

### Payload Building (`py/nodes.py:215-250`)
Model node's `_build_payload()` method:
1. Converts `image_*` inputs to base64 and collects into `images` array
2. Converts single image inputs to base64 data URLs
3. Splits array inputs by newlines
4. Filters out `None` values except for required fields
5. Defaults `model` field if missing

### Task Execution Flow (`py/nodes.py:252-279`)
1. Build Siray client from auth node
2. Convert kwargs to API payload
3. Submit task via SDK (`create_image_task` or `create_video_task`)
4. Poll with `wait_for_task()` until success/failure/timeout
5. Extract output URL from `outputs[0]`
6. For images: fetch and convert URL to tensor; for videos: return URL directly

### Video Player State Management (`web/videoPlayer.js:49-59`)
Each node stores state in `__sirayVideoPreviewState`:
- `cache`: Map of URL → `{el, ready, loading}`
- `pendingSignature`/`appliedSignature`: Track URL changes to avoid redundant loads
- `widget`: Reference to the DOM widget

### Error Handling
- `SirayAPIError`: Wraps all Siray SDK errors with context
- Task failures: Raises error with `fail_reason` from API response
- Timeouts: Default 300s for images, 600s for videos (configurable via `max_wait_time`)

## Dependencies

Core: `siray>=0.2.2`, `requests`, `Pillow`, `numpy`, `torchvision`
ComfyUI provides: `torch`

The `siray-python` SDK version is critical—ensure `>=0.2.2` for `image.generate_async()` and `video.generate_async()` support.
