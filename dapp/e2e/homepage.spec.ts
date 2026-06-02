import { test, expect } from '@playwright/test'

test.describe('Hathor dApp Homepage', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to homepage
    await page.goto('/')
  })

  test('should load homepage successfully', async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle(/Hathor dApp/i)

    // Check main heading is visible
    const heading = page.getByRole('heading', { level: 1 })
    await expect(heading).toBeVisible()
  })

  test('should display main template components', async ({ page }) => {
    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle')

    // Check that key UI elements are present
    const pageContent = await page.textContent('body')
    expect(pageContent).toBeTruthy()

    // The page should render without errors
    const errors: Error[] = []
    page.on('pageerror', error => errors.push(error))
    await page.waitForTimeout(1000)
    expect(errors).toHaveLength(0)
  })

  test('should display wallet connection button', async ({ page }) => {
    // Look for wallet connect button
    const connectButton = page.getByRole('button', { name: /connect/i })
    await expect(connectButton).toBeVisible()
  })

  test('should display getting started guide', async ({ page }) => {
    // Check for getting started section
    const gettingStarted = page.getByText('Getting Started')
    await expect(gettingStarted).toBeVisible()
  })

  test('should display welcome message', async ({ page }) => {
    // Check for welcome message
    const welcomeText = page.getByText('Welcome to Your Hathor dApp')
    await expect(welcomeText).toBeVisible()
  })

  test('should be responsive', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    await page.waitForLoadState('networkidle')

    const body = page.locator('body')
    await expect(body).toBeVisible()

    // Test desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.waitForLoadState('networkidle')
    await expect(body).toBeVisible()
  })

  test('should not have console errors', async ({ page }) => {
    const consoleErrors: string[] = []

    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    // Filter out expected errors (e.g., from mock wallet setup)
    const unexpectedErrors = consoleErrors.filter(error =>
      !error.includes('WalletConnect') &&
      !error.includes('MetaMask') &&
      !error.includes('mock')
    )

    expect(unexpectedErrors).toHaveLength(0)
  })

  test('should have working navigation', async ({ page }) => {
    await page.waitForLoadState('networkidle')

    // Check that the app is interactive
    const body = page.locator('body')
    const isInteractive = await body.isEnabled()
    expect(isInteractive).toBe(true)
  })
})

test.describe('Mock Wallet Integration', () => {
  test('should work with mock wallet enabled', async ({ page }) => {
    // The app should be in mock mode based on environment variable
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // The page should render without crashing
    const content = await page.textContent('body')
    expect(content).toBeTruthy()
    expect(content!.length).toBeGreaterThan(0)
  })

  test('should display balance section', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Give time for any initial data loading
    await page.waitForTimeout(2000)

    // Check if balance card is rendered
    const balanceText = page.getByText('YOUR BALANCE')
    await expect(balanceText).toBeVisible()
  })
})

test.describe('Resources Section', () => {
  test('should display resource links', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Check for resources section
    const resources = page.getByText('Resources')
    await expect(resources).toBeVisible()

    // Check for Hathor documentation link
    const docsLink = page.getByRole('link', { name: /Hathor Documentation/i })
    await expect(docsLink).toBeVisible()
  })
})
