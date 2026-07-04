export type SendOtpInput = {
  phone: string;
  code: string;
  message: string;
  purpose: string;
};

export type SendOtpResult = {
  provider: string;
  messageId?: string;
  status: "MOCKED" | "SENT";
  devCode?: string;
};

export interface SmsProvider {
  readonly name: string;

  sendOtp(input: SendOtpInput): Promise<SendOtpResult>;
}
