#!/bin/sh
set -eu

REPO=/root/Firefly

get_repo_path() {
  remote_url=$(git remote get-url origin 2>/dev/null || true)
  case "$remote_url" in
    git@github.com:*.git)
      repo_path=${remote_url#git@github.com:}
      repo_path=${repo_path%.git}
      ;;
    https://github.com/*)
      repo_path=${remote_url#https://github.com/}
      repo_path=${repo_path%.git}
      ;;
    ssh://git@github.com/*)
      repo_path=${remote_url#ssh://git@github.com/}
      repo_path=${repo_path%.git}
      ;;
    *)
      repo_path="Kafureoon/-"
      ;;
  esac
  printf '%s\n' "$repo_path"
}

get_site_base() {
  repo_path=$1
  owner=${repo_path%%/*}
  repo=${repo_path#*/}
  if [ "$repo" = "${owner}.github.io" ]; then
    printf 'https://%s.github.io/\n' "$owner"
  else
    printf 'https://%s.github.io/%s/\n' "$owner" "$repo"
  fi
}

print_publish_report() {
  repo_path=$1
  commit_sha=$2
  site_base=$(get_site_base "$repo_path")

  echo "[firefly] published=yes"
  echo "[firefly] repo=$repo_path"
  echo "[firefly] commit_sha=$commit_sha"
  echo "[firefly] commit_short=$(printf '%s' "$commit_sha" | cut -c1-7)"
  echo "[firefly] homepage=$site_base"
  echo "[firefly] rss_page=${site_base}rss/"
  echo "[firefly] rss_xml=${site_base}rss.xml"
  echo "[firefly] github_commit=https://github.com/$repo_path/commit/$commit_sha"
}

cd "$REPO"
if [ $# -gt 0 ]; then
  MESSAGE="$*"
else
  MESSAGE="chore: publish firefly customizer $(date '+%Y-%m-%d %H:%M:%S')"
fi

git add -- \
  data/admin \
  tools/firefly-customizer \
  src/config/FooterConfig.html \
  src/config/customizerState.ts \
  src/config/siteConfig.ts \
  src/config/profileConfig.ts \
  src/config/musicConfig.ts \
  src/config/backgroundWallpaper.ts \
  src/config/announcementConfig.ts \
  src/config/footerConfig.ts \
  src/config/sakuraConfig.ts \
  src/config/pioConfig.ts \
  src/config/navBarConfig.ts \
  src/config/coverImageConfig.ts \
  src/config/licenseConfig.ts \
  src/config/sponsorConfig.ts \
  src/config/fontConfig.ts \
  src/config/adConfig.ts \
  src/assets/images/customizer \
  src/assets/images/DesktopWallpaper \
  src/assets/images/MobileWallpaper \
  public/assets/music \
  public/assets/music/cover

if git diff --cached --quiet; then
  echo "[firefly] no staged customizer changes to publish"
  exit 0
fi

git commit -m "$MESSAGE"
git push origin HEAD
COMMIT_SHA=$(git rev-parse HEAD)
REPO_PATH=$(get_repo_path)
print_publish_report "$REPO_PATH" "$COMMIT_SHA"
