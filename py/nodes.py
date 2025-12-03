import configparser
import json
import os
import time
import uuid
from typing import Any, Dict, List, Tuple
from urllib.parse import urlparse

import requests

try:
    import folder_paths
except Exception:
    folder_paths = None

from .siray_api.client import SirayClient, SirayAPIError
from .siray_api.utils import image_to_base64, image_url_to_tensor

# Handle config.ini for API key storage (mirrors wavespeed-comfyui UX)
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
temp_dir = os.path.join(parent_dir, ".temp")
os.makedirs(temp_dir, exist_ok=True)

config_path = os.path.join(parent_dir, "config.ini")
config = configparser.ConfigParser()
if not os.path.exists(config_path):
    config["API"] = {"SIRAY_API_KEY": ""}
    with open(config_path, "w") as config_file:
        config.write(config_file)
config.read(config_path)


def _build_client(raw_client: dict) -> SirayClient:
    api_key = raw_client.get("api_key")
    return SirayClient(api_key=api_key)


MODEL_VERSE_URL = "https://api-gateway.siray.ai/api/model-verse/models"
SUPPORTED_IMAGE_TAG = {"image-to-image", "text-to-image", "image"}
SUPPORTED_VIDEO_TAG = {"text-to-video", "image-to-video", "video"}


def _safe_json_loads(text: str):
    try:
        return json.loads(text)
    except Exception:
        return None


def _should_include_model(model_entry: Dict[str, Any]) -> bool:
    tag = model_entry.get("tag") or ""
    # check if contained in SUPPORTED_TAG
    return tag in SUPPORTED_IMAGE_TAG or tag in SUPPORTED_VIDEO_TAG


def _property_to_input_type(prop_name: str, prop_data: Dict[str, Any], default_model_name: str):
    """Map a JSON schema property to ComfyUI input type and config."""
    input_type = "STRING"
    config: Dict[str, Any] = {}
    is_array = prop_data.get("type") == "array"
    is_image = False

    if "enum" in prop_data:
        input_type = prop_data["enum"]
    else:
        prop_type = prop_data.get("type", "string")
        if prop_type == "integer":
            input_type = "INT"
        elif prop_type == "number":
            input_type = "FLOAT"
            config["step"] = 0.01
            config["round"] = 0.001
        elif prop_type == "boolean":
            input_type = "BOOLEAN"
        elif prop_type == "array":
            input_type = "STRING"
            config["multiline"] = True
        else:  # string and unknowns
            lowered = prop_name.lower()
            if "prompt" in lowered:
                config["multiline"] = True
            if "image" in lowered:
                input_type = "IMAGE"
                is_image = True

    if prop_name == "model":
        config["default"] = default_model_name

    if "default" in prop_data and prop_name != "model":
        config["default"] = prop_data["default"]

    if "minimum" in prop_data:
        config["min"] = prop_data["minimum"]
    if "maximum" in prop_data:
        config["max"] = prop_data["maximum"]

    return input_type, config, is_array, is_image


def _schema_to_comfyui_inputs(schema: Dict[str, Any], model_name: str):
    """Convert a model_extend_info JSON schema to ComfyUI INPUT_TYPES dict."""
    required_fields = set(schema.get("required", []))
    properties: Dict[str, Any] = schema.get("properties", {})

    input_types: Dict[str, Dict[str, Tuple[Any, Dict[str, Any]]]] = {
        "required": {"client": ("SIRAY_CLIENT",)},
        "optional": {},
    }
    array_inputs: List[str] = []
    image_inputs: List[str] = []

    for prop_name, prop_data in properties.items():
        input_type, config, is_array, is_image = _property_to_input_type(
            prop_name, prop_data, model_name
        )

        if is_array:
            array_inputs.append(prop_name)
        if is_image:
            image_inputs.append(prop_name)

        target = "required" if prop_name in required_fields else "optional"
        input_types[target][prop_name] = (input_type, config) if config else (input_type,)

    # Common Siray node controls
    input_types["optional"]["max_wait_time"] = ("INT", {"default": 600, "min": 30, "max": 3600})
    input_types["optional"]["force_rerun"] = ("BOOLEAN", {"default": False})

    return input_types, array_inputs, image_inputs, required_fields


def _fetch_model_schemas() -> List[Dict[str, Any]]:
    try:
        resp = requests.get(MODEL_VERSE_URL, timeout=30)
        resp.raise_for_status()
        payload = resp.json()
        return payload.get("data", [])
    except Exception as err:
        print(f"[Siray] Failed to fetch model schemas: {err}")
        return []


