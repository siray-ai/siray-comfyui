import time
from typing import Dict, Tuple

from siray import Siray
from siray.exceptions import SirayError

class SirayAPIError(Exception):
    """Generic Siray API error."""


class SirayClient:
    """Lightweight wrapper around the official Siray SDK used by the ComfyUI nodes."""

    def __init__(self, api_key: str):
        if not api_key:
            raise ValueError("Siray API key is required")

        self.api_key = api_key.strip()

        try:
            self.client = Siray(api_key=self.api_key)
        except SirayError as err:
            raise SirayAPIError(f"Failed to initialise Siray client: {err}") from err

    def _extract_task_id(self, response: Dict) -> str:
        if not isinstance(response, dict):
            return ""
        task_id = response.get("task_id") or response.get("id") or ""
        if not task_id and isinstance(response.get("data"), dict):
            task_id = response["data"].get("task_id", "")
        return task_id

    @staticmethod
    def _to_dict(obj) -> Dict:
        if hasattr(obj, "to_dict"):
            return obj.to_dict()
        if hasattr(obj, "raw_response"):
            return getattr(obj, "raw_response", {}) or {}
        return obj if isinstance(obj, dict) else {}

    def create_image_task(self, payload: Dict) -> Tuple[str, Dict]:
        """Submit an async image generation task."""
        try:
            response = self.client.image.generate_async(**payload)
        except SirayError as err:
            raise SirayAPIError(f"Image generation request failed: {err}") from err

        data = self._to_dict(response)
        task_id = getattr(response, "task_id", "") or self._extract_task_id(data)
        if not task_id:
            raise SirayAPIError("No task_id returned for image generation request")
        return task_id, data

    def create_video_task(self, payload: Dict) -> Tuple[str, Dict]:
        """Submit an async video generation task."""
        try:
            response = self.client.video.generate_async(**payload)
        except SirayError as err:
            raise SirayAPIError(f"Video generation request failed: {err}") from err

        data = self._to_dict(response)
        task_id = getattr(response, "task_id", "") or self._extract_task_id(data)
        if not task_id:
            raise SirayAPIError("No task_id returned for video generation request")
        return task_id, data

    def get_task_status(self, task_id: str, task_type: str = "image") -> Dict:
        """Fetch task status for image or video jobs using the SDK."""
        if not task_id:
            raise ValueError("task_id is required")

        try:
            status_obj = (
                self.client.image.query_task(task_id) if task_type == "image" else self.client.video.query_task(task_id)
            )
        except SirayError as err:
            raise SirayAPIError(f"Failed to fetch status for task {task_id}: {err}") from err

        return self._to_dict(status_obj)

    def wait_for_task(self, task_id: str, task_type: str = "image", poll_interval: float = 5.0, timeout: float = 300.0) -> Dict:
        """
        Poll a task until it finishes or times out.

        Returns the final task payload (same shape as GET status).
        """
        start = time.time()
        while True:
            status_payload = self.get_task_status(task_id, task_type=task_type)
            task_data = status_payload.get("data", status_payload if isinstance(status_payload, dict) else {})
            status = str(task_data.get("status", "")).upper()

            if status in ("SUCCESS", "SUCCEEDED", "COMPLETED"):
                return status_payload
            if status in ("FAILURE", "FAILED", "ERROR"):
                fail_reason = task_data.get("fail_reason") or status_payload.get("message", "task failed")
                raise SirayAPIError(f"Task {task_id} failed: {fail_reason}")

            if (time.time() - start) > timeout:
                raise SirayAPIError(f"Task {task_id} timed out after {timeout} seconds")

            time.sleep(max(0.5, poll_interval))
