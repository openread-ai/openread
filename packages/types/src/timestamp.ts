/**
 * @module @openread/types/timestamp
 * Timestamp conversion utilities for the OpenRead platform.
 *
 * All platform timestamps are stored as epoch-milliseconds (number).
 * These utilities provide safe conversion between Date, ISO string, and epoch-ms.
 */

/**
 * Convert a Date, ISO string, or epoch-ms number to epoch-ms.
 *
 * If the input is already a number, it is returned as-is (must be finite).
 * If the input is a Date or ISO string, it is converted to epoch-ms.
 *
 * @throws {RangeError} if the input is not finite or produces an invalid date
 */
export const toEpoch = (d: Date | string | number): number => {
  if (typeof d === 'number') {
    if (!Number.isFinite(d)) throw new RangeError('toEpoch: result is not finite');
    return d;
  }
  const ms = new Date(d).getTime();
  if (!Number.isFinite(ms)) throw new RangeError(`Invalid date value: ${String(d)}`);
  return ms;
};

/**
 * Convert an epoch-ms number to an ISO 8601 string.
 *
 * @throws {RangeError} if epoch is not finite
 */
export const toISO = (epoch: number): string => {
  if (!Number.isFinite(epoch)) throw new RangeError('toISO: epoch must be finite');
  return new Date(epoch).toISOString();
};
