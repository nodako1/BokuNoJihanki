#!/usr/bin/env bash

set -euo pipefail

if [[ -z "${DISPLAY:-}" ]]; then
  echo "DISPLAY must be provided by xvfb-run." >&2
  exit 1
fi

command -v openbox >/dev/null
command -v xprop >/dev/null
command -v xdotool >/dev/null

artifact_root="${BROWSER_ARTIFACT_DIR:-diagnostics/browser-smoke}"
mkdir -p "$artifact_root"
window_manager_log="$artifact_root/window-manager.log"
environment_log="$artifact_root/window-manager-environment.txt"
native_visibility_policy="$artifact_root/playwright-native-visibility.json"

node scripts/prepare-playwright-native-visibility.mjs \
  --artifact "$native_visibility_policy"

if [[ "${M15_GOOGLE_CHROME_VERSION:-}" != "150.0.7871.186" ]]; then
  echo "M15_GOOGLE_CHROME_VERSION must identify pinned Chrome 150.0.7871.186." >&2
  exit 1
fi
if [[ "${M15_GOOGLE_CHROME_PACKAGE_VERSION:-}" != "150.0.7871.186-1" ]]; then
  echo "M15_GOOGLE_CHROME_PACKAGE_VERSION must identify the pinned package." >&2
  exit 1
fi
if [[ "${M15_GOOGLE_CHROME_ELF_BYTES:-}" != "280960248" ]]; then
  echo "M15_GOOGLE_CHROME_ELF_BYTES must identify the pinned Chrome ELF." >&2
  exit 1
fi
if [[ "${M15_GOOGLE_CHROME_ELF_SHA256:-}" != \
  "47e00a55c9e412ccb3b5a128fdf3b34378faecb0190b293829ddee28c6d8659e" ]]; then
  echo "M15_GOOGLE_CHROME_ELF_SHA256 must identify the pinned Chrome ELF." >&2
  exit 1
fi
if [[ ! -x "${BROWSER_EXECUTABLE_PATH:-}" ]]; then
  echo "BROWSER_EXECUTABLE_PATH must identify the pinned Google Chrome ELF." >&2
  exit 1
fi
actual_browser_sha256="$(
  sha256sum "$BROWSER_EXECUTABLE_PATH" | cut -d ' ' -f 1
)"
actual_browser_bytes="$(stat -c '%s' "$BROWSER_EXECUTABLE_PATH")"
if [[ "$actual_browser_bytes" != "$M15_GOOGLE_CHROME_ELF_BYTES" ]] \
  || [[ "${BROWSER_EXECUTABLE_SHA256:-}" != \
    "$M15_GOOGLE_CHROME_ELF_SHA256" ]] \
  || [[ "$actual_browser_sha256" != "$M15_GOOGLE_CHROME_ELF_SHA256" ]]; then
  echo "BROWSER_EXECUTABLE_SHA256 does not match the Google Chrome ELF." >&2
  exit 1
fi
actual_browser_version="$(
  "$BROWSER_EXECUTABLE_PATH" --version | sed -E 's/[[:space:]]+$//'
)"
if [[ "$actual_browser_version" != \
  "Google Chrome $M15_GOOGLE_CHROME_VERSION" ]]; then
  echo "The selected Google Chrome version is not pinned." >&2
  exit 1
