/**
 * Date Formatter Utility
 * Provides consistent date and time formatting functions
 */

/**
 * Format a date to a human-readable string (e.g., "July 17, 2025")
 * @param {Date|string} date - Date object or ISO string
 * @returns {string} Formatted date
 */
export const formatDate = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

/**
 * Format a time to a human-readable string (e.g., "2:30 PM")
 * @param {Date|string} date - Date object or ISO string
 * @returns {string} Formatted time
 */
export const formatTime = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};

/**
 * Format a date and time to a human-readable string (e.g., "July 17, 2025 at 2:30 PM")
 * @param {Date|string} date - Date object or ISO string
 * @returns {string} Formatted date and time
 */
export const formatDateTime = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  return `${formatDate(d)} at ${formatTime(d)}`;
};

/**
 * Get relative time string (e.g., "5 minutes ago", "in 3 hours")
 * @param {Date|string} date - Date object or ISO string
 * @returns {string} Relative time string
 */
export const getRelativeTimeString = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  const now = new Date();
  const diffMs = d - now;
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHour = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHour / 24);

  if (diffSec < 0) {
    // Past
    if (diffSec > -60) return `${Math.abs(diffSec)} seconds ago`;
    if (diffMin > -60) return `${Math.abs(diffMin)} minutes ago`;
    if (diffHour > -24) return `${Math.abs(diffHour)} hours ago`;
    if (diffDay > -30) return `${Math.abs(diffDay)} days ago`;
    return formatDate(d);
  } else {
    // Future
    if (diffSec < 60) return `in ${diffSec} seconds`;
    if (diffMin < 60) return `in ${diffMin} minutes`;
    if (diffHour < 24) return `in ${diffHour} hours`;
    if (diffDay < 30) return `in ${diffDay} days`;
    return formatDate(d);
  }
};
