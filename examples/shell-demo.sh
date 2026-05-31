#!/usr/bin/env sh
set -eu

unipet start
unipet state running "Reading project context" --source shell-demo --ttl 8s
sleep 1
unipet state running "Running tests" --source shell-demo --ttl 8s
sleep 1
unipet state waiting "Waiting for approval" --source shell-demo --ttl 8s
sleep 1
unipet state review "Ready for review" --source shell-demo --ttl 12s
