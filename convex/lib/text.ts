import { appError } from "./errors";

// C0/C1 control characters. Strings flow into email subjects, so a newline in a
// tool name would otherwise be a header-injection vector further down the line.
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;
const CONTROL_CHARS_EXCEPT_NEWLINE =
  /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/;

export function cleanLine(value: string, label: string, maxLength: number) {
  const text = value.trim();
  if (!text) throw appError("INVALID_INPUT", `${label} is required.`);
  if (text.length > maxLength) {
    throw appError(
      "INVALID_INPUT",
      `${label} must be ${maxLength} characters or fewer.`,
    );
  }
  if (CONTROL_CHARS.test(text)) {
    throw appError("INVALID_INPUT", `${label} contains invalid characters.`);
  }
  return text;
}

export function cleanParagraph(
  value: string,
  label: string,
  maxLength: number,
) {
  const text = value.replace(/\r\n/g, "\n").trim();
  if (!text) throw appError("INVALID_INPUT", `${label} is required.`);
  if (text.length > maxLength) {
    throw appError(
      "INVALID_INPUT",
      `${label} must be ${maxLength} characters or fewer.`,
    );
  }
  if (CONTROL_CHARS_EXCEPT_NEWLINE.test(text)) {
    throw appError("INVALID_INPUT", `${label} contains invalid characters.`);
  }
  return text;
}

/** j***@example.com: enough for an admin to recognize a member, no more. */
export function maskEmail(email: string | undefined) {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!local || !domain) return null;
  return `${local[0]}***@${domain}`;
}
