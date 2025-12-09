# Siray Client

The Siray Client node is used to configure your API credentials for connecting to Siray AI services.

## Parameters

- **api_key**: Your Siray API key. If left empty, the node will attempt to read the key from `config.ini` in the extension directory.

## Usage

1. Get your API key from [Siray AI](https://siray.ai)
2. Either:
   - Enter your API key directly in the node, or
   - Add it to `config.ini` in the extension folder under `[API]` section:
     ```ini
     [API]
     SIRAY_API_KEY = your_api_key_here
     ```

3. Connect the `client` output to any Siray model node

## Output

- **client**: A client configuration object that must be connected to Siray model nodes to authenticate API requests.

## Example Workflow

```
[Siray Client] ---> [Siray Model Node] ---> [Output]
     |
     +-- api_key: "sk-xxx..."
```
