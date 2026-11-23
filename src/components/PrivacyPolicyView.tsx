import React from 'react';
import { ArrowLeft, Lock, ShieldCheck } from 'lucide-react';

interface PrivacyPolicyViewProps {
  onBackToSalons: () => void;
}

export function PrivacyPolicyView({ onBackToSalons }: PrivacyPolicyViewProps) {
  return (
    <div className="max-w-4xl mx-auto px-6 py-10 sm:py-14 space-y-10">
      <div className="pb-6 border-b border-stone-200 space-y-4">
        <button
          type="button"
          onClick={onBackToSalons}
          className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-200 rounded-md hover:border-stone-400 hover:text-stone-900 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Retour aux salons</span>
        </button>

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-stone-500 inline-flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-[#1B365D]" />
            <span>Protection des données et respect de votre intimité</span>
          </p>
          <h1
            className="font-display text-3xl sm:text-5xl font-medium text-stone-900 leading-tight"
            style={{ textWrap: 'balance' }}
          >
            Politique de confidentialité
          </h1>
          <p className="text-sm text-stone-500">
            Lisière · Plateforme littéraire et d’échanges créée par Kris Ivan N’dri
          </p>
        </div>
      </div>

      <article className="bg-white border border-stone-200 rounded-lg p-7 sm:p-10 space-y-8 text-stone-700 leading-relaxed">
        <section className="space-y-3">
          <h2 className="font-display text-2xl font-medium text-stone-900">
            1. Notre engagement éditorial et humain
          </h2>
          <p className="text-sm sm:text-base">
            Lisière est conçue pour offrir un espace calme d’écriture, de lecture et de rencontre littéraire. Nous ne vendons, ne louons et ne cédons jamais vos données personnelles ni vos textes à des tiers ou à des régies publicitaires.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-2xl font-medium text-stone-900">
            2. Données collectées lors de votre utilisation
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-sm sm:text-base">
            <li>
              <strong>Authentification (Firebase Auth / Google)</strong> : lorsque vous vous connectez, votre identifiant unique, votre nom affiché, votre adresse e-mail (stockée dans un document privé accessible uniquement par vous) et, si vous le souhaitez, votre photo de profil sont enregistrés pour sécuriser votre compte.
            </li>
            <li>
              <strong>Profil public et Mur personnel</strong> : les informations que vous choisissez d’afficher sur votre fiche membre (pseudonyme, biographie, note d’écoute, morceau ou roman favori, cartes de mur) sont visibles selon votre choix de visibilité dans l’annuaire des membres.
            </li>
            <li>
              <strong>Récits, salons et passerelles</strong> : vos récits publics et vos messages dans les salons ouverts sont accessibles aux lecteurs. Vos brouillons privés, vos salons privés sur admission et vos passerelles 1-à-1 restent strictement isolés et protégés par des règles de sécurité Firestore.
            </li>
            <li>
              <strong>Statistiques de lecture</strong> : les compteurs de vues et de résonances permettent uniquement d’afficher vos graphiques de lecture dans « Mon carnet » sans suivi publicitaire externe.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-2xl font-medium text-stone-900">
            3. Musique de lecture et services externes (Spotify, Audius, Deezer)
          </h2>
          <p className="text-sm sm:text-base">
            Le lecteur musical intégré en mode lecture et mode zen fonctionne uniquement à votre demande. Si vous choisissez de connecter votre compte Spotify, la session OAuth est conservée dans un cookie chiffré (<code className="text-xs bg-stone-100 px-1.5 py-0.5 rounded">HttpOnly; Secure</code>) et peut être révoquée à tout moment via le bouton de déconnexion du lecteur musical. L’écoute libre (Audius, extraits) n’exige aucune création de compte tiers.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-2xl font-medium text-stone-900 flex items-center gap-2">
            <Lock className="w-5 h-5 text-[#1B365D]" />
            <span>4. Contrôle, confidentialité des salons privés et suppression</span>
          </h2>
          <p className="text-sm sm:text-base">
            Les salons privés créés par la communauté appliquent les règles d’admission définies par leur créateur : aucun récit ni message interne à un salon privé n’apparaît sur la page « Histoires pêle-mêle » ni aux visiteurs non admis.
          </p>
          <p className="text-sm sm:text-base">
            Vous restez pleinement maître de vos créations : à tout moment, vous pouvez passer un récit en brouillon privé, modifier ou supprimer vos textes, retirer vos cartes de mur, quitter ou fermer un salon que vous avez créé, et modifier votre visibilité dans l’annuaire des membres.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-2xl font-medium text-stone-900">
            5. Protection par âge, avertissements matures et bot de régulation
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-sm sm:text-base">
            <li>
              <strong>Âge strictement privé</strong> : l’âge que vous indiquez lors de la configuration de votre compte ou dans vos réglages est conservé uniquement dans votre espace privé (<code className="text-xs bg-stone-100 px-1.5 py-0.5 rounded">users/&#123;uid&#125;/private/info</code>). Il n’est jamais affiché aux autres membres et sert uniquement à adapter les récits et fils de discussion à votre âge.
            </li>
            <li>
              <strong>Mention « Contenu mature »</strong> : même lorsque votre âge permet l’accès à un récit ou à un fil classé 16+, 18+ ou mature, un bandeau d’avertissement explicite s’affiche avant la lecture.
            </li>
            <li>
              <strong>Cadre éditorial &amp; qualité</strong> : les chapitres de romans demandent au moins deux pages construites (3 000 caractères), les confessions plus de trois lignes, et tout propos haineux, offensant ou incohérent est refusé par le bot de régulation automatique de Lisière avant publication.
            </li>
          </ul>
        </section>

        <section className="pt-4 border-t border-stone-200 text-xs sm:text-sm text-stone-500">
          Dernière mise à jour : Lisière — Maison d’édition participative créée par Kris Ivan N’dri.
        </section>
      </article>
    </div>
  );
}
