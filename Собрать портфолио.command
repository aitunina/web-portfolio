#!/bin/zsh
cd -- "${0:A:h}"
if [[ -x .venv/bin/python ]]; then
  .venv/bin/python scripts/build.py
elif [[ -x /Users/alexandraitunina/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 ]]; then
  /Users/alexandraitunina/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 scripts/build.py
else
  python3 scripts/build.py
fi
