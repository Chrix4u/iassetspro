#!/usr/bin/env bash
# Install the pinned Playwright Chromium browser without running apt.
# ubuntu-24.04 hosted runners already provide the browser's shared-library
# baseline. Running --with-deps triggers a large, unrelated apt transaction;
# Ubuntu mirrors can fail even when our application and tests are healthy.
set -euo pipefail

if [[ "${CI:-}" != "true" || "${RUNNER_OS:-}" != "Linux" ]]; then
  echo "STOP: browser-only installation is restricted to hosted Linux CI."
  exit 2
fi

for attempt in 1 2; do
  echo "Installing pinned Playwright Chromium (attempt ${attempt}/2, no apt mutation)"
  if bunx playwright install chromium; then
    echo "Playwright Chromium browser installed."
    exit 0
  fi
  if [[ "$attempt" == 1 ]]; then
    echo "Chromium download failed; retrying after a short delay."
    sleep 5
  fi
done

echo "STOP: Chromium browser install failed; do not silently skip E2E/UAT." >&2
exit 1