def _build_siray_model_node(model_entry: Dict[str, Any]):
    model_name = model_entry.get("model_name", "")
    schema = _safe_json_loads(model_entry.get("model_extend_info", "") or "")
    if not schema or not isinstance(schema, dict):
        return None

    tag = model_entry.get("tag") or ""
    node_label = f"Siray {model_name}"
    input_types, array_inputs, image_inputs, required_fields = _schema_to_comfyui_inputs(
        schema, model_name
    )
    default_wait = 600 if tag in SUPPORTED_VIDEO_TAG else 300
    task_type = "video" if tag in SUPPORTED_VIDEO_TAG else "image"

    class SirayModelNode:
        @classmethod
        def INPUT_TYPES(cls):
            return input_types

        if task_type == "video":
            RETURN_TYPES = ("STRING", "STRING")
            RETURN_NAMES = ("task_id", "video_url")
        else:
            RETURN_TYPES = ("STRING", "STRING", "IMAGE")
            RETURN_NAMES = ("task_id", "image_url", "image")
        FUNCTION = "run"
        CATEGORY = "Siray/Models"

        @classmethod
        def IS_CHANGED(cls, **kwargs):
            return time.time() if kwargs.get("force_rerun") else ""

        def _build_payload(self, kwargs: Dict[str, Any]) -> Dict[str, Any]:
            payload = {}
            for key, value in kwargs.items():
                if key in {"client", "max_wait_time", "force_rerun"}:
                    continue
                if value is None:
                    continue

                if key in image_inputs:
                    payload[key] = image_to_base64(value)
                elif key in array_inputs:
                    if isinstance(value, str):
                        payload[key] = [v for v in value.split("\n") if v.strip()]
                    elif isinstance(value, list):
                        payload[key] = value
                    else:
                        payload[key] = [value]
                else:
                    # Keep empty string if schema marks required
                    if value != "" or key in required_fields:
                        payload[key] = value

            if "model" not in payload:
                payload["model"] = model_name
            return payload

        def run(self, client, **kwargs):
            max_wait_time = kwargs.get("max_wait_time", default_wait)
            poll_interval = kwargs.get("poll_interval", 5)

            siray_client = _build_client(client)
            payload = self._build_payload(kwargs)

            if task_type == "video":
                task_id, _ = siray_client.create_video_task(payload)
            else:
                task_id, _ = siray_client.create_image_task(payload)

            status_payload = siray_client.wait_for_task(
                task_id,
                task_type=task_type,
                poll_interval=poll_interval,
                timeout=max_wait_time,
            )
            task_data = status_payload.get("data", status_payload)
            outputs = task_data.get("outputs", [])
            url = ""
            image_tensor = None
            if outputs:
                url = outputs[0]
            if task_type == "image":
                image_tensor = image_url_to_tensor(url)

            return task_id, url, image_tensor

    return node_label, SirayModelNode


def _load_dynamic_model_nodes():
    nodes = {}
    models = _fetch_model_schemas()
    for model_entry in models:
        if not _should_include_model(model_entry):
            continue
        built = _build_siray_model_node(model_entry)
        if built is None:
            continue
        node_label, node_cls = built
        nodes[node_label] = node_cls
    return nodes


