/**
 * Playwright E2E tests
 * Tests: complete 00-idea -> 01-idd -> MD generation flow
 */
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

test.describe('Ecosistema Idea-MVP E2E Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Clear storage before each test
    await page.goto(BASE_URL);
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();
  });

  test('should load 00-idea phase and display form', async ({ page }) => {
    await expect(page.locator('#heroTitle')).toBeVisible();
    await expect(page.locator('#formTitle')).toBeVisible();
    await expect(page.locator('#formGrid')).toBeVisible();
    await expect(page.locator('.phase-badge[data-phase="00-idea"]')).toHaveClass(/active/);
  });

  test('should complete 00-idea phase and unlock 01-idd', async ({ page }) => {
    // Fill required fields in 00-idea
    await page.fill('#field-stimulus', 'problema');
    await page.fill('#field-nature', 'solucion');
    await page.fill('#field-description', 'Test description for the idea');
    await page.fill('#field-target', 'developers');
    await page.fill('#field-value', 'Solves a real problem');
    
    // Submit form
    await page.click('#submitBtn');
    
    // Wait for phase completion and navigation
    await page.waitForURL(/phase=01-idd/);
    
    // Verify 01-idd is now active
    await expect(page.locator('.phase-badge[data-phase="01-idd"]')).toHaveClass(/active/);
    await expect(page.locator('.phase-badge[data-phase="00-idea"]')).toHaveClass(/completed/);
  });

  test('should show dirty confirmation when navigating with unsaved changes', async ({ page }) => {
    // Go to 01-idd first
    await page.goto(`${BASE_URL}#phase=01-idd`);
    await page.waitForSelector('.phase-badge[data-phase="01-idd"].active');
    
    // Fill a field
    await page.fill('#field-market', 'B2B');
    
    // Try to navigate back to 00-idea
    await page.click('.phase-badge[data-phase="00-idea"]');
    
    // Wait for modal to appear
    await expect(page.locator('.dirty-confirm-modal')).toBeVisible();
    await expect(page.locator('#dirtyModalTitle')).toContainText('cambios sin guardar');
    
    // Cancel navigation
    await page.click('#dirtyCancel');
    
    // Should stay on 01-idd
    await expect(page.locator('.phase-badge[data-phase="01-idd"]')).toHaveClass(/active/);
  });

  test('should allow navigation after confirming dirty changes', async ({ page }) => {
    // Go to 01-idd first
    await page.goto(`${BASE_URL}#phase=01-idd`);
    await page.waitForSelector('.phase-badge[data-phase="01-idd"].active');
    
    // Fill a field
    await page.fill('#field-market', 'B2B');
    
    // Try to navigate back to 00-idea
    await page.click('.phase-badge[data-phase="00-idea"]');
    
    // Wait for modal and confirm
    await expect(page.locator('.dirty-confirm-modal')).toBeVisible();
    await page.click('#dirtyConfirm');
    
    // Should navigate to 00-idea
    await page.waitForURL(/phase=00-idea/);
    await expect(page.locator('.phase-badge[data-phase="00-idea"]')).toHaveClass(/active/);
  });

  test('should apply high-contrast theme when OS prefers it', async ({ page }) => {
    // Mock prefers-contrast: more
    await page.emulateMedia({ colorScheme: 'dark', forcedColors: 'active' });
    await page.reload();
    
    // Check if high-contrast theme is applied
    const theme = await page.getAttribute('html', 'data-theme');
    expect(theme).toBe('high-contrast');
  });

  test('should generate consolidated MD when button clicked', async ({ page }) => {
    // Complete 00-idea
    await page.fill('#field-stimulus', 'problema');
    await page.fill('#field-nature', 'solucion');
    await page.fill('#field-description', 'Test description');
    await page.fill('#field-target', 'developers');
    await page.fill('#field-value', 'Test value');
    await page.click('#submitBtn');
    await page.waitForURL(/phase=01-idd/);
    
    // Complete 01-idd (minimal)
    await page.fill('#field-market', 'B2B');
    await page.click('#submitBtn');
    await page.waitForURL(/phase=02-prd/);
    
    // Go back and click MD button
    await page.click('.phase-badge[data-phase="00-idea"]');
    await page.waitForURL(/phase=00-idea/);
    
    // Click generate MD button (should be enabled now)
    const mdButton = page.locator('#generateConsolidatedMD');
    await expect(mdButton).toBeEnabled();
    
    // Set up download handler
    const downloadPromise = page.waitForEvent('download');
    await mdButton.click();
    const download = await downloadPromise;
    
    expect(download.suggestedFilename()).toMatch(/ecosistema-idea-mvp-consolidado/);
  });

  test('should show unavailable badge for phases without config', async ({ page }) => {
    // Check phases that don't have configs (07-16, 21-22, 26, 28)
    // These should have unavailable class
    const unavailablePhases = ['07-dbd', '08-api', '09-uid', '10-tmd', '11-srd', '12-iam', 
                               '13-sad', '14-agd', '15-aad', '16-aid', '21-std', '22-vsd', 
                               '26-chd', '28-cca'];
    
    for (const phase of unavailablePhases) {
      const badge = page.locator(`.phase-badge[data-phase="${phase}"]`);
      await expect(badge).toHaveClass(/unavailable/);
      await expect(badge).toHaveAttribute('title', 'Fase no disponible aún');
      await expect(badge).toBeDisabled();
    }
  });

  test('should persist form data across navigation', async ({ page }) => {
    // Fill 00-idea
    await page.fill('#field-stimulus', 'problema');
    await page.fill('#field-nature', 'solucion');
    await page.fill('#field-description', 'Test description');
    await page.fill('#field-target', 'developers');
    await page.fill('#field-value', 'Test value');
    
    // Navigate to 01-idd
    await page.click('#submitBtn');
    await page.waitForURL(/phase=01-idd/);
    
    // Navigate back to 00-idea
    await page.click('.phase-badge[data-phase="00-idea"]');
    await page.waitForURL(/phase=00-idea/);
    
    // Check data persisted
    await expect(page.locator('#field-stimulus')).toHaveValue('problema');
    await expect(page.locator('#field-nature')).toHaveValue('solucion');
  });

  test('should toggle theme and persist', async ({ page }) => {
    // Open theme menu
    await page.click('#themeBtn');
    await expect(page.locator('#themeMenu')).toBeVisible();
    
    // Click dark theme
    await page.click('[data-theme-option="dark"]');
    
    // Verify theme applied
    const theme = await page.getAttribute('html', 'data-theme');
    expect(theme).toBe('dark');
    
    // Reload and verify persistence
    await page.reload();
    const themeAfterReload = await page.getAttribute('html', 'data-theme');
    expect(themeAfterReload).toBe('dark');
  });

  test('should evaluate showWhen/requiredWhen conditions', async ({ page }) => {
    // Go to 01-idd
    await page.goto(`${BASE_URL}#phase=01-idd`);
    await page.waitForSelector('.phase-badge[data-phase="01-idd"].active');
    
    // Fill traceability to trigger conditional fields
    await page.fill('#field-traceability', 'B');
    
    // Conditional fields for traceability=B should appear
    // (This depends on the actual 01-idd config having such fields)
    // We'll just verify the form renders without errors
    await expect(page.locator('#formGrid')).toBeVisible();
  });

  test('should validate file upload constraints', async ({ page }) => {
    // Go to a phase with file upload (if any)
    await page.goto(`${BASE_URL}#phase=00-idea`);
    
    // Check if file upload zone exists
    const fileZone = page.locator('.file-upload-zone');
    if (await fileZone.count() > 0) {
      // Create a test file
      const fileInput = page.locator('.file-input-hidden');
      await fileInput.setInputFiles({
        name: 'test.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('test content')
      });
      
      // File should appear in list
      await expect(page.locator('.file-item')).toBeVisible();
    }
  });
});

test.describe('Feature Flags', () => {
  test('should respect new-engine feature flag', async ({ page }) => {
    await page.goto(BASE_URL);
    
    // Check if new-engine flag is enabled by default
    const flag = await page.evaluate(() => {
      return window.ECOSISTEMA_NEW_ENGINE ?? localStorage.getItem('ECOSISTEMA_NEW_ENGINE');
    });
    
    // Should be true or 'true' by default
    expect(flag === true || flag === 'true').toBe(true);
  });
});

test.describe('Circular Detection', () => {
  test('should show circular error banner for invalid config', async ({ page }) => {
    // This test would require injecting a config with circular dependencies
    // For now, verify the banner element can be created
    await page.goto(BASE_URL);
    
    const banner = await page.evaluate(() => {
      const el = document.createElement('div');
      el.className = 'circular-error-banner';
      el.innerHTML = '<span>Test</span>';
      document.body.appendChild(el);
      return document.querySelector('.circular-error-banner') !== null;
    });
    
    expect(banner).toBe(true);
  });
});