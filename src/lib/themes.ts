import { EchoReplyType, StoryThemeId } from '../types/story';

export interface ThemeDefinition {
  id: StoryThemeId;
  label: string;
  shortLabel: string;
  description: string;
  promptQuestion: string;
  starterSentence: string;
}

export const STORY_THEMES: ThemeDefinition[] = [
  {
    id: 'creation',
    label: 'Créer pour relier',
    shortLabel: 'Créer pour relier',
    description:
      'Pourquoi nous fabriquons des outils, des textes ou des logiciels : ce que créer permet de dire lorsque les mots manquent.',
    promptQuestion:
      "Pourquoi avez-vous choisi de créer quelque chose qui met les gens en relation ?",
    starterSentence:
      "J'ai choisi ce chemin parce que c'était la seule manière pour moi de...",
  },
  {
    id: 'premiers-elans',
    label: 'Premiers élans',
    shortLabel: 'Premiers élans',
    description:
      "Les tournants discrets, les choix d'orientation, les passions silencieuses qui tracent une route personnelle.",
    promptQuestion:
      "Quel déclic ou quelle hésitation a orienté votre parcours jusqu'ici ?",
    starterSentence:
      "Pendant longtemps, je ne savais pas comment expliquer pourquoi...",
  },
  {
    id: 'rencontres',
    label: 'Rencontres discrètes',
    shortLabel: 'Rencontres',
    description:
      'Ces moments où un inconnu, un camarade ou un échange bref laisse une trace durable sans grand discours.',
    promptQuestion:
      "Quelle rencontre silencieuse a compté pour vous sans que l'autre personne ne le sache ?",
    starterSentence:
      "Nous n'avons échangé que quelques phrases, pourtant ce jour-là...",
  },
  {
    id: 'solitudes',
    label: 'Solitudes partagées',
    shortLabel: 'Solitudes',
    description:
      'Mettre des mots calmes sur la difficulté à communiquer spontanément, et découvrir que d’autres ressentent la même chose.',
    promptQuestion:
      "À quel moment avez-vous ressenti que le silence pesait moins lorsque vous l'écriviez ?",
    starterSentence:
      "Parler spontanément m'a toujours semblé difficile, alors j'ai appris à...",
  },
  {
    id: 'quotidien',
    label: 'Petits riens du quotidien',
    shortLabel: 'Petits riens',
    description:
      'Un carnet oublié, un trajet matinal, une tasse de thé : les détails ordinaires qui disent beaucoup de notre vie intérieure.',
    promptQuestion:
      "Quel détail simple de votre semaine raconte quelque chose d'essentiel sur vous ?",
    starterSentence:
      "C'est une habitude minuscule, presque invisible, mais chaque matin...",
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
