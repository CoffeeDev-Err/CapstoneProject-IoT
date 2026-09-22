// Set the saved preference before the application paints. New visitors start in dark mode.
try {
  if (window.localStorage.getItem('theme') === 'light') {
    document.documentElement.dataset.theme = 'light'
  }
} catch {
  // Private browsing may block storage; keep the dark default from index.html.
}
