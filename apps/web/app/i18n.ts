export type Locale = "pt" | "en";

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

export const en: Record<keyof typeof pt, string> = {
  invalid: "Check the information you entered.",
  credentials: "The username or password is incorrect.",
  handle_taken: "This username is already in use.",
  insufficient: "You do not have enough funds for this transaction.",
  invalid_amount: "Enter a valid amount.",
  not_found: "We could not find what you were looking for.",
  busy: "Finish your current activity or encounter before continuing.",
  closed: "This place is closed. Come back later.",
  wrong_place: "You need to be at the indicated place to do this.",
  qualification:
    "You do not meet the requirements yet. Check your quest or qualifications.",
  already_done: "You have already completed this action.",
  wrong_answer: "That is not the answer yet. Read the situation and try again.",
  protected:
    "This encounter is not allowed. Check protection, location, and both players' participation.",
  cooldown: "It is too soon to repeat this activity. Wait a moment.",
  forbidden: "You do not have permission to do this.",
  blocked: "This person cannot receive your message.",
  rate_limit: "You made too many requests. Wait a minute.",
  idempotency_conflict:
    "This request was already used for another transaction.",
  expired: "Your session ended. Sign in again.",
  capacity: "This place is full. Try again later.",
  disabled: "This activity is temporarily unavailable.",
  server: "We could not complete the request. Try again.",
  network: "The connection failed. Your progress is saved. Try again.",
};

