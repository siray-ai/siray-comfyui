# Siray Video Player

The Siray Video Player node allows you to preview generated videos directly within ComfyUI.

## Parameters

- **video_url**: The URL of the video to preview. This is typically the output URL from a Siray video generation model.

## Usage

1. Connect the `video_url` output from any Siray video generation node to this node's input
2. Run the workflow
3. The video will be displayed in the node's preview panel

## Example Workflow

```
[Siray Client] ---> [Siray Video Model] ---> [Siray Video Player]
                          |
                          +-- video_url ------>
```

## Notes

- The video URL must be a valid, accessible URL
- Supports standard video formats (MP4, WebM, etc.)
- The video player includes playback controls for play/pause and seeking
