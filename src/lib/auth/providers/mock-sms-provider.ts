import { AuthError } from "@/lib/auth/shared/auth.errors";

import type { SendOtpInput, SendOtpResult, SmsProvider } from "./sms-provider";

export const mockSmsProvider: SmsProvider = {
  name: "mock",

  async sendOtp(input: SendOtpInput): Promise<SendOtpResult> {
    if (process.env.NODE_ENV === "production") {
      throw new AuthError("Mock SMS provider is disabled in production.", 500);
    }

    return {
      provider: "mock",
      status: "MOCKED",
      devCode: input.code,
    };
  },
};