let activeLocale: Locale = "pt";
export const setI18nLocale = (locale: Locale) => {
  activeLocale = locale;
};
export const messages = (locale: Locale) => (locale === "en" ? en : pt);
export const euro = (n: number) =>
  new Intl.NumberFormat(activeLocale === "en" ? "en-GB" : "pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(n / 100);
export const time = (s: string) =>
  new Intl.DateTimeFormat(activeLocale === "en" ? "en-GB" : "pt-PT", {
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

const pairs: [string, string][] = [
  ["Fechar", "Close"],
  ["Procurar trabalho", "Find work"],
  ["Depositar ou levantar", "Deposit or withdraw"],
  ["Abrir a conversa local", "Open local chat"],
  ["por perto", "nearby"],
  ["para mais uma volta.", "for another round."],
  ["RIO TEJO", "TAGUS RIVER"],
  ["MARGEM SUL", "SOUTH BANK"],
  ["Lisboa está à tua espera.", "Lisbon is waiting for you."],
  [
    "Não foi possível ligar à cidade. Verifica se o servidor está disponível.",
    "Could not connect to the city. Check whether the server is available.",
  ],
  ["A abrir as portas do bairro…", "Opening the neighbourhood…"],
  ["Tentar novamente", "Try again"],
  ["Lisboa Viva, início", "Lisboa Viva, home"],
  ["A CIDADE É TUA.", "THE CITY IS YOURS."],
  ["Navegação principal", "Main navigation"],
  ["Explorar", "Explore"],
  ["Trabalho", "Work"],
  ["A minha vida", "My life"],
  ["A restabelecer ligação", "Reconnecting"],
  ["Ligado à cidade", "Connected to the city"],
  ["Primeira edição", "First edition"],
  ["Iniciar sessão", "Sign in"],
  ["A TUA PRÓXIMA HISTÓRIA", "YOUR NEXT STORY"],
  ["Olá,", "Hello,"],
  ["Onde vamos hoje?", "Where shall we go today?"],
  ["Uma cidade.", "One city."],
  ["Mil maneiras", "A thousand ways"],
  ["de a viver.", "to live it."],
  [
    "Há sempre uma rua por descobrir, alguém por conhecer e um novo começo.",
    "There is always another street to discover, someone to meet, and a fresh start.",
  ],
  [
    "Encontra o teu bairro. Conhece as tuas pessoas. Constrói uma vida em Lisboa, ao teu ritmo.",
    "Find your neighbourhood. Meet your people. Build a life in Lisbon at your own pace.",
  ],
  ["Começar a minha história", "Start my story"],
  ["No bolso", "Cash"],
  ["No banco", "Bank"],
  ["O TEU DIA", "YOUR DAY"],
  ["ESCOLHE O TEU RITMO", "CHOOSE YOUR PACE"],
  ["Energia", "Energy"],
  ["Saciedade", "Fullness"],
  ["Higiene", "Hygiene"],
  ["Humor", "Mood"],
  ["Saúde", "Health"],
  ["Convívio", "Social"],
  ["PEQUENAS HISTÓRIAS", "SMALL STORIES"],
  ["Já fazes parte do bairro", "You are part of the neighbourhood"],
  ["Os primeiros vizinhos", "The first neighbours"],
  ["passos concluídos", "steps completed"],
  [
    "Uma bica. Uma conversa. Um começo.",
    "An espresso. A conversation. A beginning.",
  ],
  ["O teu primeiro turno, a tua ambição.", "Your first shift, your ambition."],
  ["Da outra margem até ao Atlântico.", "From the south bank to the Atlantic."],
  ["O teu progresso fica guardado.", "Your progress is saved."],
  [
    "Uma vida virtual. Uma cidade partilhada.",
    "A virtual life. A shared city.",
  ],
  ["Lisboa e arredores · Portugal", "Lisbon and surroundings · Portugal"],
  ["Explorar a cidade", "Explore the city"],
  ["O MUNDO LÁ FORA", "THE WORLD OUTSIDE"],
  ["Lisboa e arredores", "Lisbon and surroundings"],
  ["bairros", "neighbourhoods"],
  ["Tempo simulado · céu limpo", "Simulated weather · clear skies"],
  ["Mapa", "Map"],
  ["Lista", "List"],
  ["Tudo", "All"],
  ["Tempo livre", "Leisure"],
  ["O teu mundo, à distância de um passeio.", "Your world, just a walk away."],
  ["Ampliar mapa", "Zoom in"],
  ["Reduzir mapa", "Zoom out"],
  ["Ver a minha localização", "Show my location"],
  ["Abrir casa e inventário", "Open home and inventory"],
  ["Abrir banco", "Open bank"],
  ["Abrir mensagens", "Open messages"],
  ["Abrir processos", "Open cases"],
  ["Espaços do bairro", "Neighbourhood places"],
  ["Fechar local", "Close place"],
  ["O QUE TE APETECE FAZER?", "WHAT WOULD YOU LIKE TO DO?"],
  ["VIDA NO BAIRRO", "NEIGHBOURHOOD LIFE"],
  ["Sempre aberto", "Always open"],
  ["Zona tranquila", "Safe zone"],
  ["Presença ao chegar", "Present on arrival"],
  ["Personagem da cidade · NPC", "City character · NPC"],
  ["Um quarto. Um novo capítulo.", "A room. A new chapter."],
  [
    "Começas numa casa partilhada em Arroios, com dinheiro para os primeiros dias.",
    "You begin in a shared home in Arroios with enough money for your first few days.",
  ],
  [
    "Explora os espaços deste bairro a pé.",
    "Explore this neighbourhood on foot.",
  ],
  ["Preferência de viagem", "Travel preference"],
  ["Mais rápido", "Fastest"],
  ["Mais económico", "Cheapest"],
  ["COMO CHEGAR", "HOW TO GET THERE"],
  ["Uma pequena caminhada", "A short walk"],
  ["Gratuito", "Free"],
  ["Uma viagem, passo a passo", "One journey, step by step"],
  [
    "Escolhe a próxima ligação quando chegares.",
    "Choose the next connection when you arrive.",
  ],
  ["Destino final:", "Final destination:"],
  ["Ir para aqui", "Go here"],
  ["A viajar", "Travelling"],
  ["Cancelar sem reembolso", "Cancel without refund"],
  ["segundos", "seconds"],
  ["Recebes", "You earn"],
  ["Qualificação obtida", "Qualification earned"],
  ["Conhecer a Amélia", "Meet Amélia"],
  ["Conversar com a Rita", "Talk to Rita"],
  ["Contar as novidades à Amélia", "Tell Amélia the news"],
  [
    "Visita este espaço para conhecer quem está por perto.",
    "Visit this place to see who is nearby.",
  ],
  [
    "És a primeira pessoa por aqui. Os NPCs mantêm o bairro a funcionar.",
    "You are the first person here. NPCs keep the neighbourhood running.",
  ],
  ["DEVAGAR TAMBÉM SE CHEGA LONGE.", "SLOWLY STILL GETS YOU FAR."],
  ["Há sempre tempo", "There is always time"],
  ["Serviço comunitário", "Community service"],
  ["A confirmar a conclusão…", "Confirming completion…"],
  ["Encontro de risco em curso", "Risk encounter in progress"],
  [
    "Protege o teu dinheiro ou chama ajuda.",
    "Protect your money or call for help.",
  ],
  ["Proteger o dinheiro", "Protect the money"],
  ["Chamar ajuda NPC", "Call NPC help"],
  [
    "A outra pessoa pode defender-se. O resultado é calculado pelo servidor.",
    "The other player can defend themselves. The server calculates the outcome.",
  ],
  ["Fechar aviso", "Close notice"],
  ["UMA ESCOLHA FAZ A DIFERENÇA", "ONE CHOICE MAKES A DIFFERENCE"],
  ["Ver local", "View place"],
  ["Criar personagem", "Create character"],
  ["BEM-VINDO A LISBOA", "WELCOME TO LISBON"],
  ["A tua história começa aqui.", "Your story starts here."],
  ["Bom ter-te de volta.", "Good to have you back."],
  [
    "Uma personagem adulta. Uma cidade de possibilidades.",
    "An adult character. A city of possibilities.",
  ],
  [
    "O bairro está à tua espera. Continua de onde ficaste.",
    "The neighbourhood is waiting. Continue where you left off.",
  ],
  ["Nome da personagem", "Character name"],
  ["Como te chamas?", "What is your name?"],
  ["O teu ponto de partida", "Your starting point"],
  ["Acabei de chegar", "I just arrived"],
  ["Sou de cá", "I am from here"],
  ["Vim estudar", "I came to study"],
  ["Estou de regresso", "I am returning"],
  ["Pronomes", "Pronouns"],
  ["Opcional", "Optional"],
  ["Sobre ti", "About you"],
  [
    "Uma frase sobre a tua personagem (opcional)",
    "A sentence about your character (optional)",
  ],
  ["Interesses", "Interests"],
  ["Música, surf, cozinha…", "Music, surfing, cooking…"],
  ["O teu estilo", "Your style"],
  ["Nome de utilizador", "Username"],
  [
    "3–24 letras minúsculas, algarismos ou sublinhados.",
    "3–24 lowercase letters, numbers, or underscores.",
  ],
  ["Palavra-passe", "Password"],
  ["Pelo menos 10 caracteres", "At least 10 characters"],
  ["Entrar na minha nova vida", "Enter my new life"],
  ["Entrar", "Sign in"],
  [
    "Ainda não tens conta? Cria a tua personagem.",
    "No account yet? Create your character.",
  ],
  [
    "Já tens uma personagem? Inicia sessão.",
    "Already have a character? Sign in.",
  ],
  [
    "Moeda e regras fictícias. Sem pagamentos reais.",
    "Fictional currency and rules. No real payments.",
  ],
  ["O meu telemóvel", "My phone"],
  ["O MEU TELEMÓVEL", "MY PHONE"],
  ["Carteira", "Wallet"],
  ["Mensagens", "Messages"],
  ["Cidadania", "Civic life"],
  ["Definições", "Settings"],
  ["Administração", "Administration"],
  ["SALDO DISPONÍVEL", "AVAILABLE BALANCE"],
  ["Conta virtual", "Virtual account"],
  ["Dinheiro no bolso", "Cash on hand"],
  ["CONFIRMAR TRANSFERÊNCIA", "CONFIRM TRANSFER"],
  ["para", "to"],
  [
    "O dinheiro sai da tua conta e chega à conta desta personagem, mesmo que esteja offline.",
    "The money leaves your account and reaches this character even if they are offline.",
  ],
  ["Voltar", "Back"],
  ["Enviar dinheiro", "Send money"],
  ["Destinatário", "Recipient"],
  ["Montante em euros", "Amount in euros"],
  ["Nota opcional", "Optional note"],
  ["Pelo jantar de ontem…", "For yesterday's dinner…"],
  ["Rever transferência", "Review transfer"],
  ["Depósitos e levantamentos", "Deposits and withdrawals"],
  ["Usa o montante indicado acima.", "Use the amount entered above."],
  ["Depositar", "Deposit"],
  ["Levantar", "Withdraw"],
  [
    "Visitar a Caixa do Tejo para depositar ou levantar",
    "Visit Tagus Bank to deposit or withdraw",
  ],
  ["Movimentos e comprovativos", "Transactions and receipts"],
  ["Movimento", "Transaction"],
  ["Sem nota", "No note"],
  ["Conta bancária", "Bank account"],
  ["Concluído", "Completed"],
  [
    "Um pequeno turno pode abrir uma grande porta. As vagas NPC estão disponíveis mesmo quando não há outros jogadores.",
    "A short shift can open a big door. NPC jobs remain available when no other players are online.",
  ],
  [
    "Requer qualificação de atendimento",
    "Customer service qualification required",
  ],
  ["Sem experiência necessária", "No experience required"],
  ["Conversa local", "Local chat"],
  ["Mensagens privadas", "Private messages"],
  [
    "As mensagens permitidas chegam mesmo quando a outra pessoa está offline.",
    "Allowed messages arrive even when the other person is offline.",
  ],
  ["A conversar em", "Chatting at"],
  [
    "A sala muda quando chegas a outro local.",
    "The room changes when you arrive somewhere else.",
  ],
  ["Enviada em privado", "Sent privately"],
  ["Recebida em privado", "Received privately"],
  ["Responder", "Reply"],
  ["A conversa começa contigo.", "The conversation starts with you."],
  ["Ainda não há mensagens privadas.", "There are no private messages yet."],
  ["Diz olá ao bairro.", "Say hello to the neighbourhood."],
  ["Enviar a", "Send to"],
  ["Mensagem", "Message"],
  ["Escreve a tua mensagem…", "Write your message…"],
  ["Enviar mensagem", "Send message"],
  ["Uma vida em Lisboa", "A life in Lisbon"],
  ["A tua história ainda está a começar.", "Your story is only beginning."],
  ["OS PRIMEIROS VIZINHOS ·", "THE FIRST NEIGHBOURS ·"],
  ["A Amélia tem uma sugestão para ti", "Amélia has a suggestion for you"],
  ["Uma bica com a Rita", "An espresso with Rita"],
  ["Uma nova oportunidade", "A new opportunity"],
  [
    "A Amélia quer mostrar-te onde podes estudar e trabalhar no bairro. Fala com ela em casa.",
    "Amélia wants to show you where to study and work nearby. Talk to her at home.",
  ],
  [
    "O bairro mudou desde a última vez. A Amélia ajuda-te a reencontrá-lo. Fala com ela em casa.",
    "The neighbourhood has changed. Amélia will help you find your way again. Talk to her at home.",
  ],
  [
    "Mesmo quem é de cá tem novos vizinhos para conhecer. Fala com a Amélia em casa.",
    "Even locals have new neighbours to meet. Talk to Amélia at home.",
  ],
  [
    "«Bem-vindo ao bairro! Antes de mais, vamos conhecer as pessoas.» Fala com a Amélia em casa.",
    "“Welcome to the neighbourhood! First, let's meet the people.” Talk to Amélia at home.",
  ],
  [
    "Vai ao Café da Esquina, pede uma bica e conversa com a Rita.",
    "Go to the Corner Café, order an espresso, and talk to Rita.",
  ],
  [
    "A Rita recomendou o curso de atendimento da Escola Oficina. Conclui-o e volta a casa para contar as novidades à Amélia.",
    "Rita recommended the customer service course at the Workshop School. Complete it and return home to tell Amélia.",
  ],
  [
    "A Amélia deu-te 10 € e a confiança do bairro cresceu. A cozinha da Bica já pode ser o teu próximo trabalho.",
    "Amélia gave you €10 and your neighbourhood trust grew. Bica Kitchen can be your next job.",
  ],
  ["Ver próximo local", "View next place"],
  ["Na tua mochila", "In your backpack"],
  ["Pão e fruta", "Bread and fruit"],
  ["Comer", "Eat"],
  [
    "A mochila está vazia. O mercado tem pão e fruta.",
    "Your backpack is empty. The market has bread and fruit.",
  ],
  ["Competências e qualificações", "Skills and qualifications"],
  [
    "Aprendes ao fazer. Experimenta um turno ou uma atividade.",
    "You learn by doing. Try a shift or an activity.",
  ],
  [
    "Atendimento · qualificação obtida",
    "Customer service · qualification earned",
  ],
  ["As últimas atividades", "Recent activities"],
  ["Viagem cancelada", "Journey cancelled"],
  [
    "Este é um sistema de justiça fictício. Os agentes e juízes NPC só usam provas geradas pelo jogo e não têm acesso às tuas mensagens privadas.",
    "This is a fictional justice system. NPC officers and judges only use evidence generated by the game and cannot access your private messages.",
  ],
  ["Participar em encontros de risco", "Take part in risk encounters"],
  [
    "Ambos têm de aceitar este modo. Perda máxima: 10% do dinheiro no bolso, até 100 €. O banco fica protegido.",
    "Both players must opt in. Maximum loss: 10% of cash on hand, up to €100. Bank funds stay protected.",
  ],
  ["Estás sob proteção até às", "You are protected until"],
  [
    "A tua proteção inicial terminou. As zonas tranquilas continuam protegidas.",
    "Your initial protection ended. Safe zones remain protected.",
  ],
  ["O modo é sempre opcional.", "This mode is always optional."],
  ["Retenção breve até às", "Brief detention until"],
  [
    "A libertação é automática, mesmo se saíres do jogo.",
    "Release is automatic even if you leave the game.",
  ],
  ["Os teus processos", "Your cases"],
  ["PROCESSO", "CASE"],
  ["Advertência após recurso", "Warning after appeal"],
  ["Processo encerrado", "Case closed"],
  ["Consultar prova e histórico", "View evidence and history"],
  ["Prova autenticada: evento", "Authenticated evidence: event"],
  ["Apresentar recurso", "Appeal"],
  ["Iniciar serviço · 12 s", "Start service · 12 s"],
  ["Ir à associação", "Go to the community centre"],
  ["Nenhum processo em teu nome.", "No cases in your name."],
  ["Aproveita a cidade ao teu ritmo.", "Enjoy the city at your own pace."],
  ["Comprovativos de encontros", "Encounter receipts"],
  [
    "Idioma: Português (Portugal). O jogo respeita a preferência de movimento reduzido do teu dispositivo. O som está desligado.",
    "Language: English. The game respects your device's reduced-motion preference. Sound is off.",
  ],
  ["Receber mensagens privadas", "Receive private messages"],
  [
    "Podes desligar esta opção em qualquer altura.",
    "You can turn this off at any time.",
  ],
  ["Segurança e convívio", "Safety and community"],
  ["Bloquear pessoa", "Block person"],
  ["Silenciar / voltar a ouvir", "Mute / unmute"],
  ["Motivo da denúncia", "Report reason"],
  [
    "Descreve o comportamento que pretendes denunciar.",
    "Describe the behaviour you want to report.",
  ],
  ["Enviar denúncia à moderação", "Send report to moderation"],
  [
    "As denúncias de abuso são separadas dos crimes fictícios do jogo.",
    "Abuse reports are separate from fictional in-game crimes.",
  ],
  ["Desbloquear", "Unblock"],
  ["Silenciados neste dispositivo:", "Muted on this device:"],
  ["Terminar sessão", "Sign out"],
  ["Feito. O teu progresso foi guardado.", "Done. Your progress was saved."],
  ["Mensagem enviada.", "Message sent."],
  [
    "Transferência concluída. O comprovativo está no teu histórico.",
    "Transfer complete. The receipt is in your history.",
  ],
  [
    "Tudo pronto. A tua atividade começou.",
    "All set. Your activity has started.",
  ],
  [
    "Escolhe outra pessoa como destinatária.",
    "Choose someone else as the recipient.",
  ],
  ["Atendimento", "Customer service"],
  ["Cozinha", "Cooking"],
  ["Forma física", "Fitness"],
  ["Música", "Music"],
  ["Futebol", "Football"],
  ["Tecnologia", "Technology"],
  ["Confiança no bairro", "Neighbourhood trust"],
  ["Perspicácia", "Street smarts"],
  ["A pé", "Walk"],
  ["Elétrico", "Tram"],
  ["Autocarro", "Bus"],
  ["Comboio", "Train"],
  ["Barco", "Ferry"],
  ["Boas-vindas", "Welcome"],
  ["Ordenado", "Wage"],
  ["Compra", "Purchase"],
  ["Viagem", "Journey"],
  ["Transferência", "Transfer"],
  ["Depósito", "Deposit"],
  ["Levantamento", "Withdrawal"],
  ["Ajuda do bairro", "Neighbourhood help"],
  ["Encontro de risco", "Risk encounter"],
  ["Correção administrativa", "Administrative adjustment"],
  ["O teu bairro, o teu começo.", "Your neighbourhood, your beginning."],
  ["Baixa e Chiado", "Baixa and Chiado"],
  [
    "Encontros entre praças e esplanadas.",
    "Meetings among squares and pavement cafés.",
  ],
  ["Alfama e Graça", "Alfama and Graça"],
  [
    "Vizinhos, música e vistas sobre o Tejo.",
    "Neighbours, music, and views over the Tagus.",
  ],
  [
    "Comboios, barcos e noites por descobrir.",
    "Trains, ferries, and nights to discover.",
  ],
  ["Ofícios e passeios à beira-rio.", "Trades and riverside walks."],
  ["O futebol faz parte da conversa.", "Football is part of the conversation."],
  ["Uma vida do outro lado do rio.", "Life on the other side of the river."],
  ["O Atlântico começa aqui.", "The Atlantic begins here."],
  ["Jardins e pequenos rituais.", "Gardens and small rituals."],
  ["Novas ideias junto ao Tejo.", "New ideas by the Tagus."],
  ["Casa da Amélia", "Amélia's Home"],
  [
    "Um quarto luminoso, uma cozinha partilhada e espaço para recomeçar.",
    "A bright room, a shared kitchen, and space to start again.",
  ],
  ["Café da Esquina", "Corner Café"],
  [
    "A bica sabe melhor quando já te conhecem pelo nome.",
    "Espresso tastes better when they know you by name.",
  ],
  ["Mercado do Bairro", "Neighbourhood Market"],
  [
    "Pão fresco, fruta e conversas de balcão.",
    "Fresh bread, fruit, and conversation at the counter.",
  ],
  ["Escola Oficina do Bairro", "Neighbourhood Workshop School"],
  [
    "Aprende atendimento e abre a porta ao teu primeiro emprego.",
    "Learn customer service and open the door to your first job.",
  ],
  ["Caixa do Tejo", "Tagus Bank"],
  [
    "Depósitos, levantamentos e o teu saldo sempre à mão.",
    "Deposits, withdrawals, and your balance at hand.",
  ],
  ["Livraria Sete Colinas", "Seven Hills Bookshop"],
  [
    "Ajuda leitores a encontrar a próxima história.",
    "Help readers find their next story.",
  ],
  ["Tribunal da Cidade", "City Court"],
  [
    "Justiça fictícia, assistência e recurso por juízes NPC.",
    "Fictional justice, assistance, and appeals handled by NPC judges.",
  ],
  ["Miradouro das Andorinhas", "Swallows Viewpoint"],
  [
    "Recupera o fôlego com Lisboa aos teus pés.",
    "Catch your breath with Lisbon at your feet.",
  ],
  ["Tasca da Aurora", "Aurora Tavern"],
  [
    "Uma pequena sala onde a música encontra os vizinhos.",
    "A small room where music meets the neighbours.",
  ],
  ["Esquadra do Bairro", "Neighbourhood Police Station"],
  [
    "Consulta os teus processos e a assistência jurídica NPC.",
    "View your cases and NPC legal assistance.",
  ],
  ["Maré Alta", "High Tide"],
  [
    "Dança, conversa e descobre o som da cidade.",
    "Dance, talk, and discover the sound of the city.",
  ],
  ["Interface do Cais", "Cais Transport Hub"],
  [
    "Cais do Sodré: comboio para a costa e barco para Cacilhas.",
    "Cais do Sodré: train to the coast and ferry to Cacilhas.",
  ],
  ["Cozinha da Bica", "Bica Kitchen"],
  [
    "Um turno curto, uma equipa e pratos a sair.",
    "A short shift, a team, and dishes going out.",
  ],
  ["Forno do Poente", "Sunset Bakery"],
  [
    "Mãos na massa e natas acabadas de sair.",
    "Hands in the dough and fresh custard tarts.",
  ],
  ["Passeio de Belém", "Belém Promenade"],
  [
    "Caminha junto ao Tejo e recupera energia.",
    "Walk along the Tagus and restore your energy.",
  ],
  [
    "Futebol amador e um calendário de jogo simulado.",
    "Amateur football and a simulated match calendar.",
  ],
  ["Ginásio Primeiro Passo", "First Step Gym"],
  [
    "Uma rotina curta para ganhar forma, ao teu ritmo.",
    "A short routine to get fit at your own pace.",
  ],
  ["Cais de Cacilhas", "Cacilhas Pier"],
  [
    "Chegas à margem sul; a praia exige outra viagem.",
    "You arrive on the south bank; the beach requires another journey.",
  ],
  ["Mesa da Outra Margem", "Table Across the River"],
  [
    "Atravessa o rio para um turno com vista.",
    "Cross the river for a shift with a view.",
  ],
  ["Praia de Carcavelos", "Carcavelos Beach"],
  [
    "O comboio leva-te à estação; uma caminhada leva-te ao mar.",
    "The train takes you to the station; a walk takes you to the sea.",
  ],
  ["Escola de Surf Linha Azul", "Blue Line Surf School"],
  [
    "Uma iniciação ao surf com equipamento incluído.",
    "An introduction to surfing with equipment included.",
  ],
  ["Jardim da Estrela", "Estrela Garden"],
  [
    "Corre, descansa ou ajuda a cuidar do jardim.",
    "Run, rest, or help care for the garden.",
  ],
  ["Associação Mãos Abertas", "Open Hands Community Centre"],
  [
    "Ajuda o bairro e cumpre tarefas de serviço comunitário.",
    "Help the neighbourhood and complete community service tasks.",
  ],
  ["Estúdio Horizonte", "Horizon Studio"],
  [
    "Pequenas tarefas técnicas com espaço para aprender.",
    "Small technical tasks with room to learn.",
  ],
  ["Passeio dos Oceanos", "Oceans Promenade"],
  [
    "Espaço para conversar e esticar as pernas junto ao rio.",
    "Space to talk and stretch your legs by the river.",
  ],
  ["Descansar no teu quarto", "Rest in your room"],
  ["Tomar um duche", "Take a shower"],
  ["Preparar uma refeição", "Prepare a meal"],
  ["Pedir uma bica", "Order an espresso"],
  ["Servir às mesas", "Wait tables"],
  ["Comprar pão e fruta", "Buy bread and fruit"],
  ["Curso breve de atendimento", "Short customer service course"],
  ["Organizar encomendas", "Organise orders"],
  ["Conversar na praça", "Talk in the square"],
  ["Parar no miradouro", "Stop at the viewpoint"],
  ["Ouvir uma sessão de fado", "Listen to a fado session"],
  ["Dançar e conhecer a pista", "Dance and meet people"],
  ["Preparar o serviço", "Prepare for service"],
  ["Preparar uma fornada", "Prepare a batch"],
  ["Passear à beira-rio", "Walk by the river"],
  ["Jogar uma partida amigável", "Play a friendly match"],
  ["Fazer um circuito de treino", "Do a workout circuit"],
  ["Passear pelo cais", "Walk along the pier"],
  ["Ajudar no almoço", "Help with lunch service"],
  ["Caminhar na praia", "Walk on the beach"],
  ["Experimentar uma aula de surf", "Try a surf lesson"],
  ["Correr no jardim", "Run in the garden"],
  ["Ajudar a associação", "Help the community centre"],
  ["Rever uma página", "Review a web page"],
  ["Passear junto ao rio", "Walk along the river"],
  ["Consultar ligações e descontrair", "Check connections and unwind"],
  ["Falar com a assistência jurídica", "Talk to legal assistance"],
  ["Conhecer os teus direitos no jogo", "Learn your in-game rights"],
  [
    "Uma mesa espera há mais tempo. O que fazes?",
    "One table has waited longer. What do you do?",
  ],
  ["Atendo por ordem de chegada", "Serve in order of arrival"],
  ["Ignoro a mesa", "Ignore the table"],
  [
    "Um cliente recebeu um pedido errado. Qual é a melhor resposta?",
    "A customer received the wrong order. What is the best response?",
  ],
  ["Ouvir e corrigir o pedido", "Listen and correct the order"],
  ["Culpar o cliente", "Blame the customer"],
  [
    "Como separas duas encomendas semelhantes?",
    "How do you separate two similar orders?",
  ],
  ["Confirmo o nome e a referência", "Check the name and reference"],
  ["Escolho ao acaso", "Choose at random"],
  [
    "Antes de preparar os pratos, o que verificas?",
    "Before preparing the dishes, what do you check?",
  ],
  ["Ingredientes e pedidos", "Ingredients and orders"],
  ["Só a decoração", "Only the decoration"],
  [
    "A fornada está pronta. Qual é o próximo passo?",
    "The batch is ready. What is the next step?",
  ],
  ["Retirar e deixar arrefecer", "Remove it and let it cool"],
  ["Deixar no forno", "Leave it in the oven"],
  [
    "Um colega está desmarcado. O que escolhes?",
    "A teammate is unmarked. What do you choose?",
  ],
  ["Passar a bola", "Pass the ball"],
  ["Tentar um remate", "Try a shot"],
  [
    "Antes de servir a mesa, confirmas…",
    "Before serving the table, you check…",
  ],
  ["Os pedidos de cada pessoa", "Each person's order"],
  ["A cor das cadeiras", "The colour of the chairs"],
  ["Antes de entrar na água, deves…", "Before entering the water, you should…"],
  [
    "Ouvir o instrutor e verificar as condições",
    "Listen to the instructor and check the conditions",
  ],
  ["Entrar sem orientação", "Enter without guidance"],
  [
    "Uma ligação não funciona. O que fazes?",
    "A link does not work. What do you do?",
  ],
  ["Verifico o destino e corrijo", "Check the destination and fix it"],
  ["Escondo o erro", "Hide the error"],
  ["ATLÂNTICO", "ATLANTIC"],
  [
    "Mapa ilustrado de Lisboa e arredores. Usa os botões dos bairros ou a vista de lista.",
    "Illustrated map of Lisbon and its surroundings. Use the neighbourhood buttons or list view.",
  ],
  ["Ilustração da praia de Carcavelos", "Illustration of Carcavelos Beach"],
  [
    "Ilustração de um espaço do bairro",
    "Illustration of a neighbourhood place",
  ],
];

for (const [key, value] of Object.entries(pt))
  pairs.push([value, en[key as keyof typeof pt]]);
const phrases = Object.fromEntries(pairs) as Record<string, string>;
const orderedPhrases = Object.keys(phrases).sort((a, b) => b.length - a.length);

export function translateText(value: string, locale: Locale) {
  if (locale === "pt" || !value.trim()) return value;
  const leading = value.match(/^\s*/)?.[0] ?? "";
  const trailing = value.match(/\s*$/)?.[0] ?? "";
  let core = value.trim().replace(/\s+/g, " ");
  if (phrases[core]) return leading + phrases[core] + trailing;
  for (const source of orderedPhrases)
    if (core.includes(source)) core = core.split(source).join(phrases[source]);
  return leading + core + trailing;
}

type Tracked = { source: string; rendered: string };
export type DomTranslationState = {
  text: WeakMap<Node, Tracked>;
  attrs: WeakMap<Element, Map<string, Tracked>>;
};
export const createDomTranslationState = (): DomTranslationState => ({
  text: new WeakMap(),
  attrs: new WeakMap(),
});

export function translateDom(
  root: Node,
  locale: Locale,
  state: DomTranslationState,
) {
  const doc = root.ownerDocument || (root as Document);
  const applyText = (node: Node) => {
    const current = node.nodeValue ?? "";
    let tracked = state.text.get(node);
    if (!tracked || current !== tracked.rendered)
      tracked = { source: current, rendered: current };
    const next = translateText(tracked.source, locale);
    tracked.rendered = next;
    state.text.set(node, tracked);
    if (current !== next) node.nodeValue = next;
  };
  const applyAttrs = (element: Element) => {
    let attrs = state.attrs.get(element) || new Map<string, Tracked>();
    for (const name of ["aria-label", "placeholder", "title"]) {
      const current = element.getAttribute(name);
      if (current === null) continue;
      let tracked = attrs.get(name);
      if (!tracked || current !== tracked.rendered)
        tracked = { source: current, rendered: current };
      const next = translateText(tracked.source, locale);
      tracked.rendered = next;
      attrs.set(name, tracked);
      if (current !== next) element.setAttribute(name, next);
    }
    state.attrs.set(element, attrs);
  };
  const apply = (node: Node) =>
    node.nodeType === Node.TEXT_NODE
      ? applyText(node)
      : node.nodeType === Node.ELEMENT_NODE && applyAttrs(node as Element);
  apply(root);
  const walker = doc.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
  );
  let node: Node | null;
  while ((node = walker.nextNode())) apply(node);
}
