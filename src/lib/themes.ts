import {
  EchoReplyType,
  ReleaseCadence,
  SeriesStatus,
  StoryFormat,
  StoryThemeId,
  WallAccentTone,
} from '../types/story';

export type SalonEmblemType = 'bridge' | 'horizon' | 'chairs' | 'leaf' | 'cup';

export interface SalonPalette {
  /** Accessible deep color for solid buttons with white text (>= 4.5:1) */
  accent: string;
  /** Darker hover shade */
  accentHover: string;
  /** High-contrast text accent on light surfaces */
  textAccent: string;
  /** Signature decorative hue (hairline borders, emblem linework) */
  swatch: string;
  /** Soft tinted surface background */
  softBg: string;
  /** Subtle border tint matching the salon's hue */
  borderTint: string;
}

export interface ThemeDefinition {
  id: StoryThemeId;
  romanIndex: string;
  salonName: string;
  shortSalonName: string;
  label: string;
  shortLabel: string;
  atmosphere: string;
  description: string;
  curatorialNote: string;
  epigraph: string;
  roomPillars: Array<{ title: string; body: string }>;
  promptQuestion: string;
  starterSentence: string;
  invitationTopics: string[];
  imageUrl: string;
  imageAlt: string;
  imageFit?: 'cover' | 'contain';
  imagePosition?: string;
  emblem: SalonEmblemType;
  palette: SalonPalette;
}

