export type AuthUser = {
  id: string;
  handle: string;
  email: string;
  userType: "tourist" | "local";
  accountStatus: "active" | "suspended" | "banned" | "deletion_pending";
  preferredLocale: "pt-PT" | "en";
  timezone: string;
  adultConfirmedAt: string | null;
  emailVerifiedAt: string | null;
  onboardingCompletedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  roles: string[];
};

export const authError: Record<string, string> = {
  adult_confirmation_required: "Confirma que tens pelo menos 18 anos.",
  credentials: "O identificador ou a palavra-passe não estão corretos.",
  email_taken: "Já existe uma conta com este email.",
  handle_taken: "Este nome de utilizador já está ocupado.",
  invalid_input: "Revê o email e o nome de utilizador.",
  invalid_json: "Não foi possível ler os dados enviados.",
  invalid_password: "Usa uma palavra-passe entre 10 e 72 caracteres.",
  invalid_user_type: "Escolhe visitante ou residente.",
  rate_limited:
    "Foram feitas demasiadas tentativas. Tenta novamente dentro de um minuto.",
  server_error: "O serviço de contas está temporariamente indisponível.",
};
