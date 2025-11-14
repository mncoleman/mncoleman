---
title: Implementing Dark Mode in Next.js
date: 2025-11-12
excerpt: A guide to adding a dark mode toggle to your Next.js application using next-themes and Tailwind CSS.
author: Matthew Coleman
tags:
  - nextjs
  - dark-mode
  - ui-ux
---

# Implementing Dark Mode in Next.js

Dark mode has become an essential feature for modern websites. Users expect the ability to switch between light and dark themes based on their preferences.

## Why Dark Mode Matters

- **Reduced Eye Strain** - Easier on the eyes, especially in low-light environments
- **Battery Savings** - OLED screens use less power with dark pixels
- **User Preference** - Respects system-wide theme preferences
- **Modern UX** - Expected in contemporary web applications

## Implementation with next-themes

The `next-themes` library makes it simple to add theme switching:

```bash
npm install next-themes
```

Then wrap your app with the ThemeProvider:

```tsx
import { ThemeProvider } from 'next-themes';

export default function App({ Component, pageProps }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system">
      <Component {...pageProps} />
    </ThemeProvider>
  );
}
```

## Tailwind CSS Integration

Tailwind CSS has built-in dark mode support. Configure it in `tailwind.config.js`:

```javascript
module.exports = {
  darkMode: 'class',
  // ... rest of config
};
```

Then use dark mode variants in your components:

```tsx
<div className="bg-white dark:bg-gray-900 text-black dark:text-white">
  Content that adapts to theme
</div>
```

## The Toggle Component

Create a simple toggle button:

```tsx
import { useTheme } from 'next-themes';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
      Toggle Theme
    </button>
  );
}
```

## Best Practices

1. **System Preference** - Default to the user's system preference
2. **Smooth Transitions** - Add CSS transitions for theme changes
3. **Persistent Choice** - Save user preference to localStorage
4. **No Flash** - Prevent flash of wrong theme on load

## Conclusion

Dark mode is a must-have feature for modern websites. With `next-themes` and Tailwind CSS, implementation is straightforward and the result is a polished user experience.
