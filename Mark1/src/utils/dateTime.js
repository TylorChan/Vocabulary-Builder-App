function pad(value, length = 2) {
  return String(value).padStart(length, "0");
}

export function formatLocalDateTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error("Invalid date");
  }

  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    "T",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
    ":",
    pad(date.getSeconds()),
    ".",
    pad(date.getMilliseconds(), 3),
  ].join("");
}
