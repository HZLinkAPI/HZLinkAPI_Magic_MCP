"""Package staged releases with Unix executable permissions, including on Windows."""

import argparse
import os
from pathlib import Path
import stat
import tempfile
import zipfile


def package(platform, destination):
    root = Path(__file__).resolve().parent
    if platform == "macos":
        base = root / "release-work"
        stage = base / "stage" / "HZLinkAPI Magic"
        launcher = "安装 HZLinkAPI Magic.command"
        runtimes = [f"runtime/{arch}/node" for arch in ("arm64", "x64")]
    else:
        base = root / "release-windows"
        stage = base / "stage" / "HZLinkAPI Magic Windows"
        launcher = "Install HZLinkAPI Magic.cmd"
        runtimes = [f"runtime/{arch}/{binary}" for arch in ("x64", "arm64")
                    for binary in ("node.exe", "magic-native.exe")]

    required = [launcher, "安装说明.txt", "install.mjs", "server.mjs", "dist/widget.html", *runtimes]
    files = [stage / name for name in required]
    licenses = sorted((stage / "licenses").rglob("*"))
    if not any(path.is_file() for path in licenses):
        raise ValueError("Missing release licenses")
    files.extend(path for path in licenses if path.is_file())
    for path in files:
        if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(stage.resolve()):
            raise ValueError(f"Missing or unsafe release file: {path}")

    destination = Path(destination) if destination else base / f"HZLinkAPI-Magic-{'macOS' if platform == 'macos' else 'Windows'}.zip"
    destination = destination.resolve()
    if destination.is_relative_to(stage.resolve()):
        raise ValueError("ZIP destination must be outside the staged package")
    destination.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(prefix=destination.name + ".", suffix=".tmp", dir=destination.parent)
    os.close(handle)
    try:
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            for path in files:
                relative = path.relative_to(stage).as_posix()
                executable = platform == "macos" and relative in [launcher, *runtimes]
                entry = zipfile.ZipInfo.from_file(path, arcname=f"{stage.name}/{relative}")
                entry.create_system = 3
                entry.external_attr = (stat.S_IFREG | (0o755 if executable else 0o644)) << 16
                entry.compress_type = zipfile.ZIP_DEFLATED
                with path.open("rb") as source, archive.open(entry, "w") as target:
                    while chunk := source.read(1024 * 1024):
                        target.write(chunk)
        os.replace(temporary, destination)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print(f"Packaged {platform}: {destination} ({destination.stat().st_size:,} bytes)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("platform", choices=("macos", "windows"))
    parser.add_argument("destination", nargs="?")
    args = parser.parse_args()
    package(args.platform, args.destination)
