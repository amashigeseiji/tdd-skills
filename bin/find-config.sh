#!/bin/bash
# Usage:
#   find-config.sh             -> <meta> のパスを1行出力（従来互換）
#   find-config.sh <project>   -> META= / WORK_REPO= / PLANS_DIR= の3行を出力
#
# <project> 指定時は problem.md の **作業レポジトリ:**（名前）から作業リポジトリの
# 絶対パスを解決する。解決順:
#   1. フィールドなし -> META と同じ（単一レポ構成）
#   2. <meta>/<名前> が存在 -> それ
#   3. <meta>/.claude/tdd/config.local.json の repos.<名前>（マシンごと・git 非追跡）
#   4. 旧フィールド **作業ディレクトリ:**（絶対パス）が実在すればそれ（移行を stderr で促す）
#   5. いずれも不可 -> WORK_REPO=UNRESOLVED:<名前>（呼び出し側がユーザーに聞いて
#      config.local.json に保存する）

meta=""
d=$(pwd)
while [ "$d" != "/" ]; do
  [ -f "$d/.claude/tdd/config.json" ] && meta="$d" && break
  d=$(dirname "$d")
done
[ -z "$meta" ] && exit 1

project="$1"
if [ -z "$project" ]; then
  echo "$meta"
  exit 0
fi

problem="$meta/plans/$project/problem.md"
if [ ! -f "$problem" ]; then
  echo "problem.md が見つかりません: $problem" >&2
  exit 2
fi

field() {
  grep "^\*\*$1:" "$problem" | head -1 | sed "s/^\*\*$1:\*\*[[:space:]]*//" | sed 's/[[:space:]]*$//'
}

repo_name=$(field "作業レポジトリ")
legacy_workdir=$(field "作業ディレクトリ")

work_repo=""
if [ -z "$repo_name" ]; then
  work_repo="$meta"
elif [ -d "$meta/$repo_name" ]; then
  work_repo="$meta/$repo_name"
else
  local_cfg="$meta/.claude/tdd/config.local.json"
  if [ -f "$local_cfg" ]; then
    work_repo=$(node -e '
      try {
        const c = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))
        const p = (c.repos || {})[process.argv[2]]
        if (p) process.stdout.write(p)
      } catch (e) {}
    ' "$local_cfg" "$repo_name")
    [ -n "$work_repo" ] && [ ! -d "$work_repo" ] && {
      echo "config.local.json の repos.$repo_name が実在しません: $work_repo" >&2
      work_repo=""
    }
  fi
  if [ -z "$work_repo" ] && [ -n "$legacy_workdir" ] && [ -d "$legacy_workdir" ]; then
    work_repo="$legacy_workdir"
    echo "注意: 旧フィールド **作業ディレクトリ:** で解決しました。config.local.json への移行を推奨します（フィールドは廃止済み）" >&2
  fi
  [ -z "$work_repo" ] && work_repo="UNRESOLVED:$repo_name"
fi

echo "META=$meta"
echo "WORK_REPO=$work_repo"
echo "PLANS_DIR=$meta/plans/$project"
