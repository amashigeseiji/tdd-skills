#!/bin/bash
d=$(pwd)
while [ "$d" != "/" ]; do
  [ -f "$d/.claude/tdd/config.json" ] && cat "$d/.claude/tdd/config.json" && break
  d=$(dirname "$d")
done
