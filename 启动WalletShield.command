#!/bin/zsh
cd -- "${0:A:h}" || exit 1
walletshield_runtime="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"
if [[ -x "$walletshield_runtime/node" ]]; then
  export PATH="$walletshield_runtime:$PATH"
fi
if [[ ! -d node_modules ]]; then
  npm ci || exit 1
fi
npm run demo
