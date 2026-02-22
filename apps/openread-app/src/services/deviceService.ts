/**
 * @module services/deviceService
 * Generates and persists a stable device identifier for sync conflict diagnostics.
 */

const DEVICE_ID_KEY = 'openread_device_id';

/**
 * Get or create a stable device identifier.
 * Persisted in localStorage so it survives app restarts but is unique per device/browser.
 */
export function getDeviceId(): string {
  if (typeof localStorage === 'undefined') {
    console.warn(
      '[DeviceService] localStorage unavailable — device tracking disabled for this environment',
    );
    return '';
  }
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}