export const STORY_THEMES: ThemeDefinition[] = [
  {
    id: 'creation',
    romanIndex: 'I',
    salonName: 'L’Atelier des Passerelles',
    shortSalonName: 'Atelier',
    label: 'Créer pour relier',
    shortLabel: 'Créer pour relier',
    atmosphere: 'Encre bleu nuit · Table à dessin & carnets ouverts',
    description:
      'Pourquoi nous fabriquons des outils, des textes ou des logiciels : ce que créer permet de dire lorsque les mots manquent.',
    curatorialNote:
      'Ce salon rassemble celles et ceux qui construisent — un code, une histoire, une image, un lieu — parce que fabriquer reste leur manière la plus sincère d’aller vers les autres.',
    epigraph:
      '« Créer, c’est parfois la façon la plus douce de dire bonjour sans savoir par où commencer. »',
    roomPillars: [
      {
        title: 'Ce qu’on y dépose',
        body: 'L’histoire derrière un projet, un code, un objet ou un carnet qui cherche à rapprocher les gens.',
      },
      {
        title: 'L’esprit de la pièce',
        body: 'Curiosité artisanale et sincérité : on parle autant des doutes de fabrication que du but humain.',
      },
      {
        title: 'Comment réagir',
        body: 'Demandez ce qui a déclenché l’idée, ou racontez à votre tour comment vous créez pour relier.',
      },
    ],
    promptQuestion:
      'Pourquoi avez-vous choisi de créer quelque chose qui met les gens en relation ?',
    starterSentence:
      "J'ai choisi ce chemin parce que c'était la seule manière pour moi de...",
    invitationTopics: [
      'Un projet né d’un besoin de lien humain',
      'Pourquoi vous avez choisi votre voie ou votre outil',
      'Ce qu’une création réussit à dire à votre place',
    ],
    imageUrl: '/assets/aistudio/52a122d4ee7625d5a06251d4e7b08308_62cf368f.jpg',
    imageAlt:
      'Plume d’écriture à l’encre noire traçant une courbe déliée sur fond blanc',
    imageFit: 'contain',
    imagePosition: 'center',
    emblem: 'bridge',
    palette: {
      accent: '#1B365D',
      accentHover: '#132744',
      textAccent: '#1B365D',
      swatch: '#1B365D',
      softBg: '#F3F6FA',
      borderTint: '#CBD6E6',
    },
  },
  {
    id: 'premiers-elans',
    romanIndex: 'II',
    salonName: 'La Chambre des Premiers Élans',
    shortSalonName: 'Premiers élans',
    label: 'Premiers élans',
    shortLabel: 'Premiers élans',
    atmosphere: 'Jaune ocre · Fenêtre ouverte sur l’aube',
    description:
      "Les tournants discrets, les choix d'orientation, les passions silencieuses qui tracent une route personnelle.",
    curatorialNote:
      'Une pièce lumineuse dédiée aux débuts incertains, aux doutes avant de se lancer et aux petits déclics qui ont doucement changé la direction d’une vie.',
    epigraph:
      '« Il y a souvent un long silence avant qu’un choix ne devienne évident aux yeux des autres. »',
    roomPillars: [
      {
        title: 'Ce qu’on y dépose',
        body: 'Les carrefours d’orientation, les envies tardives et les premiers pas hésitants.',
      },
      {
        title: 'L’esprit de la pièce',
        body: 'Bienveillance envers les chemins sinueux : personne ici n’avait tout prévu dès le départ.',
      },
      {
        title: 'Comment réagir',
        body: 'Partagez un moment où vous avez vous aussi changé de cap ou douté avant d’avancer.',
      },
    ],
    promptQuestion:
      "Quel déclic ou quelle hésitation a orienté votre parcours jusqu'ici ?",
    starterSentence:
      'Pendant longtemps, je ne savais pas comment expliquer pourquoi...',
    invitationTopics: [
      'Un choix d’études ou de métier longtemps mûri',
      'Le moment précis où une hésitation est devenue un élan',
      'Une passion silencieuse que vous apprenez à montrer',
    ],
    imageUrl: '/assets/aistudio/e008a37428e26e2d55396aa512cf4fb6_8ab4bbb9.jpg',
    imageAlt:
      'Portrait onirique sur fond bleu nuit avec une colombe blanche en plein vol devant le visage',
    imageFit: 'cover',
    imagePosition: 'center',
    emblem: 'horizon',
    palette: {
      accent: '#9A5510',
      accentHover: '#7B430B',
      textAccent: '#8C4D0E',
      swatch: '#CC7722',
      softBg: '#FDF8F0',
      borderTint: '#EAD6B8',
    },
  },
  {
    id: 'rencontres',
    romanIndex: 'III',
    salonName: 'Le Banc des Rencontres',
    shortSalonName: 'Rencontres',
    label: 'Rencontres discrètes',
    shortLabel: 'Rencontres',
    atmosphere: 'Terracotta · Deux chaises face à la lumière',
    description:
      'Ces moments où un inconnu, un camarade ou un échange bref laisse une trace durable sans grand discours.',
    curatorialNote:
      'Ici, on garde la trace des conversations de cinq minutes, des regards bienveillants et des présences qui ont compté sans même le savoir.',
    epigraph:
      '« Certaines rencontres ne durent que quelques instants et éclairent pourtant plusieurs années. »',
    roomPillars: [
      {
        title: 'Ce qu’on y dépose',
        body: 'Un mot reçu au bon moment, une complicité discrète ou un visage croisé dans la foule.',
      },
      {
        title: 'L’esprit de la pièce',
        body: 'Une attention fine portée aux gestes modestes et aux liens qui naissent sans bruit.',
      },
      {
        title: 'Comment réagir',
        body: 'Racontez à votre tour une phrase ou une présence discrète dont vous vous souvenez encore.',
      },
    ],
    promptQuestion:
      "Quelle rencontre silencieuse a compté pour vous sans que l'autre personne ne le sache ?",
    starterSentence:
      "Nous n'avons échangé que quelques phrases, pourtant ce jour-là...",
    invitationTopics: [
      'Une phrase d’un inconnu qui vous accompagne encore',
      'Une amitié née sans grand discours',
      'Quelqu’un que vous aimeriez remercier aujourd’hui',
    ],
    imageUrl: '/assets/aistudio/12f4bb679c1ffa378f9dd2131739e675_16b9edd8.jpg',
    imageAlt:
      'Illustration minimaliste à l’encre noire d’un regard silencieux sur fond blanc',
    imageFit: 'contain',
    imagePosition: 'center',
    emblem: 'chairs',
    palette: {
      accent: '#B54935',
      accentHover: '#943A29',
      textAccent: '#9A3B29',
      swatch: '#E2725B',
      softBg: '#FDF4F2',
      borderTint: '#ECC9C1',
    },
  },
  {
    id: 'solitudes',
    romanIndex: 'IV',
    salonName: 'Le Refuge des Silences',
    shortSalonName: 'Silences',
    label: 'Solitudes partagées',
    shortLabel: 'Solitudes',
    atmosphere: 'Vert sauge · Fauteuil de lin & pluie douce',
    description:
      'Mettre des mots calmes sur la difficulté à communiquer spontanément, et découvrir que d’autres ressentent la même chose.',
    curatorialNote:
      'Un espace sans pression ni bruit pour celles et ceux qui trouvent plus juste d’écrire que de parler fort. Ici, la retenue rapproche au lieu d’isoler.',
    epigraph:
      '« Écrire n’efface pas la timidité, mais cela permet enfin de ne plus la porter seul. »',
    roomPillars: [
      {
        title: 'Ce qu’on y dépose',
        body: 'Les difficultés à communiquer spontanément, les soirs calmes et ce que la page écrite libère.',
      },
      {
        title: 'L’esprit de la pièce',
        body: 'Écoute lente, zéro jugement et respect du rythme de chacun pour répondre ou se confier.',
      },
      {
        title: 'Comment réagir',
        body: 'Un simple « Cela résonne » ou un écho posé montre déjà à l’auteur qu’il a été entendu.',
      },
    ],
    promptQuestion:
      "À quel moment avez-vous ressenti que le silence pesait moins lorsque vous l'écriviez ?",
    starterSentence:
      "Parler spontanément m'a toujours semblé difficile, alors j'ai appris à...",
    invitationTopics: [
      'Ce que l’écriture permet quand la voix reste bloquée',
      'Une soirée calme où l’on apprend à être bien avec soi',
      'Découvrir que d’autres vivent la même timidité',
    ],
    imageUrl: '/assets/aistudio/e8dca1cac4942385ea2d93f3f8f1745c_61c7baf6.jpg',
    imageAlt:
      'Peinture expressive en noir et blanc de mains tenant un livre ouvert dans une atmosphère recueillie',
    imageFit: 'cover',
    imagePosition: 'center',
    emblem: 'leaf',
    palette: {
      accent: '#4D5C2F',
      accentHover: '#3C4824',
      textAccent: '#46542B',
      swatch: '#8A9A5B',
      softBg: '#F4F7EF',
      borderTint: '#CED8BA',
    },
  },
  {
    id: 'quotidien',
    romanIndex: 'V',
    salonName: 'La Table des Petits Riens',
    shortSalonName: 'Petits riens',
    label: 'Petits riens du quotidien',
    shortLabel: 'Petits riens',
    atmosphere: 'Lin & terre d’ombre · Tasse fumante du matin',
    description:
      'Un carnet oublié, un trajet matinal, une tasse de thé : les détails ordinaires qui disent beaucoup de notre vie intérieure.',
    curatorialNote:
      'Le salon des habitudes minuscules et des objets fidèles : parce qu’une façon de nouer son carnet ou d’observer la rue raconte parfois tout d’une personne.',
    epigraph:
      '« Ce sont les gestes minuscules répétés chaque matin qui dessinent le portrait le plus fidèle. »',
    roomPillars: [
      {
        title: 'Ce qu’on y dépose',
        body: 'Une tasse de thé, un trajet en train, un carnet d’annotations ou un détail de la semaine.',
      },
      {
        title: 'L’esprit de la pièce',
        body: 'Rien n’est trop petit pour être raconté dès lors qu’on l’observe avec justesse.',
      },
      {
        title: 'Comment réagir',
        body: 'Rebondissez sur un détail familier ou ouvrez une passerelle autour d’une passion commune.',
      },
    ],
    promptQuestion:
      "Quel détail simple de votre semaine raconte quelque chose d'essentiel sur vous ?",
    starterSentence:
      "C'est une habitude minuscule, presque invisible, mais chaque matin...",
    invitationTopics: [
      'Un rituel du matin ou du soir qui vous rassure',
      'Un objet modeste auquel vous êtes attaché',
      'Un trajet quotidien observé avec attention',
    ],
    imageUrl: '/assets/aistudio/2eca198e090cc0df38c1ed43df081fd3_83173326.jpg',
    imageAlt:
      'Silhouette surréaliste en costume et chapeau melon dont le visage est composé d’une pile de livres devant un ciel nuageux',
    imageFit: 'cover',
    imagePosition: '50% 22%',
    emblem: 'cup',
    palette: {
      accent: '#574A3D',
      accentHover: '#41372D',
      textAccent: '#574A3D',
      swatch: '#8C735B',
      softBg: '#F7F4EE',
      borderTint: '#DDD4C6',
    },
  },
];

