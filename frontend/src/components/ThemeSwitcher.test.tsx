import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, beforeEach } from 'vitest'
import { ThemeSwitcher } from './ThemeSwitcher'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

test('renders sun icon and defaults to light mode', () => {
  render(<ThemeSwitcher />)
  
  const button = screen.getByRole('button', { name: /switch to dark mode/i })
  expect(button).toBeInTheDocument()
  expect(button.querySelector('svg')).toHaveStyle({ color: '#FFD700' })
  expect(document.documentElement.getAttribute('data-theme')).toBe('light')
})

test('toggles to dark mode on click and saves to local storage', async () => {
  const user = userEvent.setup()
  render(<ThemeSwitcher />)
  
  const button = screen.getByRole('button', { name: /switch to dark mode/i })
  await user.click(button)
  
  expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  expect(localStorage.getItem('theme')).toBe('dark')
  const newButton = screen.getByRole('button', { name: /switch to light mode/i })
  expect(newButton).toBeInTheDocument()
  expect(newButton.querySelector('svg')).toHaveStyle({ color: '#3B82F6' })
})

test('loads theme from local storage on mount', () => {
  localStorage.setItem('theme', 'dark')
  render(<ThemeSwitcher />)
  
  expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  expect(screen.getByRole('button', { name: /switch to light mode/i })).toBeInTheDocument()
})
