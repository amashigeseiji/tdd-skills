#!/bin/bash
d=$(pwd)
while [ "$d" != "/" ]; do
  [ -f "$d/.claude/tdd/config.json" ] && echo "$d" && exit 0
  d=$(dirname "$d")
done
exit 1
