# GitHub Workflows

This directory contains automated workflows for the remix-cache repository.

## Workflows

### 🧪 CI (`ci.yml`)

**Triggers**: Push to `main`/`develop`, Pull Requests

**What it does**:
- Runs tests on Node.js 18, 20, and 22
- Runs linter and type checking
- Generates test coverage report
- Verifies package builds correctly
- Uploads coverage to Codecov (optional)

**Requirements**:
- Redis service (automatically started in workflow)
- All tests must pass before merging PRs

### 📦 Publish (`publish.yml`)

**Triggers**:
- GitHub Release created
- Manual workflow dispatch

**What it does**:
- Runs tests to verify quality
- Builds the package
- Publishes to NPM with provenance
- Handles version tags:
  - `v1.0.0` → `latest` tag
  - `v1.0.0-beta.1` → `beta` tag
  - `v1.0.0-alpha.1` → `alpha` tag
  - `v1.0.0-rc.1` → `next` tag

**Requirements**:
- `NPM_TOKEN` secret configured in repository settings
- Valid NPM account with publish permissions

## Setup Instructions

### 1. NPM Token

1. Generate an NPM access token:
   - Go to https://www.npmjs.com/settings/{your-username}/tokens
   - Click "Generate New Token" → "Classic Token"
   - Select "Automation" type
   - Copy the token

2. Add to GitHub secrets:
   - Go to repository Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `NPM_TOKEN`
   - Value: paste your NPM token
   - Click "Add secret"

### 2. Codecov (Optional)

For test coverage reports:

1. Sign up at https://codecov.io
2. Connect your GitHub repository
3. Get your Codecov token
4. Add as GitHub secret: `CODECOV_TOKEN`

If you don't want coverage reports, the workflow will continue without failing.

## Publishing a Release

### Automatic (Recommended)

1. Update version in `package.json`:
   ```bash
   npm version patch  # 0.1.0 → 0.1.1
   npm version minor  # 0.1.0 → 0.2.0
   npm version major  # 0.1.0 → 1.0.0
   ```

2. Push the tag:
   ```bash
   git push --follow-tags
   ```

3. Create a GitHub Release:
   - Go to Releases → Draft a new release
   - Choose the tag you just pushed
   - Add release notes
   - Click "Publish release"

4. The `publish.yml` workflow will automatically:
   - Run tests
   - Build the package
   - Publish to NPM

### Manual

Run the workflow manually from GitHub Actions:
1. Go to Actions → Publish to NPM
2. Click "Run workflow"
3. Enter the version tag (e.g., `v0.1.0`)
4. Click "Run workflow"

## Version Tags

Follow these conventions:

- **Stable releases**: `v1.0.0`, `v1.2.3`
- **Beta releases**: `v1.0.0-beta.1`, `v2.0.0-beta.2`
- **Alpha releases**: `v1.0.0-alpha.1`
- **Release candidates**: `v1.0.0-rc.1`

Users can install pre-release versions:
```bash
npm install remix-cache@beta
npm install remix-cache@alpha
npm install remix-cache@next
```

## Troubleshooting

### CI Failing

**Tests fail**: Check that Redis service is running in the workflow
**Lint errors**: Run `npm run lint` locally to fix issues
**Type errors**: Run `npm run typecheck` locally

### Publish Failing

**NPM_TOKEN invalid**: Regenerate token and update GitHub secret
**Version already exists**: Bump version in package.json
**Tests fail**: Fix failing tests before publishing

### Coverage Upload Failing

This is non-critical. If Codecov token is not set, the workflow continues without uploading coverage.

## Local Testing

Test workflows locally before pushing:

```bash
# Install act (GitHub Actions local runner)
brew install act

# Run CI workflow
act push

# Run publish workflow
act release
```

Note: `act` requires Docker and may not perfectly replicate GitHub's environment.
