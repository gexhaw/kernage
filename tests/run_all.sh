#!/bin/sh
# Build, then run every check. Exit code is non-zero if anything fails.
set -e
cd "$(dirname "$0")/.."
python3 tools/build.py
python3 tools/check_i18n.py
python3 tests/test_export.py
python3 tests/test_ui.py
echo "Everything passed."
