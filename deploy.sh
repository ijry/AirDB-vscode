#!/usr/bin/env sh

nvm use 16

npm run build

nvm use 20

vsce publish
