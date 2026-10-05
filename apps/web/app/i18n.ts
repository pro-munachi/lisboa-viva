export const pt = {
  invalid: "Verifica os dados introduzidos.",
  credentials: "O nome de utilizador ou a palavra-passe não estão corretos.",
  handle_taken: "Este nome de utilizador já está a ser usado.",
  insufficient: "Não tens saldo suficiente para esta operação.",
  invalid_amount: "Introduz um montante válido.",
  not_found: "Não foi possível encontrar o que procuras.",
  busy: "Termina a atividade ou o encontro em curso antes de continuar.",
  closed: "Este espaço está fechado. Volta mais tarde.",
  wrong_place: "Tens de estar no local indicado para fazer isto.",
  qualification:
    "Ainda não cumpres os requisitos. Consulta a tua missão ou as qualificações.",
  already_done: "Já concluíste esta ação.",
  wrong_answer: "Ainda não é essa a resposta. Lê a situação e tenta novamente.",
  protected:
    "Este encontro não é permitido: verifica as proteções, o local e a participação de ambos.",
  cooldown: "Ainda é cedo para repetir esta atividade. Aguarda um pouco.",
  forbidden: "Não tens permissão para esta ação.",
  blocked: "Esta pessoa não pode receber a tua mensagem.",
  rate_limit: "Fizeste demasiados pedidos. Aguarda um minuto.",
  idempotency_conflict: "Este pedido já foi utilizado para outra operação.",
  expired: "A tua sessão terminou. Inicia sessão novamente.",
  capacity: "Este espaço está cheio. Tenta novamente mais tarde.",
  disabled: "Esta atividade está temporariamente indisponível.",
  server: "Não foi possível concluir o pedido. Tenta novamente.",
  network: "A ligação falhou. O teu progresso está guardado. Volta a tentar.",
} as const;
export const euro = (n: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(
    n / 100,
  );
export const time = (s: string) =>
  new Intl.DateTimeFormat("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Lisbon",
  }).format(new Date(s));
export const statNames: Record<string, string> = {
  energy: "Energia",
  hunger: "Saciedade",
  hygiene: "Higiene",
  mood: "Humor",
  health: "Saúde",
  social: "Convívio",
};
export const skillNames: Record<string, string> = {
  service: "Atendimento",
  cooking: "Cozinha",
  fitness: "Forma física",
  music: "Música",
  football: "Futebol",
  surfing: "Surf",
  technical: "Tecnologia",
  trust: "Confiança no bairro",
  street: "Perspicácia",
};
export const modes: Record<string, string> = {
  walk: "A pé",
  metro: "Metro",
  tram: "Elétrico",
  bus: "Autocarro",
  train: "Comboio",
  ferry: "Barco",
};
export const kinds: Record<string, string> = {
  welcome: "Boas-vindas",
  wage: "Ordenado",
  purchase: "Compra",
  fare: "Viagem",
  transfer: "Transferência",
  deposit: "Depósito",
  withdraw: "Levantamento",
  quest: "Ajuda do bairro",
  encounter: "Encontro de risco",
  adjustment: "Correção administrativa",
};
