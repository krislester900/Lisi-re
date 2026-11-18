import { Story } from '../types/story';

export const EDITORIAL_OPENING_STORIES: Story[] = [
  {
    storyId: 'editorial-sample-1',
    authorId: 'editorial-lisiere',
    authorName: 'Note d’ouverture',
    title: "Choisir l'informatique pour enfin parler aux autres",
    excerpt:
      "Quand les conversations spontanées restent bloquées à la gorge, construire un espace simple devient une manière sincère d'aller vers les gens.",
    content: `Pendant longtemps, j'ai regardé les conversations de groupe comme une langue étrangère dont je comprenais chaque mot sans jamais trouver le bon moment pour entrer dans la phrase. On croit souvent que la timidité est un manque d'intérêt pour les autres. En réalité, c'est parfois tout l'inverse : on écoute si fort que l'on a peur d'abîmer l'instant avec une parole maladroite.

Quand j'ai choisi l'informatique, ce n'était pas pour m'enfermer devant un écran. C'était la seule formation qui me donnait le droit de bâtir quelque chose à partir de rien, à mon rythme, sans avoir à hausser la voix. Derrière une interface claire, une page bien structurée ou un espace d'échange calme, on peut tendre la main autrement.

Créer un lieu où chacun dépose un morceau de son histoire — sans course aux applaudissements, sans bruit inutile — c'est offrir aux personnes discrètes un pont solide vers celles qui prennent le temps de lire. Un programme bien pensé n'est jamais froid : il porte l'intention humaine de celui qui l'a dessiné.`,
    theme: 'creation',
    promptQuestion:
      "Pourquoi avez-vous choisi de créer quelque chose qui met les gens en relation ?",
    visibility: 'public',
    readingMinutes: 2,
    resonanceCount: 0,
    echoCount: 0,
    createdAt: null,
    updatedAt: null,
    isEditorialSample: true,
  },
  {
    storyId: 'editorial-sample-2',
    authorId: 'editorial-lisiere',
    authorName: 'Note d’ouverture',
    title: 'La table près de la fenêtre, à la bibliothèque',
    excerpt:
      "Il suffit parfois d'un carnet ouvert et d'une question honnête pour transformer deux solitudes parallèles en une conversation véritable.",
    content: `Chaque mardi matin d'hiver, nous nous asseyions à la même longue table en bois, chacun absorbé par ses notes et son silence. Pendant trois semaines, nous n'avons échangé que des hochements de tête polis en déplaçant une chaise.

Le quatrième mardi, l'encre de mon stylo a refusé de couler au milieu d'un brouillon. Mon voisin a posé son propre crayon entre nous deux sans un mot, puis a demandé simplement : « Vous écrivez quelque chose que vous gardez pour vous, ou pour quelqu'un ? »

Cette question toute simple a ouvert une heure entière d'échange. Aucun de nous deux n'aimait les discussions superficielles sur la météo. Nous avions simplement besoin d'un point d'ancrage réel — une histoire, un doute, un projet — pour oser parler vrai.`,
    theme: 'rencontres',
    promptQuestion:
      "Quelle rencontre silencieuse a compté pour vous sans que l'autre personne ne le sache ?",
    visibility: 'public',
    readingMinutes: 2,
    resonanceCount: 0,
    echoCount: 0,
    createdAt: null,
    updatedAt: null,
    isEditorialSample: true,
  },
  {
    storyId: 'editorial-sample-3',
    authorId: 'editorial-lisiere',
    authorName: 'Note d’ouverture',
    title: "Ce que l'on comprend mieux une fois posé sur le papier",
    excerpt:
      'Écrire sans urgence permet de trier ce qui pèse et de préparer des mots justes que quelqu’un d’autre reconnaîtra peut-être.',
    content: `À l'oral, tout va vite. On répond pour ne pas laisser un blanc s'installer, on simplifie ce qu'on ressent pour rester léger, et l'on rentre chez soi avec l'impression de n'avoir dit que la moitié de ce qu'on pensait.

À l'écrit, le silence cesse d'être gênant : il devient la marge blanche autour des phrases. On peut relire un paragraphe, chercher le mot qui sonne juste, dire ce que l'on a traversé sans craindre d'être interrompu. Et lorsque quelqu'un, ailleurs, lit ces lignes et écrit simplement « moi aussi », la distance disparaît d'un seul coup.`,
    theme: 'solitudes',
    promptQuestion:
      "À quel moment avez-vous ressenti que le silence pesait moins lorsque vous l'écriviez ?",
    visibility: 'public',
    readingMinutes: 2,
    resonanceCount: 0,
    echoCount: 0,
    createdAt: null,
    updatedAt: null,
    isEditorialSample: true,
  },
];
