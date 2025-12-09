# Siray Model Node

Siray model nodes are dynamically generated based on available models from the Siray API. Each model node allows you to run AI image or video generation tasks.

## Parameters

### Required

- **client**: Connect a Siray Client node to authenticate your API requests.

### Common Optional Parameters

- **prompt**: Text description of what you want to generate.
- **image**: Input image for image-to-image or image-to-video models.
- **model**: The model identifier (pre-filled based on the node).
- **max_wait_time**: Maximum time (seconds) to wait for task completion. Default: 300 for image, 600 for video.
- **force_rerun**: Set to `true` to force re-execution even with same inputs.

Additional parameters vary depending on the specific model's capabilities.

## Outputs

### Image Models
- **task_id**: Unique identifier for the generation task.
- **image_url**: URL of the generated image.
- **image**: The generated image tensor for further processing.

### Video Models
- **task_id**: Unique identifier for the generation task.
- **video_url**: URL of the generated video (connect to Siray Video Player to preview).

## Example Workflow

### Image Generation
```
[Siray Client] ---> [Siray Model Node] ---> [Preview Image]
                          |
                          +-- prompt: "a cat sitting on a couch"
```

### Video Generation
```
[Siray Client] ---> [Siray Video Model] ---> [Siray Video Player]
                          |
                          +-- prompt: "a cat walking"
```

## Notes

- Model nodes are fetched from Siray's model registry at startup
- Available models may change as new models are added to the platform
- Check [Siray AI](https://siray.ai) for the latest available models and their specific parameters
