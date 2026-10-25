// Demo data. Every home, price and consumption here is fictional.
// The interface never reads home.months directly: use homeMonthsKwh(home, key).

export const META = {
  version: '0.1.0',
  dataUpdated: '2026-10-01',
};

// Demo emission factors in kg CO2e per kWh. Not official values.
export const CO2_FACTORS = { FR: 0.06, ES: 0.16 };

// 24 hourly weights in percent, turned into shares that sum to 1.
const profile = (weights) => weights.map((w) => w / 100);

export const HOMES = [
  {
    id: 'clara',
    name: 'Clara',
    country: 'FR',
    city: 'Tours',
    kind: 'house',
    climate: 'heating',
    surface: 120,
    occupants: 4,
    heating: {
      en: 'Electric convector heaters, electric water heater',
      fr: 'Convecteurs électriques, chauffe-eau électrique',
      es: 'Convectores eléctricos, termo eléctrico',
    },
    unit: 'kWh',
    months: {
      thisYear: [1500, 1320, 1080, 720, 480, 360, 330, 320, 420, 760, 1180, 1430],
      lastYear: [1580, 1400, 1120, 750, 500, 370, 340, 330, 430, 800, 1230, 1500],
    },
    price: 0.2,
    offPeakPrice: 0.16,
    fixedPerMonth: 15,
    fixedLabel: 'subscription',
    defaultThreshold: 1000,
    breakdown: { climate: 0.55, hotWater: 0.17, appliances: 0.16, cooking: 0.06, other: 0.06 },
    dayProfile: profile([3, 3, 3, 3, 3, 3, 4, 7, 5, 3, 3, 3, 4, 3, 3, 3, 3, 4, 7, 8, 7, 6, 5, 4]),
    actions: [
      {
        id: 'clara-setpoint',
        kind: 'reduce',
        kwhPerYear: 380,
        cost: 0,
        effort: 1,
        confidence: 'medium',
        label: {
          en: 'Lower the heating by 1 °C',
          fr: 'Baisser le chauffage de 1 °C',
          es: 'Bajar la calefacción 1 °C',
        },
        assumption: {
          en: 'Demo hypothesis: about 7% of heating use per degree lower, applied to the estimated heating share.',
          fr: 'Hypothèse de démonstration : environ 7 % de la consommation de chauffage par degré en moins, appliqués à la part de chauffage estimée.',
          es: 'Hipótesis de demostración: alrededor de un 7 % del consumo de calefacción por cada grado menos, aplicado a la parte de calefacción estimada.',
        },
      },
      {
        id: 'clara-water-offpeak',
        kind: 'shift',
        kwhPerYear: 1600,
        peakPrice: 0.2,
        offPeakPrice: 0.16,
        cost: 0,
        effort: 1,
        confidence: 'high',
        label: {
          en: 'Heat water during off-peak hours',
          fr: "Chauffer l'eau en heures creuses",
          es: 'Calentar el agua en horas valle',
        },
        assumption: {
          en: 'Demo hypothesis: the whole water heater use (about 1,600 kWh a year) moves to off-peak hours at 0.16 €/kWh instead of 0.20 €/kWh. No kWh avoided.',
          fr: 'Hypothèse de démonstration : toute la consommation du chauffe-eau (environ 1 600 kWh par an) passe en heures creuses à 0,16 €/kWh au lieu de 0,20 €/kWh. Aucun kWh évité.',
          es: 'Hipótesis de demostración: todo el consumo del termo (unos 1.600 kWh al año) pasa a horas valle a 0,16 €/kWh en lugar de 0,20 €/kWh. No se evita ningún kWh.',
        },
      },
      {
        id: 'clara-thermostats',
        kind: 'reduce',
        kwhPerYear: 700,
        cost: 240,
        effort: 2,
        confidence: 'medium',
        label: {
          en: 'Programmable thermostats in each room',
          fr: 'Thermostats programmables dans chaque pièce',
          es: 'Termostatos programables en cada habitación',
        },
        assumption: {
          en: 'Demo hypothesis: rooms are heated only when used, about 13% less heating. The fitting cost is an estimate.',
          fr: "Hypothèse de démonstration : les pièces ne sont chauffées que lorsqu'elles sont utilisées, soit environ 13 % de chauffage en moins. Le coût de pose est une estimation.",
          es: 'Hipótesis de demostración: las habitaciones solo se calientan cuando se usan, alrededor de un 13 % menos de calefacción. El coste de instalación es una estimación.',
        },
      },
      {
        id: 'clara-attic',
        kind: 'reduce',
        kwhPerYear: 1500,
        cost: 2400,
        effort: 3,
        confidence: 'low',
        label: {
          en: 'Insulate the attic',
          fr: 'Isoler les combles',
          es: 'Aislar el desván',
        },
        assumption: {
          en: 'Demo hypothesis: about 28% less heating after insulation. The result depends on the existing insulation and on the work done.',
          fr: "Hypothèse de démonstration : environ 28 % de chauffage en moins après isolation. Le résultat dépend de l'isolation existante et des travaux réalisés.",
          es: 'Hipótesis de demostración: alrededor de un 28 % menos de calefacción tras el aislamiento. El resultado depende del aislamiento existente y de la obra realizada.',
        },
      },
      {
        id: 'clara-standby',
        kind: 'reduce',
        kwhPerYear: 150,
        cost: 20,
        effort: 1,
        confidence: 'high',
        label: {
          en: 'Switch off devices on standby',
          fr: 'Éteindre les appareils en veille',
          es: 'Apagar los aparatos en espera',
        },
        assumption: {
          en: 'Demo hypothesis: about 17 W of standby power cut 24 hours a day with switchable power strips.',
          fr: 'Hypothèse de démonstration : environ 17 W de veille coupés 24 h sur 24 grâce à des multiprises à interrupteur.',
          es: 'Hipótesis de demostración: unos 17 W en espera cortados las 24 horas con regletas con interruptor.',
        },
      },
      {
        id: 'clara-power',
        kind: 'fixed',
        kwhPerYear: 0,
        fixedSavingPerMonth: 2,
        cost: 0,
        effort: 2,
        confidence: 'medium',
        label: {
          en: 'Lower the subscribed power by one step',
          fr: "Baisser la puissance souscrite d'un cran",
          es: 'Bajar un escalón la potencia contratada',
        },
        assumption: {
          en: 'Demo hypothesis: one step lower saves about 2 € a month on the subscription, if the highest use stays below the new limit.',
          fr: "Hypothèse de démonstration : un cran de moins fait gagner environ 2 € par mois sur l'abonnement, si les appels de puissance restent sous la nouvelle limite.",
          es: 'Hipótesis de demostración: un escalón menos ahorra unos 2 € al mes en la parte fija, si los picos de uso se mantienen por debajo del nuevo límite.',
        },
      },
    ],
    activity: [
      {
        date: '2026-10-14',
        text: {
          en: 'Heating season started (demo event)',
          fr: 'Début de la saison de chauffage (événement de démonstration)',
          es: 'Inicio de la temporada de calefacción (evento de demostración)',
        },
      },
      {
        date: '2026-10-02',
        text: {
          en: 'September bill estimate updated',
          fr: 'Estimation de la facture de septembre mise à jour',
          es: 'Estimación de la factura de septiembre actualizada',
        },
      },
      {
        date: '2026-09-18',
        text: {
          en: 'Home profile created',
          fr: 'Profil du logement créé',
          es: 'Perfil de la vivienda creado',
        },
      },
    ],
  },
  {
    id: 'javier',
    name: 'Javier',
    country: 'ES',
    city: 'Málaga',
    kind: 'apartment',
    climate: 'cooling',
    surface: 75,
    occupants: 2,
    heating: {
      en: 'Reversible air conditioning, electric water heater',
      fr: 'Climatisation réversible, chauffe-eau électrique',
      es: 'Aire acondicionado reversible, termo eléctrico',
    },
    unit: 'Wh',
    months: {
      thisYear: [310000, 300000, 290000, 280000, 330000, 460000, 600000, 640000, 500000, 300000, 280000, 310000],
      lastYear: [320000, 300000, 280000, 270000, 310000, 420000, 570000, 610000, 470000, 290000, 280000, 300000],
    },
    price: 0.18,
    offPeakPrice: 0.12,
    fixedPerMonth: 20,
    fixedLabel: 'potencia',
    defaultThreshold: 450,
    breakdown: { climate: 0.38, hotWater: 0.18, appliances: 0.26, cooking: 0.1, other: 0.08 },
    dayProfile: profile([2, 3, 2, 2, 2, 2, 2, 3, 4, 3, 3, 4, 5, 6, 7, 7, 8, 7, 6, 5, 5, 5, 4, 3]),
    actions: [
      {
        id: 'javier-ac-setpoint',
        kind: 'reduce',
        kwhPerYear: 120,
        cost: 0,
        effort: 1,
        confidence: 'medium',
        label: {
          en: 'Set the air conditioning 1 °C higher',
          fr: 'Régler la climatisation 1 °C plus haut',
          es: 'Subir 1 °C la temperatura del aire acondicionado',
        },
        assumption: {
          en: 'Demo hypothesis: about 7% of cooling use per degree higher, applied to the estimated cooling share.',
          fr: 'Hypothèse de démonstration : environ 7 % de la consommation de climatisation par degré en plus, appliqués à la part de climatisation estimée.',
          es: 'Hipótesis de demostración: alrededor de un 7 % del consumo de refrigeración por cada grado más, aplicado a la parte de refrigeración estimada.',
        },
      },
      {
        id: 'javier-blinds',
        kind: 'reduce',
        kwhPerYear: 150,
        cost: 0,
        effort: 1,
        confidence: 'low',
        label: {
          en: 'Close the south blinds in the afternoon',
          fr: "Fermer les stores côté sud l'après-midi",
          es: 'Bajar las persianas del lado sur por la tarde',
        },
        assumption: {
          en: 'Demo hypothesis: less heat comes in, about 9% less cooling. Very dependent on orientation and habits.',
          fr: "Hypothèse de démonstration : moins de chaleur entre, soit environ 9 % de climatisation en moins. Très dépendant de l'orientation et des habitudes.",
          es: 'Hipótesis de demostración: entra menos calor, alrededor de un 9 % menos de refrigeración. Depende mucho de la orientación y de los hábitos.',
        },
      },
      {
        id: 'javier-laundry-offpeak',
        kind: 'shift',
        kwhPerYear: 450,
        peakPrice: 0.18,
        offPeakPrice: 0.12,
        cost: 0,
        effort: 1,
        confidence: 'high',
        label: {
          en: 'Run the washing machine and dishwasher in off-peak hours',
          fr: 'Lancer lave-linge et lave-vaisselle en heures creuses',
          es: 'Poner lavadora y lavavajillas en horas valle',
        },
        assumption: {
          en: 'Demo hypothesis: about 450 kWh a year move from 0.18 €/kWh to the off-peak price of 0.12 €/kWh. No kWh avoided.',
          fr: 'Hypothèse de démonstration : environ 450 kWh par an passent de 0,18 €/kWh au prix heures creuses de 0,12 €/kWh. Aucun kWh évité.',
          es: 'Hipótesis de demostración: unos 450 kWh al año pasan de 0,18 €/kWh al precio de horas valle de 0,12 €/kWh. No se evita ningún kWh.',
        },
      },
      {
        id: 'javier-potencia',
        kind: 'fixed',
        kwhPerYear: 0,
        fixedSavingPerMonth: 3,
        cost: 0,
        effort: 2,
        confidence: 'medium',
        label: {
          en: 'Lower the contracted power (potencia contratada)',
          fr: 'Baisser la puissance contractée (potencia contratada)',
          es: 'Bajar la potencia contratada',
        },
        assumption: {
          en: 'Demo hypothesis: about 3 € a month less on the fixed part, if appliances do not all run at the same time.',
          fr: 'Hypothèse de démonstration : environ 3 € par mois de moins sur la part fixe, si les appareils ne fonctionnent pas tous en même temps.',
          es: 'Hipótesis de demostración: unos 3 € al mes menos en la parte fija, si los aparatos no funcionan todos a la vez.',
        },
      },
      {
        id: 'javier-fan',
        kind: 'reduce',
        kwhPerYear: 200,
        cost: 90,
        effort: 2,
        confidence: 'medium',
        label: {
          en: 'Use a ceiling fan before the air conditioning',
          fr: 'Utiliser un ventilateur de plafond avant la climatisation',
          es: 'Usar un ventilador de techo antes del aire acondicionado',
        },
        assumption: {
          en: 'Demo hypothesis: the fan covers mild days and replaces about 11% of cooling use. The fan price is an estimate.',
          fr: 'Hypothèse de démonstration : le ventilateur suffit les jours doux et remplace environ 11 % de la climatisation. Le prix du ventilateur est une estimation.',
          es: 'Hipótesis de demostración: el ventilador basta en los días templados y sustituye alrededor de un 11 % de la refrigeración. El precio del ventilador es una estimación.',
        },
      },
    ],
    activity: [
      {
        date: '2026-09-30',
        text: {
          en: 'Cooling season ended (demo event)',
          fr: 'Fin de la saison de climatisation (événement de démonstration)',
          es: 'Fin de la temporada de aire acondicionado (evento de demostración)',
        },
      },
      {
        date: '2026-09-03',
        text: {
          en: 'August above the alert threshold',
          fr: "Août au-dessus du seuil d'alerte",
          es: 'Agosto por encima del umbral de alerta',
        },
      },
      {
        date: '2026-07-20',
        text: {
          en: 'Home profile created',
          fr: 'Profil du logement créé',
          es: 'Perfil de la vivienda creado',
        },
      },
    ],
  },
  {
    id: 'nora',
    name: 'Nora',
    country: 'FR',
    city: 'Nantes',
    kind: 'house',
    climate: 'heating',
    surface: 140,
    occupants: 3,
    heating: {
      en: 'Air-to-water heat pump, 3 kWp solar panels',
      fr: 'Pompe à chaleur air-eau, panneaux solaires 3 kWc',
      es: 'Bomba de calor aire-agua, paneles solares de 3 kWp',
    },
    unit: 'MWh',
    months: {
      thisYear: [0.66, 0.57, 0.45, 0.32, 0.24, 0.2, 0.19, 0.2, 0.26, 0.4, 0.56, 0.65],
      lastYear: [0.7, 0.61, 0.49, 0.36, 0.27, 0.22, 0.21, 0.22, 0.29, 0.44, 0.61, 0.68],
      solarExport: [0.02, 0.04, 0.09, 0.14, 0.19, 0.22, 0.24, 0.21, 0.14, 0.08, 0.03, 0.02],
    },
    price: 0.2,
    offPeakPrice: 0.16,
    fixedPerMonth: 15,
    fixedLabel: 'subscription',
    defaultThreshold: 500,
    breakdown: { climate: 0.42, hotWater: 0.18, appliances: 0.24, cooking: 0.08, other: 0.08 },
    dayProfile: profile([4, 4, 4, 4, 4, 4, 5, 6, 5, 3, 2, 2, 2, 2, 2, 3, 4, 6, 7, 7, 8, 4, 4, 4]),
    actions: [
      {
        id: 'nora-midday',
        kind: 'shift',
        kwhPerYear: 500,
        peakPrice: 0.2,
        offPeakPrice: 0.06,
        cost: 0,
        effort: 1,
        confidence: 'medium',
        label: {
          en: 'Run appliances at midday with the solar panels',
          fr: 'Faire tourner les appareils à midi avec les panneaux solaires',
          es: 'Usar los electrodomésticos a mediodía con los paneles solares',
        },
        assumption: {
          en: 'Demo hypothesis: about 500 kWh a year use solar power instead of grid power at 0.20 €/kWh, giving up the demo export value of 0.06 €/kWh. Counted as a shift, no kWh avoided.',
          fr: "Hypothèse de démonstration : environ 500 kWh par an utilisent l'énergie solaire au lieu du réseau à 0,20 €/kWh, en renonçant à la valeur de revente de démonstration de 0,06 €/kWh. Compté comme un décalage, aucun kWh évité.",
          es: 'Hipótesis de demostración: unos 500 kWh al año usan energía solar en lugar de la red a 0,20 €/kWh, renunciando al valor de venta de demostración de 0,06 €/kWh. Se cuenta como un desplazamiento, sin kWh evitados.',
        },
      },
      {
        id: 'nora-setpoint',
        kind: 'reduce',
        kwhPerYear: 140,
        cost: 0,
        effort: 1,
        confidence: 'medium',
        label: {
          en: 'Lower the heat pump setpoint by 1 °C',
          fr: 'Baisser la consigne de la pompe à chaleur de 1 °C',
          es: 'Bajar 1 °C la consigna de la bomba de calor',
        },
        assumption: {
          en: 'Demo hypothesis: about 7% of heating use per degree lower, applied to the estimated heating share.',
          fr: 'Hypothèse de démonstration : environ 7 % de la consommation de chauffage par degré en moins, appliqués à la part de chauffage estimée.',
          es: 'Hipótesis de demostración: alrededor de un 7 % del consumo de calefacción por cada grado menos, aplicado a la parte de calefacción estimada.',
        },
      },
      {
        id: 'nora-water-solar',
        kind: 'shift',
        kwhPerYear: 600,
        peakPrice: 0.2,
        offPeakPrice: 0.06,
        cost: 450,
        effort: 2,
        confidence: 'medium',
        label: {
          en: 'Heat water with the solar surplus',
          fr: "Chauffer l'eau avec le surplus solaire",
          es: 'Calentar el agua con el excedente solar',
        },
        assumption: {
          en: 'Demo hypothesis: a solar router sends about 600 kWh a year of surplus to the water heater. The equipment cost is an estimate.',
          fr: 'Hypothèse de démonstration : un routeur solaire envoie environ 600 kWh par an de surplus vers le chauffe-eau. Le coût du matériel est une estimation.',
          es: 'Hipótesis de demostración: un derivador solar envía unos 600 kWh al año de excedente al termo. El coste del equipo es una estimación.',
        },
      },
      {
        id: 'nora-led',
        kind: 'reduce',
        kwhPerYear: 120,
        cost: 60,
        effort: 1,
        confidence: 'high',
        label: {
          en: 'Replace the remaining bulbs with LEDs',
          fr: 'Remplacer les dernières ampoules par des LED',
          es: 'Cambiar las bombillas restantes por LED',
        },
        assumption: {
          en: 'Demo hypothesis: about 10 bulbs of 40 W replaced by 6 W LEDs, each used around 1 hour a day.',
          fr: 'Hypothèse de démonstration : environ 10 ampoules de 40 W remplacées par des LED de 6 W, chacune allumée environ 1 heure par jour.',
          es: 'Hipótesis de demostración: unas 10 bombillas de 40 W sustituidas por LED de 6 W, cada una encendida alrededor de 1 hora al día.',
        },
      },
    ],
    activity: [
      {
        date: '2026-10-08',
        text: {
          en: 'Solar export lower as days get shorter (demo event)',
          fr: 'Revente solaire en baisse avec des journées plus courtes (événement de démonstration)',
          es: 'Venta solar a la baja con días más cortos (evento de demostración)',
        },
      },
      {
        date: '2026-09-15',
        text: {
          en: 'Heat pump maintenance noted',
          fr: 'Entretien de la pompe à chaleur noté',
          es: 'Mantenimiento de la bomba de calor anotado',
        },
      },
      {
        date: '2026-06-01',
        text: {
          en: 'Home profile created',
          fr: 'Profil du logement créé',
          es: 'Perfil de la vivienda creado',
        },
      },
    ],
  },
];

export const USAGE_KEYS = ['climate', 'hotWater', 'appliances', 'cooking', 'other'];