class DownloadFileNode:
    """Download a file from a URL to a local path."""

    @classmethod
    def INPUT_TYPES(cls):
        dir_choices = cls._directory_choices()
        return {
            "required": {
                "url": ("STRING", {"multiline": False}),
            },
            "optional": {
                "save_dir_choice": (dir_choices,),
                "save_dir": ("STRING", {"default": ""}),
                "filename": ("STRING", {"default": ""}),
                "overwrite": ("BOOLEAN", {"default": False}),
                "timeout": ("INT", {"default": 120, "min": 1, "max": 3600}),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("file_path",)
    FUNCTION = "download"
    CATEGORY = "Siray/Utils"

    @staticmethod
    def _default_output_dir() -> str:
        if folder_paths is not None and hasattr(folder_paths, "get_output_directory"):
            return folder_paths.get_output_directory()
        fallback_dir = os.path.join(parent_dir, "downloads")
        os.makedirs(fallback_dir, exist_ok=True)
        return fallback_dir

    @classmethod
    def _directory_choices(cls) -> List[str]:
        """Provide dropdown options for target directory."""
        sentinel = "Custom (type below)"
        try:
            base = cls._default_output_dir()
        except Exception:
            base = ""

        choices: List[str] = [sentinel]
        if base:
            choices.append(base)
            try:
                for entry in sorted(os.listdir(base)):
                    full = os.path.join(base, entry)
                    if os.path.isdir(full):
                        choices.append(full)
            except Exception:
                pass

        seen = set()
        deduped: List[str] = []
        for val in choices:
            if val not in seen:
                deduped.append(val)
                seen.add(val)
        return deduped or [sentinel]

    def _resolve_destination(self, url: str, save_dir: str, filename: str, overwrite: bool) -> str:
        target_dir = (save_dir or "").strip() or self._default_output_dir()
        os.makedirs(target_dir, exist_ok=True)

        parsed = urlparse(url)
        default_name = os.path.basename(parsed.path.rstrip("/"))
        if not default_name:
            default_name = f"download_{int(time.time())}"

        name = (filename or "").strip() or default_name
        safe_name = os.path.basename(name) or f"download_{uuid.uuid4().hex[:8]}"
        dest_path = os.path.abspath(os.path.join(target_dir, safe_name))

        target_dir_abs = os.path.abspath(target_dir)
        if os.path.commonpath([target_dir_abs, dest_path]) != target_dir_abs:
            raise ValueError("Destination path escapes save_dir; adjust filename/save_dir.")

        if os.path.exists(dest_path) and not overwrite:
            stem, ext = os.path.splitext(dest_path)
            dest_path = f"{stem}_{uuid.uuid4().hex[:8]}{ext}"

        return dest_path

    def download(
        self,
        url: str,
        save_dir_choice: str = "Custom (type below)",
        save_dir: str = "",
        filename: str = "",
        overwrite: bool = False,
        timeout: int = 120,
    ):
        cleaned_url = (url or "").strip()
        if not cleaned_url:
            raise ValueError("URL is required to download a file.")

        chosen_dir = save_dir
        choice = (save_dir_choice or "").strip()
        if choice and choice != "Custom (type below)":
            chosen_dir = choice

        dest_path = self._resolve_destination(cleaned_url, chosen_dir, filename, overwrite)

        try:
            with requests.get(cleaned_url, stream=True, timeout=timeout) as resp:
                resp.raise_for_status()
                with open(dest_path, "wb") as outfile:
                    for chunk in resp.iter_content(chunk_size=8192):
                        if chunk:
                            outfile.write(chunk)
        except Exception as err:
            raise RuntimeError(f"Failed to download file from {cleaned_url}: {err}")

        return (dest_path,)


class VideoPreviewNode:
    """Preview an online video URL inside ComfyUI."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "video_url": ("STRING", {"multiline": False}),
            },
            "optional": {
                "title": ("STRING", {"default": ""}),
                "autoplay": ("BOOLEAN", {"default": False}),
                "muted": ("BOOLEAN", {"default": True}),
                "loop": ("BOOLEAN", {"default": False}),
                "poster": ("STRING", {"default": ""}),
            },
        }
    RETURN_TYPES = ()
    RETURN_NAMES = ()
    OUTPUT_NODE = False
    FUNCTION = "preview"
    CATEGORY = "Siray/Utils"

    def preview(
        self,
        video_url: str,
        title: str = "",
        autoplay: bool = False,
        muted: bool = True,
        loop: bool = False,
        poster: str = "",
    ):
        cleaned_url = (video_url or "").strip()
        if not cleaned_url:
            raise ValueError("video_url is required for playback.")

        parsed = urlparse(cleaned_url)
        if parsed.scheme not in {"http", "https"}:
            raise ValueError("video_url must start with http or https.")

        payload = {
            "video_url": cleaned_url,
            "title": (title or "").strip() or "Siray Video",
            "autoplay": bool(autoplay),
            "muted": bool(muted),
            "loop": bool(loop),
        }
        poster_clean = (poster or "").strip()
        if poster_clean:
            payload["poster"] = poster_clean

        return {"ui": {"siray_video_preview": payload}}


class SirayClientNode:
    """Siray API client configuration node."""

    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "api_key": ("STRING", {"multiline": False, "default": ""}),
            },
        }

    RETURN_TYPES = ("SIRAY_CLIENT",)
    RETURN_NAMES = ("client",)
    FUNCTION = "create_client"
    CATEGORY = "Siray"

    def create_client(self, api_key):
        key = api_key.strip()
        if not key:
            key = config.get("API", "SIRAY_API_KEY", fallback="")
        if not key:
            raise ValueError("Siray API key is required. Provide it here or in config.ini.")
        return ({"api_key": key},)

NODE_CLASS_MAPPINGS = {
    "Siray Client": SirayClientNode,
    "Siray File Downloader": DownloadFileNode,
    "Siray Video Player": VideoPreviewNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Siray Client": "Siray Client",
    "Siray File Downloader": "Siray File Downloader",
    "Siray Video Player": "Siray Video Player",
}

# Dynamically generate per-model nodes using Siray model-verse schemas
_dynamic_nodes = _load_dynamic_model_nodes()
NODE_CLASS_MAPPINGS.update(_dynamic_nodes)
for node_name in _dynamic_nodes:
    NODE_DISPLAY_NAME_MAPPINGS[node_name] = node_name
