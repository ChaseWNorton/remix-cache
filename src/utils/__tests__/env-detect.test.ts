import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { isServerless, detectMode } from '../env-detect.js'

describe('env-detect', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  describe('isServerless', () => {
    beforeEach(() => {
      delete process.env.AWS_LAMBDA_FUNCTION_NAME
      delete process.env.VERCEL
      delete process.env.NETLIFY
      delete process.env.GOOGLE_CLOUD_FUNCTION_NAME
      delete process.env.CLOUDFLARE_WORKERS
      delete process.env.DENO_DEPLOYMENT_ID
    })

    it('should return false in non-serverless environment', () => {
      expect(isServerless()).toBe(false)
    })

    it('should detect AWS Lambda', () => {
      process.env.AWS_LAMBDA_FUNCTION_NAME = 'my-function'
      expect(isServerless()).toBe(true)
    })

    it('should detect Vercel', () => {
      process.env.VERCEL = '1'
      expect(isServerless()).toBe(true)
    })

    it('should detect Netlify', () => {
      process.env.NETLIFY = 'true'
      expect(isServerless()).toBe(true)
    })

    it('should detect Google Cloud Functions', () => {
      process.env.GOOGLE_CLOUD_FUNCTION_NAME = 'my-function'
      expect(isServerless()).toBe(true)
    })

    it('should detect Cloudflare Workers', () => {
      process.env.CLOUDFLARE_WORKERS = 'true'
      expect(isServerless()).toBe(true)
    })

    it('should detect Deno Deploy', () => {
      process.env.DENO_DEPLOYMENT_ID = 'abc123'
      expect(isServerless()).toBe(true)
    })
  })

  describe('detectMode', () => {
    beforeEach(() => {
      delete process.env.AWS_LAMBDA_FUNCTION_NAME
      delete process.env.VERCEL
      delete process.env.NETLIFY
    })

    it('should return server mode in non-serverless environment', () => {
      expect(detectMode()).toBe('server')
    })

    it('should return serverless mode when serverless is detected', () => {
      process.env.AWS_LAMBDA_FUNCTION_NAME = 'my-function'
      expect(detectMode()).toBe('serverless')
    })
  })
})
