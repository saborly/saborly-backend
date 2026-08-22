/**
 * Adds menu items from the physical Saborly menu (PDF) that are missing from the DB,
 * for BOTH branches (Barcelona + Sabadell). Existing items are left untouched.
 * Run: node scratch/seed-main-menu-additions.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Branch = require('../models/Branch');
const { FoodItem, Category } = require('../models/Category');

const PLACEHOLDER_IMAGE = 'https://placehold.co/600x400?text=Saborly';

const ITEMS = [
  {
    sku: 'NEW-PZ-01', cat: 'Pizza', price: 9.90,
    name: { en: 'Chicken Achaari Pizza', es: 'Pizza Achaari de Pollo', ca: 'Pizza Achaari de Pollastre', ar: 'بيتزا أتشاري بالدجاج', fr: 'Pizza Achaari au Poulet' },
    desc: {
      en: 'Tomato with Achaari sauce, mozzarella, chicken, red & green pepper, onion, oregano.',
      es: 'Tomate con salsa Achaari, mozzarella, pollo, pimiento rojo y verde, cebolla, orégano.',
      ca: 'Tomàquet amb salsa Achaari, mozzarella, pollastre, pebrot vermell i verd, ceba, orenga.',
      ar: 'طماطم مع صلصة أتشاري وموزاريلا ودجاج وفلفل أحمر وأخضر وبصل وأوريغانو.',
      fr: 'Tomate avec sauce Achaari, mozzarella, poulet, poivron rouge et vert, oignon, origan.',
    },
  },
  {
    sku: 'NEW-PZ-02', cat: 'Pizza', price: 17.90,
    name: { en: 'Saborly Crown Crust', es: 'Saborly Crown Crust', ca: 'Saborly Crown Crust', ar: 'كراون كرست سابورلي', fr: 'Saborly Crown Crust' },
    desc: {
      en: 'Tomato sauce, mozzarella, minced beef, onion, red & green pepper, fresh tomato, mushrooms, jalapeños, oregano.',
      es: 'Salsa de tomate, mozzarella, carne picada, cebolla, pimiento rojo y verde, tomate natural, champiñones, jalapeños, orégano.',
      ca: 'Salsa de tomàquet, mozzarella, carn picada, ceba, pebrot vermell i verd, tomàquet natural, xampinyons, jalapenys, orenga.',
      ar: 'صلصة طماطم وموزاريلا ولحم بقري مفروم وبصل وفلفل أحمر وأخضر وطماطم طازجة وفطر وهالبينو وأوريغانو.',
      fr: 'Sauce tomate, mozzarella, bœuf haché, oignon, poivron rouge et vert, tomate fraîche, champignons, jalapeños, origan.',
    },
  },
  {
    sku: 'NEW-PZ-03', cat: 'Pizza', price: 16.90,
    name: { en: 'Cheese Stuffed Crust', es: 'Cheese Stuffed Crust', ca: 'Cheese Stuffed Crust', ar: 'تشيز ستفد كرست', fr: 'Cheese Stuffed Crust' },
    desc: {
      en: 'Tomato sauce, mozzarella, cheese-stuffed crust, chicken, onion, jalapeños, red & green pepper, oregano.',
      es: 'Salsa de tomate, mozzarella, borde relleno de queso, pollo, cebolla, jalapeños, pimiento rojo y verde, orégano.',
      ca: 'Salsa de tomàquet, mozzarella, vora farcida de formatge, pollastre, ceba, jalapenys, pebrot vermell i verd, orenga.',
      ar: 'صلصة طماطم وموزاريلا وحواف محشوة بالجبن ودجاج وبصل وهالبينو وفلفل أحمر وأخضر وأوريغانو.',
      fr: 'Sauce tomate, mozzarella, bord farci au fromage, poulet, oignon, jalapeños, poivron rouge et vert, origan.',
    },
  },
  {
    sku: 'NEW-PZ-04', cat: 'Pizza', price: 10.90,
    name: { en: 'Mexican Pizza', es: 'Mexican Pizza', ca: 'Pizza Mexicana', ar: 'بيتزا مكسيكية', fr: 'Pizza Mexicaine' },
    desc: {
      en: 'Tomato sauce, mozzarella, minced beef, onion, red & green pepper, fresh tomato, mushrooms, jalapeños, oregano.',
      es: 'Salsa de tomate, mozzarella, carne picada, cebolla, pimiento rojo y verde, tomate natural, champiñones, jalapeños, orégano.',
      ca: 'Salsa de tomàquet, mozzarella, carn picada, ceba, pebrot vermell i verd, tomàquet natural, xampinyons, jalapenys, orenga.',
      ar: 'صلصة طماطم وموزاريلا ولحم بقري مفروم وبصل وفلفل أحمر وأخضر وطماطم طازجة وفطر وهالبينو وأوريغانو.',
      fr: 'Sauce tomate, mozzarella, bœuf haché, oignon, poivron rouge et vert, tomate fraîche, champignons, jalapeños, origan.',
    },
  },
  {
    sku: 'NEW-HB-01', cat: 'Hamburger', price: 12.50,
    name: { en: 'Saborly Double', es: 'Saborly Doble', ca: 'Saborly Doble', ar: 'سابورلي دبل', fr: 'Saborly Double' },
    desc: {
      en: '2 beef patties, special sauce, lettuce, onion, tomato, cheese, prepared mushrooms.',
      es: '2 hamburguesas de ternera, salsa especial, lechuga, cebolla, tomate, queso, champiñones preparados.',
      ca: '2 hamburgueses de vedella, salsa especial, enciam, ceba, tomàquet, formatge, xampinyons preparats.',
      ar: 'قرصان من لحم البقر وصلصة خاصة وخس وبصل وطماطم وجبن وفطر معد خصيصًا.',
      fr: '2 steaks de bœuf, sauce spéciale, laitue, oignon, tomate, fromage, champignons préparés.',
    },
  },
  {
    sku: 'NEW-HB-02', cat: 'Hamburger', price: 8.50,
    name: { en: 'Smash Burger with Egg', es: 'Smash Burger con Huevo', ca: 'Smash Burger amb Ou', ar: 'سماش برجر بالبيض', fr: "Smash Burger à l'Œuf" },
    desc: {
      en: 'Beef patty, brioche bun, onion and cheese, fried egg.',
      es: 'Hamburguesa de ternera, pan brioche, cebolla y queso, huevo frito.',
      ca: 'Hamburguesa de vedella, pa brioche, ceba i formatge, ou fregit.',
      ar: 'قرص لحم بقري وخبز بريوش وبصل وجبن وبيضة مقلية.',
      fr: 'Steak de bœuf, pain brioché, oignon et fromage, œuf au plat.',
    },
  },
  {
    sku: 'NEW-HB-03', cat: 'Hamburger', price: 10.50,
    name: { en: 'Double Smash Burger', es: 'Smash Burger Doble', ca: 'Smash Burger Doble', ar: 'دبل سماش برجر', fr: 'Double Smash Burger' },
    desc: {
      en: 'Double beef patty, brioche bun, onion and cheese.',
      es: 'Doble hamburguesa de ternera, pan brioche, cebolla y queso.',
      ca: 'Doble hamburguesa de vedella, pa brioche, ceba i formatge.',
      ar: 'قرصان مزدوجان من لحم البقر وخبز بريوش وبصل وجبن.',
      fr: 'Double steak de bœuf, pain brioché, oignon et fromage.',
    },
  },
  {
    sku: 'NEW-AP-01', cat: 'Appetizers', price: 2.90,
    name: { en: 'Potato Waffles', es: 'Waffles de Patata', ca: 'Waffles de Patata', ar: 'وافل البطاطس', fr: 'Gaufres de Pomme de Terre' },
    desc: {
      en: 'Crispy golden potato waffles.',
      es: 'Waffles de patata crujientes y dorados.',
      ca: 'Waffles de patata cruixents i daurats.',
      ar: 'وافل بطاطس مقرمش وذهبي.',
      fr: 'Gaufres de pomme de terre croustillantes et dorées.',
    },
  },
  {
    sku: 'NEW-AP-02', cat: 'Appetizers', price: 5.50,
    name: { en: '5 Mozzarella Fingers', es: '5 Finger de Mozzarella', ca: '5 Finger de Mozzarella', ar: '5 أصابع موزاريلا', fr: '5 Bâtonnets de Mozzarella' },
    desc: {
      en: 'Five crispy breaded mozzarella fingers.',
      es: 'Cinco fingers de mozzarella empanados y crujientes.',
      ca: 'Cinc fingers de mozzarella arrebossats i cruixents.',
      ar: 'خمسة أصابع موزاريلا مقرمشة ومغطاة بالبقسماط.',
      fr: 'Cinq bâtonnets de mozzarella panés et croustillants.',
    },
  },
  {
    sku: 'NEW-AP-03', cat: 'Appetizers', price: 5.50,
    name: { en: '4 Gouda Cheese Tequeños', es: '4 Tequeños de Queso Gouda', ca: '4 Tequeños de Formatge Gouda', ar: '4 تيكينوس بجبنة الغودا', fr: '4 Tequeños au Fromage Gouda' },
    desc: {
      en: 'Four crispy pastry rolls filled with gouda cheese.',
      es: 'Cuatro rollitos crujientes rellenos de queso gouda.',
      ca: 'Quatre rotllets cruixents farcits de formatge gouda.',
      ar: 'أربعة لفائف مقرمشة محشوة بجبنة الغودا.',
      fr: 'Quatre rouleaux croustillants farcis au fromage gouda.',
    },
  },
  {
    sku: 'NEW-AP-04', cat: 'Appetizers', price: 5.90,
    name: { en: '2 Chicken Bao Buns', es: '2 Chicken Bao', ca: '2 Chicken Bao', ar: '2 باو بالدجاج', fr: '2 Bao au Poulet' },
    desc: {
      en: 'Two steamed bao buns filled with chicken.',
      es: 'Dos panecillos bao al vapor rellenos de pollo.',
      ca: 'Dos panets bao al vapor farcits de pollastre.',
      ar: 'كعكتا باو مطهوتان بالبخار محشوتان بالدجاج.',
      fr: 'Deux petits pains bao vapeur farcis au poulet.',
    },
  },
  {
    sku: 'NEW-AP-05', cat: 'Appetizers', price: 7.00,
    name: { en: 'Fish and Chips', es: 'Fish and Chips', ca: 'Fish and Chips', ar: 'سمك وبطاطس', fr: 'Fish and Chips' },
    desc: {
      en: 'Battered fish fillet served with fries.',
      es: 'Filete de pescado rebozado servido con patatas fritas.',
      ca: 'Filet de peix arrebossat servit amb patates fregides.',
      ar: 'فيليه سمك مغطى بالخليط يقدم مع البطاطس المقلية.',
      fr: 'Filet de poisson pané servi avec des frites.',
    },
  },
  {
    sku: 'NEW-DR-01', cat: 'Soft drinks', price: 2.50,
    name: { en: 'Pums', es: 'Pums', ca: 'Pums', ar: 'بمز', fr: 'Pums' },
    desc: {
      en: 'Soft drink.',
      es: 'Refresco.',
      ca: 'Refresc.',
      ar: 'مشروب غازي.',
      fr: 'Boisson gazeuse.',
    },
  },
  {
    sku: 'NEW-DS-01', cat: 'Desserts', price: 4.90,
    name: { en: 'Bounty Cake', es: 'Bounty Cake', ca: 'Bounty Cake', ar: 'كيك باونتي', fr: 'Bounty Cake' },
    desc: {
      en: 'Coconut and chocolate cake.',
      es: 'Tarta de coco y chocolate.',
      ca: 'Pastís de coco i xocolata.',
      ar: 'كيك بجوز الهند والشوكولاتة.',
      fr: 'Gâteau coco et chocolat.',
    },
  },
  {
    sku: 'NEW-DS-02', cat: 'Desserts', price: 3.90,
    name: { en: 'Lotus Cake', es: 'Tarta Louts', ca: 'Pastís Louts', ar: 'كيك لوتس', fr: 'Gâteau Lotus' },
    desc: {
      en: 'Cake made with Lotus Biscoff biscuits.',
      es: 'Tarta elaborada con galletas Lotus Biscoff.',
      ca: 'Pastís elaborat amb galetes Lotus Biscoff.',
      ar: 'كيك مصنوع من بسكويت لوتس بيسكوف.',
      fr: 'Gâteau aux biscuits Lotus Biscoff.',
    },
  },
  {
    sku: 'NEW-SA-01', cat: 'Salads', price: 5.50,
    name: { en: 'Green Salad', es: 'Ensalada Verde', ca: 'Amanida Verda', ar: 'سلطة خضراء', fr: 'Salade Verte' },
    desc: {
      en: 'Lettuce, pickle, onion, olives, tomato and pineapple.',
      es: 'Lechuga, pepinillo, cebolla, aceitunas, tomate y piña.',
      ca: 'Enciam, cogombret, ceba, olives, tomàquet i pinya.',
      ar: 'خس ومخلل وبصل وزيتون وطماطم وأناناس.',
      fr: 'Laitue, cornichon, oignon, olives, tomate et ananas.',
    },
  },
  {
    sku: 'NEW-CB-01', cat: 'Combo', price: 6.90,
    name: { en: 'Beef Taco', es: 'Taco de Ternera', ca: 'Taco de Vedella', ar: 'تاكو لحم بقري', fr: 'Taco au Bœuf' },
    desc: {
      en: 'Minced beef, cheese sauce, potato, Aljeria sauce.',
      es: 'Carne picada, salsa de queso, patata, salsa Aljeria.',
      ca: 'Carn picada, salsa de formatge, patata, salsa Aljeria.',
      ar: 'لحم بقري مفروم وصلصة الجبن والبطاطس وصلصة الجيريا.',
      fr: 'Bœuf haché, sauce fromage, pomme de terre, sauce Aljeria.',
    },
  },
];

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set');
    process.exit(1);
  }
  await mongoose.connect(uri);

  const branches = await Branch.find({});
  let created = 0;
  let skipped = 0;

  for (const branch of branches) {
    console.log('Branch:', branch.name);
    const categoryCache = {};

    for (const item of ITEMS) {
      if (!(item.cat in categoryCache)) {
        categoryCache[item.cat] = await Category.findOne({ branchId: branch._id, 'name.en': item.cat });
      }
      const category = categoryCache[item.cat];
      if (!category) {
        console.warn('  Category not found, skipping item:', item.cat, item.name.en);
        skipped += 1;
        continue;
      }

      const existing = await FoodItem.findOne({
        branchId: branch._id,
        $or: [{ sku: item.sku }, { 'name.en': item.name.en }],
      });

      if (existing) {
        console.log('  Already exists, keeping as-is:', item.name.en);
        skipped += 1;
        continue;
      }

      await FoodItem.create({
        branchId: branch._id,
        category: category._id,
        name: item.name,
        description: item.desc,
        price: item.price,
        imageUrl: PLACEHOLDER_IMAGE,
        sku: item.sku,
        barcode: `SBR-${item.sku}`,
        isActive: true,
        isAvailable: true,
        stockQuantity: 1000,
      });
      console.log('  Created:', item.name.en, '(' + item.price + '€)');
      created += 1;
    }
  }

  console.log(`Done. Created ${created}, skipped (already present) ${skipped}.`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
