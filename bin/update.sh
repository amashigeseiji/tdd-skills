#!/bin/bash
set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SKILLS_DIR="$HOME/.claude/skills"

echo "tdd-skills を更新中..."
cd "$REPO_DIR"
git pull

echo ""
echo "新規スキルを確認中..."

added=0
for dir in "$REPO_DIR"/*/; do
  skill_name=$(basename "$dir")
  if [ ! -f "$dir/skill.md" ]; then
    continue
  fi
  if [ ! -e "$SKILLS_DIR/$skill_name" ]; then
    ln -s "$dir" "$SKILLS_DIR/$skill_name"
    echo "  新規登録: $skill_name"
    added=$((added + 1))
  fi
done

if [ "$added" -eq 0 ]; then
  echo "  変更なし（新規スキルはありませんでした）"
fi

echo ""
echo "更新完了"