fi
if [[ "$(
  dpkg-query --show --showformat='${Version}' google-chrome-stable
)" != "$M15_GOOGLE_CHROME_PACKAGE_VERSION" ]]; then
  echo "The installed Google Chrome package version is not pinned." >&2
  exit 1
fi

{
  printf 'display=%s\n' "$DISPLAY"
  printf 'runnerOsImage=%s\n' "${M15_RUNNER_OS_IMAGE:-}"
  printf 'japaneseFontMatch=%s\n' "${M15_JAPANESE_FONT_MATCH:-}"
  printf 'japaneseFontFile=%s\n' "${M15_JAPANESE_FONT_FILE:-}"
  printf 'japaneseFontPackageVersion=%s\n' \
    "${M15_JAPANESE_FONT_PACKAGE_VERSION:-}"
  printf 'japaneseFontSha256=%s\n' "${M15_JAPANESE_FONT_SHA256:-}"
  printf 'googleChromeVersion=%s\n' "$M15_GOOGLE_CHROME_VERSION"
  printf 'googleChromePackageVersion=%s\n' \
    "$M15_GOOGLE_CHROME_PACKAGE_VERSION"
  printf 'browserExecutablePath=%s\n' "$BROWSER_EXECUTABLE_PATH"
  printf 'browserExecutableBytes=%s\n' "$actual_browser_bytes"
  printf 'browserExecutableSha256=%s\n' "$BROWSER_EXECUTABLE_SHA256"
  printf 'playwrightNativeVisibilityPolicy=%s\n' \
    "$native_visibility_policy"
  printf 'xdotoolPath=%s\n' "$(command -v xdotool)"
  xdotool version
  if [[ -r /etc/os-release ]]; then
    sed -n '1,80p' /etc/os-release
  fi
  openbox --version
  if command -v fc-match >/dev/null; then
    fc-match 'sans-serif:lang=ja' || true
  fi
  if command -v dpkg-query >/dev/null; then
    dpkg-query --show \
      --showformat='${binary:Package}\t${Version}\n' \
      fontconfig fonts-noto-cjk openbox xdotool x11-utils xvfb || true
  fi
  if command -v Xvfb >/dev/null; then
    Xvfb -version 2>&1 || true
  fi
} >"$environment_log" 2>&1

if [[ "${M15_RUNNER_OS_IMAGE:-}" != "ubuntu-24.04" ]]; then
  echo "M15_RUNNER_OS_IMAGE must identify the pinned ubuntu-24.04 image." >&2
  exit 1
fi
if [[ "${M15_JAPANESE_FONT_MATCH:-}" != "Noto Sans CJK JP" ]]; then
  echo "M15_JAPANESE_FONT_MATCH must resolve to Noto Sans CJK JP." >&2
  exit 1
fi
if [[ ! "${M15_JAPANESE_FONT_SHA256:-}" =~ ^[0-9a-f]{64}$ ]]; then
  echo "M15_JAPANESE_FONT_SHA256 must be a complete SHA-256." >&2
  exit 1
fi

openbox --sm-disable >"$window_manager_log" 2>&1 &
window_manager_pid=$!

cleanup_window_manager() {
  kill "$window_manager_pid" 2>/dev/null || true
  wait "$window_manager_pid" 2>/dev/null || true
}
trap cleanup_window_manager EXIT

window_manager_ready=false
window_manager_window_id=
for _attempt in $(seq 1 100); do
  if ! kill -0 "$window_manager_pid" 2>/dev/null; then
    break
  fi
  root_support_property="$(
    xprop -root _NET_SUPPORTING_WM_CHECK 2>/dev/null || true
  )"
  if [[ "$root_support_property" =~ window\ id\ \#\ (0x[0-9a-fA-F]+) ]]; then
    candidate_window_id="${BASH_REMATCH[1]}"
    window_support_property="$(
      xprop -id "$candidate_window_id" \
        _NET_SUPPORTING_WM_CHECK 2>/dev/null || true
    )"
    if [[ "$window_support_property" =~ window\ id\ \#\ (0x[0-9a-fA-F]+) ]]; then
      candidate_support_window_id="${BASH_REMATCH[1]}"
    else
      candidate_support_window_id=
    fi
    window_name_property="$(
      xprop -id "$candidate_window_id" _NET_WM_NAME 2>/dev/null || true
    )"
  else
    candidate_window_id=
    candidate_support_window_id=
    window_support_property=
    window_name_property=
  fi
  if kill -0 "$window_manager_pid" 2>/dev/null \
    && [[ -n "$candidate_window_id" ]] \
    && [[ "$candidate_support_window_id" == "$candidate_window_id" ]] \
    && [[ "$window_name_property" == *"Openbox"* ]]; then
    window_manager_ready=true
    window_manager_window_id="$candidate_window_id"
    break
  fi
  sleep 0.1
done

if [[ "$window_manager_ready" != true ]]; then
  echo "Openbox did not publish _NET_SUPPORTING_WM_CHECK." >&2
  sed -n '1,160p' "$window_manager_log" >&2
  exit 1
fi

{
  printf 'supportWindowId=%s\n' "$window_manager_window_id"
  xprop -root _NET_SUPPORTING_WM_CHECK
  xprop -id "$window_manager_window_id" \
    _NET_SUPPORTING_WM_CHECK _NET_WM_NAME
} >>"$environment_log" 2>&1

if [[ "$#" -eq 0 ]]; then
  smoke_command=(node scripts/browser-smoke.mjs)
else
  smoke_command=("$@")
fi

set +e
"${smoke_command[@]}"
smoke_status=$?
set -e
exit "$smoke_status"
