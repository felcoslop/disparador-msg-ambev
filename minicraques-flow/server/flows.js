export const STATES = {
    START: 0,
    FOLLOW_UP_1: 1,
    POSITIVE_RESPONSE: 2,
    AFTER_PHOTOS: 3,
    FINAL_TIMEOUT: 4
};

export const FLOW_CONFIG = {
    [STATES.START]: {
        type: 'buttons',
        bodyText: (data) => `Olá ${data.nome_pessoa || 'amigo(a)'} do bairro ${data.nome_bairro || 'região'}! 👋\n\nSou o Felipe da *MiniCraques.com* ⚽ – conjuntos infantis de futebol que as crianças amam!\n\nQuer ver os lançamentos da temporada 26/27?`,
        buttons: [
            { id: 'sim_lancamentos', title: '✅ Sim, me mostre!' },
            { id: 'sair', title: '❌ Sair' }
        ],
        handlers: {
            'sim_lancamentos': STATES.POSITIVE_RESPONSE,
            'sair': 'EXIT'
        }
    },

    [STATES.FOLLOW_UP_1]: {
        type: 'buttons',
        bodyText: (data) => `Oi ${data.nome_pessoa || ''}! Desculpa o atraso 😊\n\nSó queria te apresentar meu trabalho na *MiniCraques.com* – melhores conjuntos infantis de futebol pro seu pequeno craque!\n\nSe precisar, é só chamar!`,
        buttons: [
            { id: 'sair', title: '❌ Sair' }
        ],
        handlers: {
            'sair': 'EXIT',
            '*': STATES.POSITIVE_RESPONSE // Any other response goes to next state
        }
    },

    [STATES.POSITIVE_RESPONSE]: {
        type: 'buttons',
        bodyText: (data) => `Ótimo! Lembro que você já comprou na loja 😄 Eu sou o Felipe mesmo!\n\nPosso te mostrar meus *conjuntos infantis de futebol temporada 26/27*? Qual estilo prefere?`,
        buttons: [
            { id: 'europeus', title: '🇪🇺 Europeus' },
            { id: 'brasileiros', title: '🇧🇷 Brasileiros' },
            { id: 'frio', title: '🧥 Conjuntos de Frio' }
        ],
        handlers: {
            'europeus': { next: STATES.AFTER_PHOTOS, type: 'EUROPE' },
            'brasileiros': { next: STATES.AFTER_PHOTOS, type: 'BRAZIL' },
            'frio': { next: STATES.AFTER_PHOTOS, type: 'COLD' }
        }
    },

    [STATES.AFTER_PHOTOS]: {
        type: 'list',
        bodyText: 'Gostou? Veja outras opções da *MiniCraques.com*:',
        buttonText: 'Ver Opções',
        sections: [
            {
                title: 'Produtos',
                rows: [
                    { id: 'agasalhos', title: '🧥 Agasalhos', description: 'Conjuntos de frio' },
                    { id: 'brasileiros', title: '🇧🇷 Times Brasileiros', description: 'Top 9 torcidas' },
                    { id: 'europeus', title: '🇪🇺 Times Europeus', description: 'Real, Barça e mais' }
                ]
            },
            {
                title: 'Atendimento',
                rows: [
                    { id: 'atendente', title: '💬 Falar com Felipe', description: '+55 31 7320-0750' },
                    { id: 'sair', title: '❌ Sair do Fluxo', description: 'Encerrar conversa' }
                ]
            }
        ],
        handlers: {
            'agasalhos': { next: STATES.AFTER_PHOTOS, type: 'JACKETS' },
            'brasileiros': { next: STATES.AFTER_PHOTOS, type: 'BRAZIL' },
            'europeus': { next: STATES.AFTER_PHOTOS, type: 'EUROPE' },
            'atendente': 'SUPPORT',
            'sair': 'EXIT'
        }
    }
};

export const BRAZILIAN_TEAMS = [
    'Flamengo', 'Corinthians', 'São Paulo', 'Palmeiras', 'Vasco',
    'Atlético-MG', 'Internacional', 'Cruzeiro', 'Grêmio'
];

// Product image URLs (placeholder - replace with real minicraques.com URLs)
export const PRODUCT_IMAGES = {
    EUROPE: [
        'https://minicraques.com/images/real-madrid-26.jpg',
        'https://minicraques.com/images/barcelona-26.jpg',
        'https://minicraques.com/images/psg-26.jpg'
    ],
    BRAZIL: [
        'https://minicraques.com/images/flamengo-26.jpg',
        'https://minicraques.com/images/palmeiras-26.jpg',
        'https://minicraques.com/images/corinthians-26.jpg'
    ],
    COLD: [
        'https://minicraques.com/images/agasalho-brasil-26.jpg',
        'https://minicraques.com/images/jaqueta-kids.jpg'
    ],
    JACKETS: [
        'https://minicraques.com/images/agasalho-premium.jpg'
    ]
};

export const SUPPORT_MSG = `Para falar diretamente com o Felipe, clique aqui:\n\nhttps://wa.me/553173200750\n\nOu ligue: +55 31 7320-0750\n\nEstamos à disposição! ⚽`;

export const EXIT_MSG = `Entendido! Se precisar de conjuntos infantis *MiniCraques.com*, sabe onde me achar! 😊\n\nDesculpa qualquer incômodo. Até logo! 👋`;

export const TIMEOUT_FINAL_MSG = (nome) => `Oi ${nome || ''}, caso precise de conjuntos infantis de futebol *minicraques.com*, sabe onde me encontrar!\n\nDesculpa qualquer incômodo anterior! 😊⚽`;
