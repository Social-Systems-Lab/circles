#!/usr/bin/env bash
set -euo pipefail

cd ~/apps/peerify/circles

echo "Cleaning old build..."
rm -rf .next

echo "Building Peerify..."
npm run build

echo "Copying standalone assets..."
mkdir -p .next/standalone/.next

rm -rf .next/standalone/.next/static
cp -r .next/static .next/standalone/.next/static

rm -rf .next/standalone/public
cp -r public .next/standalone/public

echo "Restarting PM2..."
pm2 restart peerify --update-env

echo "Peerify deployed."
