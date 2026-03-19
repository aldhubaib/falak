#!/bin/bash
REASON=${1:-"infrastructure change"}
echo "📄 Saving ARCHITECTURE.md..."
git add docs/ARCHITECTURE/ARCHITECTURE.md
echo "💾 Committing..."
git commit -m "docs: update ARCHITECTURE.md — $REASON"
echo "🚀 Pushing to GitHub..."
git push origin main
echo "✅ Done — ARCHITECTURE.md is live on GitHub"
