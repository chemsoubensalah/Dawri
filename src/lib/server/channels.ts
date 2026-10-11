/** قنوات التنبيه المفعّلة على الخادم (للعرض في الإعدادات). */
import { smsProvider } from "./sms";
import { smsTypes } from "./notify";

export function channelStatus() {
  return {
    push: Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
    sms: smsProvider() !== null && smsProvider() !== "console" && smsTypes().size > 0,
    smsTest: smsProvider() === "console",
    whatsapp: Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
    viber: Boolean(process.env.VIBER_BOT_TOKEN),
  };
}

export type ChannelStatus = ReturnType<typeof channelStatus>;
