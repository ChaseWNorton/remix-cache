/**
 * Detect if running in a serverless environment
 */
export function isServerless(): boolean {
  return !!(
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.VERCEL ||
    process.env.NETLIFY ||
    process.env.GOOGLE_CLOUD_FUNCTION_NAME ||
    process.env.CLOUDFLARE_WORKERS ||
    process.env.DENO_DEPLOYMENT_ID
  )
}

/**
 * Detect operating mode
 */
export function detectMode(): 'server' | 'serverless' {
  return isServerless() ? 'serverless' : 'server'
}
