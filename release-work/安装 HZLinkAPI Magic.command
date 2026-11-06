#!/bin/bash
set -eu
package_dir="$(cd -P -- "$(dirname -- "$0")" && pwd)"
machine="$(/usr/bin/uname -m)"
case "$machine" in
  arm64) node_arch=arm64 ;;
  x86_64) node_arch=x64 ;;
  *) echo '当前 Mac 的处理器不受支持。'; exit 1 ;;
esac
exec "$package_dir/runtime/$node_arch/node" "$package_dir/install.mjs"
