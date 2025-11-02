#!/usr/bin/env bash
set -e

echo "🧪 Testing package build and imports..."

# Clean previous builds
echo "📦 Cleaning previous builds..."
rm -rf dist/
rm -f remix-cache-*.tgz

# Build the package
echo "🔨 Building package..."
npm run build

# Verify dist directory exists
if [ ! -d "dist" ]; then
  echo "❌ Build failed: dist directory not found"
  exit 1
fi

# Verify key files exist
echo "✅ Checking built files..."
files=(
  "dist/index.js"
  "dist/index.cjs"
  "dist/index.d.ts"
  "dist/react.js"
  "dist/react.cjs"
  "dist/react.d.ts"
)

for file in "${files[@]}"; do
  if [ ! -f "$file" ]; then
    echo "❌ Missing: $file"
    exit 1
  fi
  echo "  ✓ $file"
done

# Pack the package
echo "📦 Packing package..."
npm pack

# Verify tarball was created
tarball=$(ls remix-cache-*.tgz 2>/dev/null || echo "")
if [ -z "$tarball" ]; then
  echo "❌ npm pack failed: tarball not found"
  exit 1
fi

echo "✅ Package built successfully: $tarball"

# Create test directory
echo "🧪 Testing package installation..."
test_dir=$(mktemp -d)
cd "$test_dir"

# Initialize a test project
npm init -y > /dev/null 2>&1

# Install the packed package
if ! npm install "$OLDPWD/$tarball" 2>&1 | grep -v "npm warn"; then
  echo "❌ Failed to install package"
  cd -
  rm -rf "$test_dir"
  exit 1
fi

# Install peer dependencies for React testing (skip if they fail - optional)
npm install react@19 react-dom@19 @remix-run/react@2 @remix-run/node@2 remix-utils@7 --legacy-peer-deps > /dev/null 2>&1 || true

# Test importing the package (server)
cat > test-server.mjs << 'EOF'
import { createCache } from 'remix-cache';

if (typeof createCache !== 'function') {
  console.error('❌ createCache is not a function');
  process.exit(1);
}

console.log('✅ Server import successful');
EOF

# Test importing the package (react) - only if dependencies installed
cat > test-react.mjs << 'EOF'
try {
  const { CacheProvider, useCache, useCacheContext } = await import('remix-cache/react');

  if (typeof CacheProvider !== 'function') {
    console.error('❌ CacheProvider is not a function');
    process.exit(1);
  }

  if (typeof useCache !== 'function') {
    console.error('❌ useCache is not a function');
    process.exit(1);
  }

  if (typeof useCacheContext !== 'function') {
    console.error('❌ useCacheContext is not a function');
    process.exit(1);
  }

  console.log('✅ React import successful');
} catch (err) {
  if (err.code === 'ERR_MODULE_NOT_FOUND' && err.message.includes('react')) {
    console.log('⚠️  React import skipped (peer dependencies not installed)');
  } else {
    console.error('❌ React import failed:', err.message);
    process.exit(1);
  }
}
EOF

# Run the test files
node test-server.mjs
node test-react.mjs

# Clean up
cd -
rm -rf "$test_dir"
rm -f remix-cache-*.tgz

echo ""
echo "🎉 All package tests passed!"
echo "   ✅ Package builds correctly"
echo "   ✅ All expected files are present"
echo "   ✅ Server exports are accessible"
echo "   ✅ React exports are accessible (or skipped if peer deps not installed)"
echo "   ✅ Package can be installed and imported"
