import { test, expect } from '@playwright/test'

const PAGE = '/e2e/fixture.html'

test('lists seeded tasks in priority order', async ({ page }) => {
  await page.goto(PAGE)
  const rows = page.locator('.task')
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toContainText('Call plumber')
})

test('adds a task', async ({ page }) => {
  await page.goto(PAGE)
  await page.getByRole('button', { name: '+ Add task' }).click()
  await page.fill('.add-input', 'Water plants @home')
  await page.getByRole('button', { name: 'Priority' }).click()
  await page.getByRole('button', { name: '(B)' }).click()
  await page.press('.add-input', 'Enter')
  await expect(page.locator('.modal')).toHaveCount(0)
  await expect(page.locator('.task')).toHaveCount(3)
  // The (B) chosen in the modal reaches the file, so a (B) filter chip appears.
  await expect(page.locator('.sidebar .chip', { hasText: '(B)' })).toBeVisible()
  await expect(page.locator('.task', { hasText: 'Water plants' })).toBeVisible()
})

test('completes a task and hides it', async ({ page }) => {
  await page.goto(PAGE)
  await page.locator('.task', { hasText: 'Buy milk' }).locator('.task__check').click()
  await expect(page.locator('.task')).toHaveCount(1)
})

test('filters by project chip', async ({ page }) => {
  await page.goto(PAGE)
  await page.locator('.chip', { hasText: '+house' }).click()
  await expect(page.locator('.task')).toHaveCount(1)
  await expect(page.locator('.task').first()).toContainText('Call plumber')
})

test('searches', async ({ page }) => {
  await page.goto(PAGE)
  await page.fill('.search', 'milk')
  await expect(page.locator('.task')).toHaveCount(1)
})

test('edits a task inline', async ({ page }) => {
  await page.goto(PAGE)
  await page.locator('.task', { hasText: 'Buy milk' }).locator('.task__text').click()
  const editor = page.locator('.task__editor')
  await editor.fill('Buy oat milk +groceries')
  await editor.press('Enter')
  await expect(page.locator('.task', { hasText: 'Buy oat milk' })).toBeVisible()
})

test('archives completed tasks', async ({ page }) => {
  await page.goto(PAGE)
  await page.locator('.task', { hasText: 'Buy milk' }).locator('.task__check').click()
  await page.getByRole('button', { name: 'Archive completed', exact: true }).click()
  await page.getByRole('button', { name: 'Show completed', exact: true }).click()
  await expect(page.locator('.task')).toHaveCount(1)
})
