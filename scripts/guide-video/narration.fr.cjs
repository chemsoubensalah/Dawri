// Vidéo guide — commentaire en français.
// say : texte lu par la voix (écrit « comme on le prononce » : Daouri, Q R, S M S).
// cap : texte affiché en bas de l'écran pendant ce passage.
module.exports = {
  lang: "fr",
  voice: "fr_FR-siwis-medium",
  card: {
    brand: "Dawri",
    title: "Guide d'utilisation",
    sub: "La file d'attente et les rendez-vous de votre cabinet",
    planTitle: "Au programme",
    plan: ["Ce que voit le patient", "Le tableau de bord de la secrétaire", "Les rendez-vous", "L'écran de la salle d'attente", "Les réglages du médecin"],
    endTitle: "Vous savez tout !",
    endSub: "Téléphone, tablette ou ordinateur — en français et en arabe",
  },
  scenes: [
    {
      id: "intro",
      chip: "",
      beats: [
        {
          id: "hello",
          say: "Bonjour docteur, et bienvenue sur Daouri. Daouri gère la file d'attente et les rendez-vous de votre cabinet, sans aucune application à installer. Dans cette vidéo, nous allons voir, pas à pas, tout ce qu'il faut savoir pour travailler avec.",
        },
        {
          id: "plan",
          say: "Nous verrons d'abord ce que voit le patient, puis le tableau de bord de la secrétaire, les rendez-vous, l'écran de la salle d'attente, et enfin les réglages du médecin.",
        },
      ],
    },
    {
      id: "patient-ticket",
      chip: "1 · Côté patient",
      side: { title: "Le patient prend son numéro", points: ["Il scanne le QR code du cabinet", "Il écrit son nom et son téléphone", "Il suit son tour en direct"] },
      beats: [
        {
          id: "page",
          cap: "Le patient scanne le QR code ou ouvre le lien du cabinet",
          say: "Commençons par le patient. Il scanne le code Q R affiché au cabinet, ou il ouvre le lien que vous lui envoyez. Il arrive sur la page de votre cabinet. Il y voit le numéro en cours, le nombre de personnes en attente, et le temps d'attente estimé.",
        },
        {
          id: "form",
          cap: "Nom, téléphone et motif de la visite",
          say: "Pour prendre un numéro, il écrit son nom, son numéro de téléphone, et il choisit le motif de sa visite.",
        },
        {
          id: "code",
          cap: "Un code reçu par SMS confirme son téléphone",
          say: "Il reçoit alors un code par S M S, et il le saisit pour confirmer son téléphone.",
        },
        {
          id: "ticket",
          cap: "Son numéro, et sa place dans la file en direct",
          say: "Et voilà, il a son numéro. Il voit combien de personnes passent avant lui, et la page se met à jour toute seule. Il peut attendre chez lui ou dans sa voiture, et venir quand son tour approche.",
        },
      ],
    },
    {
      id: "patient-book",
      chip: "1 · Côté patient",
      side: { title: "Le patient prend rendez-vous", points: ["Il choisit le jour, puis l'heure", "Il confirme avec son téléphone", "Il retrouve son rendez-vous à tout moment"] },
      beats: [
        {
          id: "pick",
          cap: "Il choisit le jour, puis l'heure",
          say: "Le patient peut aussi prendre rendez-vous à l'avance. Il choisit le jour, puis une heure parmi les créneaux encore libres.",
        },
        {
          id: "confirm",
          cap: "Il confirme avec son nom et son téléphone",
          say: "Il confirme avec son nom, son téléphone, et le code reçu par S M S.",
        },
        {
          id: "done",
          cap: "Le rendez-vous est enregistré",
          say: "Le rendez-vous est enregistré. Le patient peut le retrouver à tout moment, l'enregistrer sur son téléphone, ou l'annuler s'il a un empêchement. Et si vous activez les S M S du cabinet, il reçoit un rappel le matin du rendez-vous.",
        },
      ],
    },
    {
      id: "login",
      chip: "2 · Tableau de bord",
      beats: [
        {
          id: "pin",
          cap: "La secrétaire entre le code secret du cabinet",
          say: "Passons maintenant au cabinet. La secrétaire ouvre Daouri sur l'ordinateur, la tablette ou le téléphone, et elle entre le code secret du cabinet.",
        },
        {
          id: "menu",
          cap: "Le menu : File, Rendez-vous, Statistiques, Affiche QR, Écran de salle, Réglages",
          say: "Voici le tableau de bord. En haut, le menu donne accès à la file, aux rendez-vous, aux statistiques, à l'affiche Q R, à l'écran de salle et aux réglages.",
        },
        {
          id: "panels",
          cap: "À gauche : le patient en consultation et la file. À droite : les rendez-vous du jour",
          say: "À gauche, on voit le patient en consultation, et juste en dessous, la file d'attente. À droite, les rendez-vous du jour et les chiffres de la journée.",
        },
        {
          id: "sound",
          cap: "Le bouton haut-parleur : une annonce sonore à chaque tour",
          say: "Avec le bouton haut-parleur, vous activez le son, pour entendre une annonce à chaque tour.",
        },
      ],
    },
    {
      id: "call",
      chip: "2 · Tableau de bord",
      beats: [
        {
          id: "next",
          cap: "« Suivant » : le patient en cours est terminé, le suivant est appelé",
          say: "Quand le médecin est prêt, cliquez sur Suivant. Le patient en cours est terminé, et le suivant est appelé. Son numéro s'affiche sur l'écran de la salle, et il est prévenu sur son téléphone.",
        },
        {
          id: "absent",
          cap: "« Absent » : le patient appelé ne s'est pas présenté",
          say: "Si le patient appelé ne se présente pas, cliquez sur Absent, puis confirmez. On passe alors au suivant.",
        },
        {
          id: "recall",
          cap: "« Rappeler » relance l'annonce du numéro",
          say: "Le bouton Rappeler relance l'annonce du numéro.",
        },
        {
          id: "callnow",
          cap: "Le haut-parleur appelle un patient avant son tour",
          say: "Vous voulez appeler quelqu'un avant son tour ? Cliquez sur le haut-parleur, sur sa ligne. Les autres patients gardent leur place.",
        },
        {
          id: "finish",
          cap: "« Terminer — salle vide » : terminer sans appeler le suivant",
          say: "Et si le médecin a besoin d'une pause, cliquez sur Terminer, salle vide. Le patient est terminé, mais personne n'est appelé. Pour reprendre, cliquez sur Appeler le premier.",
        },
      ],
    },
    {
      id: "add",
      chip: "2 · Tableau de bord",
      beats: [
        {
          id: "open",
          cap: "« Ajouter une personne » pour un patient sans smartphone",
          say: "Un patient arrive sans smartphone ? La secrétaire l'ajoute elle-même. Cliquez sur Ajouter une personne.",
        },
        {
          id: "fill",
          cap: "Son nom, son téléphone et le motif de la visite",
          say: "Écrivez son nom, son téléphone si vous l'avez, et choisissez le motif de la visite.",
        },
        {
          id: "print",
          cap: "Cochez « Imprimer le ticket » pour lui donner son numéro sur papier",
          say: "Cochez Imprimer le ticket, puis validez. Le ticket sort sur votre imprimante thermique, avec son numéro et un code Q R pour suivre son tour.",
        },
      ],
    },
    {
      id: "reorder",
      chip: "2 · Tableau de bord",
      beats: [
        {
          id: "drag",
          cap: "Glissez un patient par la poignée ⠿ pour changer sa place",
          say: "Pour changer l'ordre de la file, attrapez un patient par la poignée, à gauche de son numéro, et faites-le glisser à la place que vous voulez.",
        },
        {
          id: "after",
          cap: "L'attente estimée de chacun se met à jour toute seule",
          say: "L'attente estimée de chaque patient se met à jour toute seule.",
        },
      ],
    },
    {
      id: "recent",
      chip: "2 · Tableau de bord",
      beats: [
        {
          id: "list",
          cap: "« Passés aujourd'hui » : les patients déjà vus",
          say: "La liste Passés aujourd'hui garde les patients déjà vus dans la journée.",
        },
        {
          id: "restore",
          cap: "« Remettre en file » : le patient revient en tête de la file",
          say: "Quelqu'un est passé par erreur ? Cliquez sur Remettre en file : il revient en tête de la file.",
        },
        {
          id: "nextappt",
          cap: "« Prochain rendez-vous » pour un patient qui sort de consultation",
          say: "Et pour donner un nouveau rendez-vous à un patient qui sort de consultation, cliquez sur Prochain rendez-vous. Son nom et son téléphone sont déjà remplis. Il reste à choisir le jour dans le calendrier, puis l'heure, et à enregistrer.",
        },
      ],
    },
    {
      id: "stop",
      chip: "2 · Tableau de bord",
      beats: [
        {
          id: "off",
          cap: "Arrêter les nouvelles entrées : en fin de journée ou quand la salle est pleine",
          say: "En fin de journée, ou quand la salle est pleine, vous pouvez arrêter les nouvelles entrées avec cet interrupteur. Plus personne ne peut prendre de numéro, mais les patients déjà dans la file gardent leur tour.",
        },
        {
          id: "on",
          cap: "Un clic pour rouvrir",
          say: "Un seul clic suffit pour rouvrir.",
        },
      ],
    },
    {
      id: "appts",
      chip: "3 · Rendez-vous",
      beats: [
        {
          id: "list",
          cap: "Tous les rendez-vous à venir, jour par jour",
          say: "Passons à la page Rendez-vous. Elle montre tous les rendez-vous à venir, jour par jour.",
        },
        {
          id: "search",
          cap: "Recherchez un patient par son nom ou son téléphone",
          say: "Pour retrouver un patient, tapez son nom ou son téléphone dans la recherche.",
        },
        {
          id: "new",
          cap: "« Nouveau rendez-vous » : pour un patient qui appelle ou qui passe au cabinet",
          say: "Un patient appelle, ou passe au cabinet ? Cliquez sur Nouveau rendez-vous. Choisissez le jour dans le calendrier, puis l'heure. Écrivez son nom et son téléphone, et enregistrez. Aucun code n'est demandé : c'est la secrétaire qui inscrit le patient.",
        },
        {
          id: "arrived",
          cap: "« Arrivé » : le patient entre dans la file, en priorité",
          say: "Le jour du rendez-vous, quand le patient arrive, cliquez sur Arrivé. Il entre dans la file, et il passe en priorité.",
        },
        {
          id: "tools",
          cap: "Imprimer le rendez-vous, ou l'annuler",
          say: "Sur chaque ligne, vous pouvez aussi imprimer le rendez-vous, ou l'annuler avec la croix.",
        },
      ],
    },
    {
      id: "tv",
      chip: "4 · Écran de salle",
      beats: [
        {
          id: "show",
          cap: "Sur une télévision ou une tablette dans la salle d'attente",
          say: "L'écran de salle s'ouvre sur une télévision ou une tablette, dans la salle d'attente. Il affiche le numéro appelé et les numéros suivants, sans aucun nom, pour respecter la vie privée des patients.",
        },
        {
          id: "live",
          cap: "À chaque appel, le numéro change tout seul",
          say: "À chaque appel, le numéro change tout seul, avec une annonce sonore. Les patients y trouvent aussi le code Q R pour prendre leur numéro.",
        },
      ],
    },
    {
      id: "tools",
      chip: "4 · Affiche et statistiques",
      beats: [
        {
          id: "qr",
          cap: "« Affiche QR » : à imprimer et à coller à l'entrée du cabinet",
          say: "Dans Affiche Q R, imprimez l'affiche à coller à l'entrée du cabinet. Les patients la scannent pour prendre leur numéro.",
        },
        {
          id: "stats",
          cap: "« Statistiques » : patients par jour, absences, attente moyenne, heures de pointe",
          say: "La page Statistiques montre le nombre de patients par jour, le taux d'absence, l'attente moyenne et les heures de pointe.",
        },
      ],
    },
    {
      id: "settings",
      chip: "5 · Réglages",
      beats: [
        {
          id: "profile",
          cap: "Profil du cabinet : nom, spécialité, adresse, téléphone",
          say: "Terminons par les réglages, réservés au médecin. Dans Profil du cabinet, vous écrivez le nom, la spécialité, l'adresse et le téléphone affichés aux patients.",
        },
        {
          id: "hours",
          cap: "Horaires de prise de numéros, jours fériés et congés",
          say: "Dans Horaires, vous indiquez les heures où l'on peut prendre un numéro. Et dans Congés, vous ajoutez vos jours fériés et vos vacances.",
        },
        {
          id: "reason",
          cap: "Motif de visite : votre liste, avec un maximum par jour pour chaque motif",
          say: "Dans Motif de visite, vous créez votre propre liste : consultation, plombage, extraction. Et vous pouvez fixer un maximum par jour pour chaque motif. Par exemple, six plombages par jour, pas plus.",
        },
        {
          id: "limits",
          cap: "Limites d'inscription : un délai entre deux inscriptions du même téléphone",
          say: "Dans Limites d'inscription, vous choisissez un délai, en jours, entre deux inscriptions du même numéro de téléphone. Vous décidez aussi si la secrétaire peut passer outre.",
        },
        {
          id: "booking",
          cap: "Rendez-vous : durée, patients par créneau, jours à l'avance",
          say: "Dans Rendez-vous, vous activez la réservation en ligne, et vous choisissez la durée d'un rendez-vous, le nombre de patients par créneau, et jusqu'à combien de jours à l'avance on peut réserver.",
        },
        {
          id: "walkin",
          cap: "Journées ouvertes : des jours sans réservation en ligne",
          say: "Avec les journées ouvertes, vous choisissez des jours sans réservation en ligne. Ces jours-là, les patients viennent directement prendre un numéro, et seule la secrétaire peut ajouter un rendez-vous.",
        },
        {
          id: "printing",
          cap: "Impression des tickets : papier, taille, langue, et votre propre mise en page",
          say: "Dans Impression des tickets, vous choisissez la largeur du papier, la taille du texte et la langue. Vous pouvez même composer votre ticket : afficher ou cacher chaque ligne, changer l'ordre, et ajouter votre propre texte. L'aperçu se met à jour en direct.",
        },
        {
          id: "rules",
          cap: "Règles de file : la durée estimée par patient sert à calculer l'attente",
          say: "Dans Règles de file, la durée estimée par patient sert à calculer le temps d'attente affiché aux patients.",
        },
        {
          id: "sms",
          cap: "SMS depuis le téléphone du cabinet : codes et rappels envoyés de votre numéro",
          say: "Dans S M S, vous connectez un téléphone Android du cabinet. Les codes de confirmation et les rappels de rendez-vous partent alors de votre propre numéro, gratuitement.",
        },
        {
          id: "security",
          cap: "Sécurité : votre code secret, et un code séparé pour la secrétaire",
          say: "Enfin, dans Sécurité, vous changez votre code secret, et vous créez un code séparé pour la secrétaire. Elle gère la file, mais elle n'a pas accès aux réglages. N'oubliez pas d'enregistrer après chaque changement.",
        },
      ],
    },
    {
      id: "outro",
      chip: "",
      beats: [
        {
          id: "bye",
          say: "Voilà, vous savez tout. Daouri fonctionne sur téléphone, sur tablette et sur ordinateur, en français et en arabe. Pour toute question, nous sommes à votre écoute. Bonne journée, docteur.",
        },
      ],
    },
  ],
};
