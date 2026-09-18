#!/usr/bin/env python3
"""Append a directory tree into an existing VSIX under the given archive prefix."""
from __future__ import annotations

import argparse
import os
import zipfile


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("vsix", help="Path to the .vsix file to update in place")
    parser.add_argument("source_dir", help="Local directory whose files are added to the VSIX")
    parser.add_argument(
        "archive_prefix",
        help="Archive path prefix inside the VSIX (e.g. extension/node_modules/@anthropic-ai)",
    )
    args = parser.parse_args()

    source = os.path.abspath(args.source_dir)
    if not os.path.isdir(source):
        raise SystemExit(f"Source directory not found: {source}")

    prefix = args.archive_prefix.rstrip("/") + "/"
    count = 0
    with zipfile.ZipFile(args.vsix, "a", compression=zipfile.ZIP_DEFLATED) as archive:
        for dirpath, _, files in os.walk(source):
            for filename in files:
                abs_path = os.path.join(dirpath, filename)
                rel = os.path.relpath(abs_path, source).replace("\\", "/")
                archive.write(abs_path, prefix + rel)
                count += 1

    print(f"Injected {count} files into {args.vsix}")


if __name__ == "__main__":
    main()
