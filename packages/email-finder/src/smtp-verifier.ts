import * as dns from "dns";
import * as net from "net";
import type { EmailVerificationResult } from "@sales-ai/core";

/** Default timeout for the entire SMTP conversation (ms). */
const SMTP_TIMEOUT_MS = 10_000;

/**
 * Verify an email address by connecting to the domain's MX server and
 * attempting the SMTP envelope sequence (EHLO -> MAIL FROM -> RCPT TO).
 *
 * A positive RCPT TO response strongly suggests the mailbox exists, but
 * note that many servers return 250 for all addresses (accept-all) or
 * use greylisting to temporarily reject unknown senders.
 */
export async function verifyEmailSmtp(
  email: string,
): Promise<EmailVerificationResult> {
  const domain = email.split("@")[1];

  if (!domain) {
    return {
      email,
      isValid: false,
      method: "smtp",
      details: { error: "Invalid email format – no domain" },
    };
  }

  let mxHost: string;
  try {
    mxHost = await resolveMx(domain);
  } catch (error) {
    return {
      email,
      isValid: null,
      method: "smtp",
      details: { error: `MX lookup failed: ${errorMessage(error)}` },
    };
  }

  try {
    const result = await smtpCheck(mxHost, email);
    return result;
  } catch (error) {
    return {
      email,
      isValid: null,
      method: "smtp",
      details: { error: `SMTP check failed: ${errorMessage(error)}` },
    };
  }
}

// ============================================================
// Internal helpers
// ============================================================

/**
 * Resolve the highest-priority MX record for a domain.
 */
function resolveMx(domain: string): Promise<string> {
  return new Promise((resolve, reject) => {
    dns.resolveMx(domain, (err, addresses) => {
      if (err) {
        reject(new Error(`DNS MX lookup error: ${err.message}`));
        return;
      }
      if (!addresses || addresses.length === 0) {
        reject(new Error("No MX records found"));
        return;
      }

      // Sort by priority (lower = higher priority) and return the best one.
      addresses.sort((a, b) => a.priority - b.priority);
      resolve(addresses[0].exchange);
    });
  });
}

/**
 * Perform the SMTP envelope check against a single MX host.
 */
function smtpCheck(
  mxHost: string,
  email: string,
): Promise<EmailVerificationResult> {
  return new Promise((resolve, reject) => {
    let step: "connect" | "ehlo" | "mail" | "rcpt" | "done" = "connect";
    let responded = false;

    const socket = net.createConnection(25, mxHost);
    socket.setTimeout(SMTP_TIMEOUT_MS);
    socket.setEncoding("utf-8");

    let buffer = "";

    const finish = (result: EmailVerificationResult) => {
      if (responded) return;
      responded = true;
      sendCommand("QUIT\r\n");
      socket.destroy();
      resolve(result);
    };

    const fail = (error: Error) => {
      if (responded) return;
      responded = true;
      socket.destroy();
      reject(error);
    };

    const sendCommand = (cmd: string) => {
      try {
        socket.write(cmd);
      } catch {
        // socket may already be closed – safe to ignore
      }
    };

    socket.on("data", (data: string) => {
      buffer += data;

      // SMTP responses can span multiple lines; wait for a line that
      // starts with "NNN " (space after the code) indicating the final
      // line of the response.
      const lines = buffer.split("\r\n");
      const lastComplete = lines.filter((l) => /^\d{3} /.test(l)).pop();
      if (!lastComplete) return; // still accumulating

      const code = parseInt(lastComplete.substring(0, 3), 10);
      buffer = "";

      switch (step) {
        case "connect":
          if (code >= 200 && code < 300) {
            step = "ehlo";
            sendCommand("EHLO mail.verifier.local\r\n");
          } else {
            finish({
              email,
              isValid: null,
              method: "smtp",
              details: { error: `Unexpected greeting: ${code}`, code },
            });
          }
          break;

        case "ehlo":
          if (code >= 200 && code < 300) {
            step = "mail";
            sendCommand("MAIL FROM:<verify@verifier.local>\r\n");
          } else {
            finish({
              email,
              isValid: null,
              method: "smtp",
              details: { error: `EHLO rejected: ${code}`, code },
            });
          }
          break;

        case "mail":
          if (code >= 200 && code < 300) {
            step = "rcpt";
            sendCommand(`RCPT TO:<${email}>\r\n`);
          } else {
            finish({
              email,
              isValid: null,
              method: "smtp",
              details: { error: `MAIL FROM rejected: ${code}`, code },
            });
          }
          break;

        case "rcpt":
          step = "done";
          if (code >= 200 && code < 300) {
            finish({
              email,
              isValid: true,
              method: "smtp",
              details: { code, message: lastComplete },
            });
          } else if (code === 450 || code === 451 || code === 452) {
            // Greylisting or temporary failure – inconclusive
            finish({
              email,
              isValid: null,
              method: "smtp",
              details: {
                error: "Greylisting or temporary rejection",
                code,
                message: lastComplete,
              },
            });
          } else {
            finish({
              email,
              isValid: false,
              method: "smtp",
              details: { code, message: lastComplete },
            });
          }
          break;

        default:
          break;
      }
    });

    socket.on("timeout", () => {
      fail(new Error("SMTP connection timed out"));
    });

    socket.on("error", (err: Error) => {
      if (err.message.includes("ECONNREFUSED")) {
        finish({
          email,
          isValid: null,
          method: "smtp",
          details: { error: "Connection refused" },
        });
      } else if (err.message.includes("ENOTFOUND")) {
        finish({
          email,
          isValid: null,
          method: "smtp",
          details: { error: "MX host not found" },
        });
      } else {
        fail(err);
      }
    });

    socket.on("close", () => {
      if (!responded) {
        fail(new Error("Socket closed unexpectedly"));
      }
    });
  });
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
