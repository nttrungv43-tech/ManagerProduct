// src/data/seed.js
export const seedItems = [
  { ntk: '106160',  po: '2600168+2600189', target: 1000 },
  { ntk: '106167',  po: '2600189',          target: 600 },
  { ntk: '1061119', po: '2600168+2600189', target: 710 },
  { ntk: '1063022', po: '2600189',          target: 800 },
  { ntk: '1063038', po: '2600168+2600189', target: 1300 },
  { ntk: '1063048', po: '2600168+2600189', target: 2400 },
  { ntk: '1063049', po: '2600189',          target: 580 },
  { ntk: '1063051', po: '2600168+2600189', target: 640 },
];

export const containersData = [
  { id: 'c1', label: 'Container 1', po: '2600189', pallets: [
    { no: 1, items: [{ ntk: '1063022', qty: 660 }] },
    { no: 2, items: [{ ntk: '106160', qty: 300 }, { ntk: '1063022', qty: 40 }] },
    { no: 3, items: [{ ntk: '106167', qty: 300 }, { ntk: '1063022', qty: 40 }] },
    { no: 4, items: [{ ntk: '106167', qty: 300 }, { ntk: '1063022', qty: 40 }] },
    { no: 5, items: [{ ntk: '1063049', qty: 20 }, { ntk: '1063051', qty: 300 }, { ntk: '1063022', qty: 20 }] },
    { no: 6, items: [{ ntk: '1061119', qty: 290 }] },
    { no: 7, items: [{ ntk: '1063038', qty: 338 }] },
    { no: 8, items: [{ ntk: '1063038', qty: 338 }] },
    { no: 9, items: [{ ntk: '1063038', qty: 324 }] },
    { no: 10, items: [{ ntk: '1061119', qty: 210 }, { ntk: '1063048', qty: 20 }] },
  ]},
  { id: 'c2', label: 'Container 2', po: '2600189', pallets: [
    { no: 1, items: [{ ntk: '1063049', qty: 280 }] },
    { no: 2, items: [{ ntk: '1063048', qty: 260 }] },
    { no: 3, items: [{ ntk: '1063048', qty: 260 }] },
    { no: 4, items: [{ ntk: '1063048', qty: 260 }] },
    { no: 5, items: [{ ntk: '106160', qty: 200 }] },
  ]},
  { id: 'c3', label: 'Container gộp', po: '2600168+2600189', pallets: [
    { no: 1, items: [{ ntk: '1063051', qty: 340 }] },
    { no: 2, items: [{ ntk: '1063049', qty: 280 }] },
    { no: 3, items: [{ ntk: '106160', qty: 300 }] },
    { no: 4, items: [{ ntk: '1063048', qty: 260 }, { ntk: '1061119', qty: 50 }] },
    { no: 5, items: [{ ntk: '1063048', qty: 260 }, { ntk: '1061119', qty: 40 }] },
    { no: 6, items: [{ ntk: '1063048', qty: 260 }, { ntk: '1061119', qty: 40 }] },
    { no: 7, items: [{ ntk: '1063048', qty: 260 }, { ntk: '1061119', qty: 40 }] },
    { no: 8, items: [{ ntk: '1063048', qty: 260 }, { ntk: '1061119', qty: 40 }] },
    { no: 9, items: [{ ntk: '106160', qty: 200 }] },
    { no: 10, items: [{ ntk: '1063038', qty: 300 }, { ntk: '1063048', qty: 20 }] },
    { no: 11, items: [{ ntk: '1063048', qty: 280 }] },
  ]},
];