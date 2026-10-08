/** Read existing usernames, including names created before whitespace was disallowed. */
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

/** New usernames cannot contain any whitespace. */
export function validNewHandle(value) {
  return validHandle(value) && !/\p{White_Space}/u.test(value);
}
