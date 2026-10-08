/** Printable display usernames. @ stays reserved for mentions and email login. */
export function validHandle(value) {
  return (
    typeof value === "string" &&
    [...value].length >= 2 &&
    [...value].length <= 40 &&
    value.trim() === value &&
    !value.includes("@") &&
    !/[\p{Cc}\p{Cf}]/u.test(value)
  );
}
