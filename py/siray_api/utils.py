import base64
import io
from collections.abc import Iterable
from typing import List
from torchvision import transforms

import numpy
import PIL
import requests
import torch


def fetch_image(url: str, stream: bool = True) -> bytes:
    """Download image bytes from a URL."""
    resp = requests.get(url, stream=stream, timeout=(10, 60))
    resp.raise_for_status()
    return resp.content


def decode_image(data_bytes: bytes):
    """Decode raw bytes into a RGB PIL image."""
    with io.BytesIO(data_bytes) as bytes_io:
        img = PIL.Image.open(bytes_io)
        img = img.convert("RGB")
    return img


def images2tensor(images):
    """Convert a list of PIL images to a single torch tensor batch."""
    if isinstance(images, Iterable):
        return torch.stack([torch.from_numpy(numpy.array(image)).float() / 255.0 for image in images])
    return torch.from_numpy(numpy.array(images)).unsqueeze(0).float() / 255.0


def tensor2images(tensor):
    """Convert a ComfyUI image tensor to a list of PIL images."""
    np_imgs = numpy.clip(tensor.cpu().numpy() * 255.0, 0.0, 255.0).astype(numpy.uint8)
    return [PIL.Image.fromarray(np_img) for np_img in np_imgs]


def encode_image(img: PIL.Image.Image):
    """Encode a PIL image to bytes (JPEG by default)."""
    with io.BytesIO() as bytes_io:
        img.save(bytes_io, format="JPEG")
        data_bytes = bytes_io.getvalue()
    return data_bytes


def image_url_to_tensor(url: str):
    """Fetch a list of image URLs and return a torch tensor batch."""
    image_data = fetch_image(url)
    image = decode_image(image_data)
    transform = transforms.ToTensor()
    tensor_image = transform(image)
    tensor_image = tensor_image.unsqueeze(0)
    tensor_image = tensor_image.permute(0, 2, 3, 1).cpu().float()
    return tensor_image


def image_to_base64(image):
    """Convert a ComfyUI tensor or PIL image to a base64 data URL usable by Siray."""
    if image is None:
        return None

    pil_image = image
    if torch.is_tensor(image):
        pil_images = tensor2images(image)
        if not pil_images:
            return None
        pil_image = pil_images[0]

    data_bytes = encode_image(pil_image)
    encoded = base64.b64encode(data_bytes).decode("utf-8")
    return f"data:image/jpeg;base64,{encoded}"
