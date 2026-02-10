/**
 * Name Utilities - Proper capitalization for names
 */

/**
 * Capitalize a name properly (Title Case)
 * Handles:
 * - Multiple words: "john doe" -> "John Doe"
 * - ALL CAPS: "JOHN DOE" -> "John Doe"
 * - Mixed case: "jOHN dOE" -> "John Doe"
 * - Hyphenated names: "mary-jane" -> "Mary-Jane"
 * - Apostrophes: "o'brien" -> "O'Brien"
 * - Multiple spaces: "john  doe" -> "John Doe"
 *
 * @param {string} name - The name to capitalize
 * @returns {string} - The properly capitalized name
 */
export function capitalizeName(name) {
    if (!name || typeof name !== 'string') {
        return name;
    }

    // Trim and normalize multiple spaces to single space
    const trimmed = name.trim().replace(/\s+/g, ' ');

    if (!trimmed) {
        return trimmed;
    }

    // Split by space, then handle each word
    return trimmed
        .split(' ')
        .map(word => capitalizeWord(word))
        .join(' ');
}

/**
 * Capitalize a single word, handling hyphens and apostrophes
 * @param {string} word - Single word to capitalize
 * @returns {string} - Capitalized word
 */
function capitalizeWord(word) {
    if (!word) return word;

    // Handle hyphenated names: "mary-jane" -> "Mary-Jane"
    if (word.includes('-')) {
        return word
            .split('-')
            .map(part => capitalizeSimple(part))
            .join('-');
    }

    // Handle apostrophes: "o'brien" -> "O'Brien"
    if (word.includes("'")) {
        return word
            .split("'")
            .map((part, index) => {
                // First part and parts after apostrophe should be capitalized
                return capitalizeSimple(part);
            })
            .join("'");
    }

    return capitalizeSimple(word);
}

/**
 * Simple capitalize - first letter uppercase, rest lowercase
 * @param {string} str - String to capitalize
 * @returns {string} - Capitalized string
 */
function capitalizeSimple(str) {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Capitalize multiple name fields in an object
 * @param {object} data - Object containing name fields
 * @param {string[]} fields - Array of field names to capitalize
 * @returns {object} - Object with capitalized name fields
 */
export function capitalizeNameFields(data, fields = ['full_name', 'fullName', 'guardian_name']) {
    if (!data || typeof data !== 'object') {
        return data;
    }

    const result = { ...data };

    for (const field of fields) {
        if (result[field] && typeof result[field] === 'string') {
            result[field] = capitalizeName(result[field]);
        }
    }

    return result;
}

export default {
    capitalizeName,
    capitalizeNameFields
};
