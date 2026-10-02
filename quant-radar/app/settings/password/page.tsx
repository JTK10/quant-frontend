import { passwordStoreConfigured } from "@/utils/authStore";
import PasswordForm from "./PasswordForm";
export const metadata = { title: "Change password · Quant Radar" };
export default function PasswordPage() {
  return <PasswordForm ready={passwordStoreConfigured()} />;
}
