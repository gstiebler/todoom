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

test('edits a task in its modal', async ({ page }) => {
  await page.goto(PAGE)
  await page.locator('.task', { hasText: 'Buy milk' }).locator('.task__text').click()
  const modal = page.locator('.task-modal')
  await modal.locator('.task-modal__title').fill('Buy oat milk')
  await modal.locator('.task-modal__note').fill('the barista one')
  await modal.locator('.field--priority .field__value').click()
  await modal.getByRole('button', { name: '(B)', exact: true }).click()
  await modal.locator('.task-modal__close').click()

  const row = page.locator('.task', { hasText: 'Buy oat milk' })
  await expect(row).toContainText('the barista one')
  await expect(row).toContainText('+groceries')
  await expect(row.locator('.task__check')).toHaveClass(/task__check--b/)
})

test('archives completed tasks', async ({ page }) => {
  await page.goto(PAGE)
  await page.locator('.task', { hasText: 'Buy milk' }).locator('.task__check').click()
  await page.getByRole('button', { name: 'Archive completed', exact: true }).click()
  await page.getByRole('button', { name: 'Show completed', exact: true }).click()
  await expect(page.locator('.task')).toHaveCount(1)
})

test('attaches a file to a task', async ({ page }) => {
  await page.goto(PAGE)
  const row = page.locator('.task', { hasText: 'Buy milk' })
  await row.locator('.task__attach').click()
  await page.setInputFiles('.attachment__picker', 'e2e/files/recipe.txt')
  await expect(page.locator('.attachment')).toHaveText(/recipe.txt/)
  await expect(row.locator('.task__attach')).toHaveText('1')
})

test('makes a task wait on another', async ({ page }) => {
  await page.goto(PAGE)
  await page.locator('.task', { hasText: 'Buy milk' }).locator('.task__text').click()
  const modal = page.locator('.task-modal')
  await modal.locator('.field--deps .field__value').click()
  await modal.locator('.dep-option', { hasText: 'Call plumber' }).click()
  await expect(modal.locator('.field--deps .field__value')).toHaveText('Call plumber')
  await modal.locator('.task-modal__close').click()

  const row = page.locator('.task', { hasText: 'Buy milk' })
  await expect(row).toHaveClass(/task--blocked/)
  await expect(row.locator('.task__blocked')).toHaveText('Waiting on Call plumber')

  // The waiting row now mentions the plumber too, so pick the row by its title.
  await page
    .locator('.task', { has: page.locator('.task__text', { hasText: 'Call plumber' }) })
    .locator('.task__check')
    .click()
  await expect(row).not.toHaveClass(/task--blocked/)
})

test('sets a deadline on a task', async ({ page }) => {
  await page.goto(PAGE)
  await page.locator('.task', { hasText: 'Buy milk' }).locator('.task__text').click()
  const modal = page.locator('.task-modal')
  await modal.locator('.field--deadline .field__value').click()
  await modal.locator('.field--deadline .quick-date', { hasText: 'Today' }).click()
  await expect(modal.locator('.field--deadline .field__value')).toHaveText('Today')
  await modal.locator('.task-modal__close').click()

  const row = page.locator('.task', { hasText: 'Buy milk' })
  await expect(row.locator('.task__deadline')).toHaveText('Today')
  await expect(row.locator('.task__deadline')).toHaveClass(/deadline--today/)
})
