/** Lazily load driver.js and its CSS (shared across tour composables) */
let driverPromise: Promise<typeof import('driver.js').driver> | null = null

export function loadDriver() {
  if (!driverPromise) {
    driverPromise = (async () => {
      const { driver } = await import('driver.js')
      await import('driver.js/dist/driver.css')
      return driver
    })()
  }
  return driverPromise
}
