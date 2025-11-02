# Contributing to remix-cache

Thanks for your interest in contributing to remix-cache! This document provides guidelines for contributing.

## Development Setup

### Prerequisites

- Node.js 18+
- Redis 6+
- npm or pnpm

### Getting Started

1. **Fork and clone the repository**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/remix-cache.git
   cd remix-cache
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start Redis** (required for tests):
   ```bash
   # Using Docker
   docker run -d -p 6379:6379 redis:7-alpine

   # Or using Homebrew (macOS)
   brew services start redis
   ```

4. **Run tests**:
   ```bash
   npm test
   ```

5. **Run tests in watch mode**:
   ```bash
   npm run test:watch
   ```

## Development Workflow

### Making Changes

1. **Create a branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**

3. **Run tests**:
   ```bash
   npm test
   ```

4. **Run linter**:
   ```bash
   npm run lint
   ```

5. **Run type checking**:
   ```bash
   npm run typecheck
   ```

6. **Format code**:
   ```bash
   npm run format
   ```

### Testing

- **Write tests for all new features**
- **Maintain 100% test coverage** (current: 143/143 passing)
- **Follow TDD approach**: Write tests first, then implementation
- **Test files**: Place in `__tests__` directory next to source files
- **Close connections**: Always call `cache.close()` in `afterEach()` hooks

Example test structure:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createCache } from '../cache'

describe('Feature name', () => {
  let cache

  beforeEach(() => {
    cache = createCache({
      redis: { host: 'localhost', port: 6379 },
      prefix: `test-${Math.random().toString(36)}`,
    })
  })

  afterEach(async () => {
    await cache.close() // IMPORTANT!
  })

  it('should do something', async () => {
    // Your test
  })
})
```

### Code Style

- **TypeScript**: All code must be written in TypeScript
- **ESLint**: Follow the configured ESLint rules
- **Prettier**: Code is auto-formatted with Prettier
- **Type safety**: Maintain perfect type inference
- **Naming conventions**:
  - `camelCase` for variables and functions
  - `PascalCase` for classes and types
  - Descriptive names (avoid abbreviations)

### Commit Messages

Follow conventional commits format:

```
type(scope): description

[optional body]

[optional footer]
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `test`: Adding or updating tests
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `chore`: Maintenance tasks

**Examples**:
```
feat(cache): add sliding window TTL support
fix(invalidation): correct pattern matching for nested keys
docs(readme): update installation instructions
test(cache): add tests for stale-while-revalidate
```

## Pull Request Process

1. **Update documentation** if needed
2. **Add tests** for new features
3. **Ensure all tests pass**: `npm test`
4. **Ensure linting passes**: `npm run lint`
5. **Ensure type checking passes**: `npm run typecheck`
6. **Update README** if adding new features
7. **Update CHANGELOG** (if exists)

### PR Guidelines

- **One feature per PR**: Keep PRs focused on a single change
- **Write descriptive PR titles**: Use conventional commit format
- **Add context in PR description**: Explain what, why, and how
- **Link related issues**: Reference any related GitHub issues
- **Respond to feedback**: Be open to suggestions and changes

## Project Structure

```
src/
├── server/           # Server-side cache implementation
│   ├── cache.ts      # Main cache class
│   ├── definition.ts # Cache definition implementation
│   ├── __tests__/    # Server-side tests
│   └── ...
├── react/            # React integration
│   ├── provider.tsx  # CacheProvider component
│   ├── use-cache.ts  # useCache hook
│   ├── __tests__/    # React tests
│   └── ...
├── types/            # TypeScript type definitions
├── utils/            # Utility functions
└── index.ts          # Main entry point
```

## Adding New Features

### Before Starting

1. **Check existing issues**: Look for related discussions
2. **Open an issue**: Discuss the feature before implementation
3. **Get feedback**: Ensure the feature aligns with project goals

### Implementation Checklist

- [ ] Write tests (TDD approach)
- [ ] Implement feature
- [ ] Add TypeScript types
- [ ] Update documentation
- [ ] Add examples to skill documentation
- [ ] Ensure backward compatibility
- [ ] Update CHANGELOG

## Bug Reports

### Before Reporting

1. **Search existing issues**: Check if bug already reported
2. **Verify it's a bug**: Ensure it's not a configuration issue
3. **Check latest version**: Update to latest version first

### Bug Report Template

```markdown
## Description
Clear description of the bug

## Steps to Reproduce
1. Step one
2. Step two
3. ...

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Environment
- remix-cache version:
- Node.js version:
- Redis version:
- Operating System:
- Remix version:

## Additional Context
Any other relevant information
```

## Feature Requests

### Feature Request Template

```markdown
## Problem
What problem does this solve?

## Proposed Solution
How should this be implemented?

## Alternatives
What alternatives have you considered?

## Additional Context
Any other relevant information
```

## Questions?

- **Discussions**: Use GitHub Discussions for questions
- **Chat**: Join our Discord (if available)
- **Issues**: Open an issue for bug reports

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow
- Assume good intentions

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Recognition

Contributors will be recognized in the README and release notes.

Thank you for contributing! 🎉