export const THEME_MAP: Record<StoryThemeId, ThemeDefinition> = STORY_THEMES.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<StoryThemeId, ThemeDefinition>
);

export const ECHO_TYPE_LABELS: Record<EchoReplyType, { label: string; hint: string }> = {
  comment: {
    label: 'Commentaire',
    hint: 'Laisser un commentaire libre ou un ressenti juste en dessous de l’histoire.',
  },
  resonance: {
    label: 'En écho',
    hint: 'Dire ce qui vous a touché ou fait réfléchir dans ce récit.',
  },
  experience: {
    label: 'Expérience partagée',
    hint: 'Raconter brièvement un moment similaire de votre propre vie.',
  },
  question: {
    label: 'Question ouverte',
    hint: 'Prolonger le dialogue par une question sincère et bienveillante.',
  },
};

export const STORY_FORMAT_LABELS: Record<StoryFormat, { label: string; description: string }> = {
  confession: {
    label: 'Confession',
    description: 'Un texte intime, un souvenir ou une confidence en un seul souffle.',
  },
  roman: {
    label: 'Roman à chapitres',
    description: 'Une histoire suivie publiée chapitre par chapitre, façon feuilleton.',
  },
};

export const RELEASE_CADENCE_LABELS: Record<ReleaseCadence, string> = {
  unique: 'Texte complet',
  hebdomadaire: 'Parution hebdomadaire',
  bihebdomadaire: 'Deux chapitres par semaine',
  libre: 'Au rythme du créateur',
};

