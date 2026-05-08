/**
 * Returns a CSS calc() function that dynamically scales a given size
 * based on the value of the --index CSS variable and the --index-ratio
 * CSS variable.
 *
 * @param {string} size - The size to scale, e.g. "1rem" or "50px"
 * @returns {string} - A CSS calc() function that dynamically scales the given size
 * @example
 * dynamicSize("1rem") // returns "calc(var(--index) * 1rem / var(--index-ratio))"
 */
export const dynamicSize = (size: string) => {
  return `calc(var(--index) * ${size} / var(--index-ratio))`;
};
