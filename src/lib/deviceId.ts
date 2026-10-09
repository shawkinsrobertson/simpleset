const DEVICE_ID_KEY = 'simpleset:device-id';

/** Anonymous id sent to the parse backend for rate limiting. Not a user account. */
export function getDeviceId(): string {
  const stored = localStorage.getItem(DEVICE_ID_KEY);
  if (stored) return stored;

  const id = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}