export const SERIES_STATUS_LABELS: Record<SeriesStatus, string> = {
  complet: 'Complet',
  'en-cours': 'En cours de parution',
  termine: 'Terminé',
};

export function formatFrenchDate(date: Date | null): string {
  if (!date) return "À l'instant";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "À l'instant";
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `Il y a ${diffHours} h`;
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  }).format(date);
}

export function estimateReadingMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.min(60, Math.ceil(words / 180)));
}

export function formatCumulativeMinutes(totalMinutes: number): string {
  if (totalMinutes <= 0) return '0 min';
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return mins === 0 ? `${hours} h` : `${hours} h ${mins} min`;
}

export const ACCENT_TONE_PALETTES: Record<
  WallAccentTone,
  SalonPalette & { label: string }
> = {
  ink: {
    label: 'Encre nuit',
    ...STORY_THEMES[0].palette,
  },
  ochre: {
    label: 'Ocre doux',
    ...STORY_THEMES[1].palette,
  },
  terracotta: {
    label: 'Terracotta',
    ...STORY_THEMES[2].palette,
  },
  sage: {
    label: 'Vert sauge',
    ...STORY_THEMES[3].palette,
  },
  sand: {
    label: 'Lin & terre',
    ...STORY_THEMES[4].palette,
  },
};
