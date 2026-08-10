export const getStripeSecretKey = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string => {
  const secretKey = environment.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Configuração server-side ausente: STRIPE_SECRET_KEY");
  }
  return secretKey;
};
