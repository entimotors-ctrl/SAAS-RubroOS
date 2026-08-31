const BUSINESS_TYPES = [
  { id: 'taller', label: 'Taller de Motos y Vehículos' },
  { id: 'barberia', label: 'Barbería' },
  { id: 'agro', label: 'Agropecuario' },
  { id: 'inversiones', label: 'Catálogo de Inversiones' },
  { id: 'ganaderia', label: 'Ganadería y Lechería' },
  { id: 'carwash', label: 'Carwash' },
];

const BUSINESS_TYPE_IDS = BUSINESS_TYPES.map((b) => b.id);

module.exports = { BUSINESS_TYPES, BUSINESS_TYPE_IDS };
