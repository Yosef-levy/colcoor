# Installing the Colcoor VSIX

The extension ships as `colcoor-extension-<version>.vsix` inside the release bundle.

## Cursor

1. Open the **Extensions** view.
2. Click the `…` menu on the Extensions title bar.
3. Choose **Install from VSIX…**
4. Select `colcoor-extension-0.0.1.vsix` from the bundle folder.
5. Reload the window when prompted (`Developer: Reload Window`).

## VS Code

Same steps: Extensions → `…` → **Install from VSIX…**

## After install

1. Set **Colcoor: Backend base URL** to your API origin (e.g. `http://localhost:8080`).
2. Open the Colcoor sidebar → **Sign in**.

Command line (optional, if `cursor` CLI is installed):

```bash
cursor --install-extension /path/to/colcoor-extension-0.0.1.vsix
```
