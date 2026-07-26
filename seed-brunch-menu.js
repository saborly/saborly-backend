/**
 * Seeds the Saborly brunch menu (categories + food items) for the Barcelona branch only,
 * fully translated into en/es/ca/ar/fr, valid until end of 2027.
 * Run: node seed-brunch-menu.js  (from saborly-backend, with MONGODB_URI in .env)
 */
require('dotenv').config();
const mongoose = require('mongoose');

const Branch = require('./models/Branch');
const { FoodItem, Category } = require('./models/Category');

const AVAILABLE_UNTIL = new Date('2027-12-31T23:59:59.000Z');
const PLACEHOLDER_IMAGE = 'https://placehold.co/600x400?text=Saborly';

const CATEGORIES = [
  {
    key: 'brunchDulce',
    icon: '🥞',
    name: { en: 'Sweet Brunch', es: 'Brunch Dulce', ca: 'Brunch Dolç', ar: 'برانش حلو', fr: 'Brunch Sucré' },
  },
  {
    key: 'tostadasSalado',
    icon: '🍞',
    name: { en: 'Toasts & Savory', es: 'Tostadas y Salado', ca: 'Torrades i Salat', ar: 'توست ومالح', fr: 'Toasts & Salé' },
  },
  {
    key: 'specialesBrunch',
    icon: '🍳',
    name: { en: 'Brunch Specials', es: 'Speciales Brunch', ca: 'Especials Brunch', ar: 'أطباق برانش خاصة', fr: 'Spéciaux Brunch' },
  },
  {
    key: 'cafes',
    icon: '☕',
    name: { en: 'Coffees', es: 'Cafés', ca: 'Cafès', ar: 'قهوة', fr: 'Cafés' },
  },
  {
    key: 'batidos',
    icon: '🥤',
    name: { en: 'Milkshakes', es: 'Batidos', ca: 'Batuts', ar: 'ميلك شيك', fr: 'Milkshakes' },
  },
  {
    key: 'postres',
    icon: '🍰',
    name: { en: 'Desserts', es: 'Postres', ca: 'Postres', ar: 'حلويات', fr: 'Desserts' },
  },
];

const ITEMS = [
  // Brunch Dulce
  {
    cat: 'brunchDulce', price: 8.90, sku: 'BD-01',
    name: { en: 'Classic Pancake', es: 'Pancake Clásico', ca: 'Pancake Clàssic', ar: 'بان كيك كلاسيك', fr: 'Pancake Classique' },
    desc: {
      en: 'Pancake with red berries, banana and fresh cream.',
      es: 'Pancake con frutos rojos, banana y crema fresca.',
      ca: 'Pancake amb fruits vermells, banana i crema fresca.',
      ar: 'بان كيك مع التوت الأحمر والموز والكريمة الطازجة.',
      fr: 'Pancake aux fruits rouges, banane et crème fraîche.',
    },
  },
  {
    cat: 'brunchDulce', price: 9.90, sku: 'BD-02',
    name: { en: 'Chocolate Pancake', es: 'Pancake de Chocolate', ca: 'Pancake de Xocolata', ar: 'بان كيك بالشوكولاتة', fr: 'Pancake au Chocolat' },
    desc: {
      en: 'Pancake with Nutella and banana.',
      es: 'Pancake con Nutella y banana.',
      ca: 'Pancake amb Nutella i banana.',
      ar: 'بان كيك مع نوتيلا وموز.',
      fr: 'Pancake au Nutella et banane.',
    },
  },
  {
    cat: 'brunchDulce', price: 9.20, sku: 'BD-03',
    name: { en: 'Sweet Pancake', es: 'Pancake Sweet', ca: 'Pancake Sweet', ar: 'بان كيك سويت', fr: 'Pancake Sweet' },
    desc: {
      en: 'Pancake with dulce de leche, fresh cream and banana.',
      es: 'Pancake con dulce de leche, crema fresca y banana.',
      ca: 'Pancake amb dulce de leche, crema fresca i banana.',
      ar: 'بان كيك مع دولسي دي ليتشي والكريمة الطازجة والموز.',
      fr: 'Pancake au dulce de leche, crème fraîche et banane.',
    },
  },
  {
    cat: 'brunchDulce', price: 9.90, sku: 'BD-04',
    name: { en: 'Classic French Toast', es: 'French Toast Clásico', ca: 'French Toast Clàssic', ar: 'فرنش توست كلاسيك', fr: 'Pain Perdu Classique' },
    desc: {
      en: 'With red berries, banana, fresh cream and caramelized sugar.',
      es: 'Con frutos rojos, banana, crema fresca y azúcar caramelizado.',
      ca: 'Amb fruits vermells, banana, crema fresca i sucre caramel·litzat.',
      ar: 'مع التوت الأحمر والموز والكريمة الطازجة والسكر المكرمل.',
      fr: 'Avec fruits rouges, banane, crème fraîche et sucre caramélisé.',
    },
  },
  {
    cat: 'brunchDulce', price: 10.90, sku: 'BD-05',
    name: { en: 'Nutella French Toast', es: 'French Toast Nutella', ca: 'French Toast Nutella', ar: 'فرنش توست نوتيلا', fr: 'Pain Perdu Nutella' },
    desc: {
      en: 'Butter, Nutella, banana and caramelized sugar.',
      es: 'Mantequilla, Nutella, banana y azúcar caramelizado.',
      ca: 'Mantega, Nutella, banana i sucre caramel·litzat.',
      ar: 'زبدة ونوتيلا وموز وسكر مكرمل.',
      fr: 'Beurre, Nutella, banane et sucre caramélisé.',
    },
  },
  {
    cat: 'brunchDulce', price: 8.90, sku: 'BD-06',
    name: { en: 'Biscoff Waffles', es: 'Gofres Biscoff', ca: 'Gofres Biscoff', ar: 'وافل بسكوف', fr: 'Gaufres Biscoff' },
    desc: {
      en: 'Waffles with Biscoff cookies, fresh cream, syrup, banana and vanilla ice cream.',
      es: 'Gofres con galletas Biscoff, crema fresca, sirope, banana y helado de vainilla.',
      ca: 'Gofres amb galetes Biscoff, crema fresca, xarop, banana i gelat de vanilla.',
      ar: 'وافل مع بسكويت بسكوف والكريمة الطازجة والشراب والموز وآيس كريم الفانيليا.',
      fr: 'Gaufres aux biscuits Biscoff, crème fraîche, sirop, banane et glace vanille.',
    },
  },
  {
    cat: 'brunchDulce', price: 9.90, sku: 'BD-07',
    name: { en: 'Chocolate Toast', es: 'Toast de Chocolate', ca: 'Toast de Xocolata', ar: 'توست بالشوكولاتة', fr: 'Toast au Chocolat' },
    desc: {
      en: 'Toasted bread with banana, chocolate and fresh cream.',
      es: 'Pan tostado con banana, chocolate y crema fresca.',
      ca: 'Pa torrat amb banana, xocolata i crema fresca.',
      ar: 'خبز محمص مع الموز والشوكولاتة والكريمة الطازجة.',
      fr: 'Pain grillé avec banane, chocolat et crème fraîche.',
    },
  },
  {
    cat: 'brunchDulce', price: 8.90, sku: 'BD-08',
    name: { en: 'Biscoff Pancake', es: 'Pancake Biscoff', ca: 'Pancake Biscoff', ar: 'بان كيك بسكوف', fr: 'Pancake Biscoff' },
    desc: {
      en: 'Biscoff sauce, banana, fresh cream and vanilla ice cream.',
      es: 'Salsa Biscoff, banana, crema fresca y helado de vainilla.',
      ca: 'Salsa Biscoff, banana, crema fresca i gelat de vanilla.',
      ar: 'صلصة بسكوف وموز وكريمة طازجة وآيس كريم الفانيليا.',
      fr: 'Sauce Biscoff, banane, crème fraîche et glace vanille.',
    },
  },
  {
    cat: 'brunchDulce', price: 10.90, sku: 'BD-09',
    name: { en: 'Biscoff French Toast', es: 'French Toast Biscoff', ca: 'French Toast Biscoff', ar: 'فرنش توست بسكوف', fr: 'Pain Perdu Biscoff' },
    desc: {
      en: 'Biscoff sauce, banana and vanilla ice cream.',
      es: 'Salsa Biscoff, banana y helado de vainilla.',
      ca: 'Salsa Biscoff, banana i gelat de vanilla.',
      ar: 'صلصة بسكوف وموز وآيس كريم الفانيليا.',
      fr: 'Sauce Biscoff, banane et glace vanille.',
    },
  },
  // Tostadas y Salado
  {
    cat: 'tostadasSalado', price: 9.90, sku: 'TS-10',
    name: { en: 'Cheesy Egg Muffin', es: 'Cheesy Egg Muffin', ca: 'Cheesy Egg Muffin', ar: 'تشيزي إيغ مافن', fr: 'Cheesy Egg Muffin' },
    desc: {
      en: '2 eggs, mozzarella cheese, parmesan, English muffin and crushed cilantro.',
      es: '2 huevos, queso mozzarella, parmesano, English muffin y cilantro triturado.',
      ca: '2 ous, formatge mozzarella, parmesà, English muffin i coriandre triturat.',
      ar: 'بيضتان وجبنة موزاريلا وبارميزان ومافن إنجليزي وكزبرة مفرومة.',
      fr: '2 œufs, mozzarella, parmesan, English muffin et coriandre concassée.',
    },
  },
  {
    cat: 'tostadasSalado', price: 8.90, sku: 'TS-11',
    name: { en: 'Avocado Toast', es: 'Tostada de Aguacate', ca: 'Torrada d\'Alvocat', ar: 'توست أفوكادو', fr: 'Toast à l\'Avocat' },
    desc: {
      en: 'Pagès bread with avocado, tomato and fresh herbs.',
      es: 'Pan de pages con aguacate, tomate y hierbas frescas.',
      ca: 'Pa de pagès amb alvocat, tomàquet i herbes fresques.',
      ar: 'خبز بايج مع الأفوكادو والطماطم والأعشاب الطازجة.',
      fr: 'Pain de campagne à l\'avocat, tomate et herbes fraîches.',
    },
  },
  {
    cat: 'tostadasSalado', price: 10.90, sku: 'TS-12',
    name: { en: 'Chicken Toast', es: 'Tostada de Pollo', ca: 'Torrada de Pollastre', ar: 'توست الدجاج', fr: 'Toast au Poulet' },
    desc: {
      en: 'Pagès bread with chicken, yogurt sauce, mayonnaise and fresh herbs.',
      es: 'Pan de pages con pollo, salsa de yogur, mayonesa y hierbas frescas.',
      ca: 'Pa de pagès amb pollastre, salsa de iogurt, maionesa i herbes fresques.',
      ar: 'خبز بايج مع الدجاج وصلصة الزبادي والمايونيز والأعشاب الطازجة.',
      fr: 'Pain de campagne au poulet, sauce yaourt, mayonnaise et herbes fraîches.',
    },
  },
  {
    cat: 'tostadasSalado', price: 9.90, sku: 'TS-13',
    name: { en: 'Tuna Toast', es: 'Tostada de Atún', ca: 'Torrada de Tonyina', ar: 'توست التونة', fr: 'Toast au Thon' },
    desc: {
      en: 'Pagès bread with tuna, yogurt sauce, mayonnaise and fresh herbs.',
      es: 'Pan de pages con atún, salsa de yogur, mayonesa y hierbas frescas.',
      ca: 'Pa de pagès amb tonyina, salsa de iogurt, maionesa i herbes fresques.',
      ar: 'خبز بايج مع التونة وصلصة الزبادي والمايونيز والأعشاب الطازجة.',
      fr: 'Pain de campagne au thon, sauce yaourt, mayonnaise et herbes fraîches.',
    },
  },
  {
    cat: 'tostadasSalado', price: 9.90, sku: 'TS-14',
    name: { en: 'Avocado Toast with Egg', es: 'Tostada de Aguacate con Huevo', ca: 'Torrada d\'Alvocat amb Ou', ar: 'توست أفوكادو بالبيض', fr: 'Toast à l\'Avocat et Œuf' },
    desc: {
      en: 'Pagès bread, cherry tomato, avocado, fresh strawberry mint.',
      es: 'Pan de pages, tomate cherry aguacate, yerba fresa.',
      ca: 'Pa de pagès, tomàquet cherry, alvocat, herba maduixa fresca.',
      ar: 'خبز بايج وطماطم كرزية وأفوكادو وأعشاب فراولة طازجة.',
      fr: 'Pain de campagne, tomate cerise, avocat, herbe fraise fraîche.',
    },
  },
  {
    cat: 'tostadasSalado', price: 8.90, sku: 'TS-15',
    name: { en: 'Bread Omelette', es: 'Bread Omelette', ca: 'Bread Omelette', ar: 'بريد أومليت', fr: 'Bread Omelette' },
    desc: {
      en: 'Sliced bread with French omelette, tomato, cucumber, spinach and mozzarella.',
      es: 'Pan de molde con tortilla francesa, tomate, pepino, espinaca y mozzarella.',
      ca: 'Pa de motlle amb truita francesa, tomàquet, cogombre, espinacs i mozzarella.',
      ar: 'خبز توست مع أومليت فرنسي وطماطم وخيار وسبانخ وموزاريلا.',
      fr: 'Pain de mie avec omelette française, tomate, concombre, épinards et mozzarella.',
    },
  },
  // Speciales Brunch
  {
    cat: 'specialesBrunch', price: 12.90, sku: 'SB-16', isFeatured: true,
    name: { en: 'Pancake with Smoked Salmon', es: 'Pancake con Salmón Ahumado', ca: 'Pancake amb Salmó Fumat', ar: 'بان كيك مع السلمون المدخن', fr: 'Pancake au Saumon Fumé' },
    desc: {
      en: '2 fried or scrambled eggs, cream cheese, smoked salmon and fresh herbs.',
      es: '2 huevos fritos o revueltos, queso crema, salmón ahumado y hierbas frescas.',
      ca: '2 ous fregits o remenats, formatge crema, salmó fumat i herbes fresques.',
      ar: 'بيضتان مقليتان أو مخفوقتان وجبنة كريمية وسلمون مدخن وأعشاب طازجة.',
      fr: '2 œufs au plat ou brouillés, fromage frais, saumon fumé et herbes fraîches.',
    },
  },
  {
    cat: 'specialesBrunch', price: 10.90, sku: 'SB-17',
    name: { en: 'Avocado Pancake', es: 'Pancake de Aguacate', ca: 'Pancake d\'Alvocat', ar: 'بان كيك أفوكادو', fr: 'Pancake à l\'Avocat' },
    desc: {
      en: '2 fried or scrambled eggs, cream cheese and fresh herbs.',
      es: '2 huevos fritos o revueltos, queso crema y hierbas frescas.',
      ca: '2 ous fregits o remenats, formatge crema i herbes fresques.',
      ar: 'بيضتان مقليتان أو مخفوقتان وجبنة كريمية وأعشاب طازجة.',
      fr: '2 œufs au plat ou brouillés, fromage frais et herbes fraîches.',
    },
  },
  {
    cat: 'specialesBrunch', price: 11.90, sku: 'SB-18',
    name: { en: 'Eggs with Avocado', es: 'Huevos con Aguacate', ca: 'Ous amb Alvocat', ar: 'بيض مع الأفوكادو', fr: 'Œufs à l\'Avocat' },
    desc: {
      en: '2 boiled eggs, English muffin, spinach, avocado, rustic potato, onion and cooked tomato.',
      es: '2 huevos duros, English muffin, espinaca, aguacate, patata rústica, cebolla y tomate cocido.',
      ca: '2 ous durs, English muffin, espinacs, alvocat, patata rústica, ceba i tomàquet cuit.',
      ar: 'بيضتان مسلوقتان ومافن إنجليزي وسبانخ وأفوكادو وبطاطس ريفية وبصل وطماطم مطبوخة.',
      fr: '2 œufs durs, English muffin, épinards, avocat, pomme de terre rustique, oignon et tomate cuite.',
    },
  },
  {
    cat: 'specialesBrunch', price: 12.90, sku: 'SB-19', isFeatured: true,
    name: { en: 'Eggs with Smoked Salmon', es: 'Huevos con Salmón Ahumado', ca: 'Ous amb Salmó Fumat', ar: 'بيض مع السلمون المدخن', fr: 'Œufs au Saumon Fumé' },
    desc: {
      en: 'Boiled eggs, English muffin, spinach, rustic potato, salad and smoked salmon.',
      es: 'Huevos duros, English muffin, espinaca, patata rústica, ensalada y salmón ahumado.',
      ca: 'Ous durs, English muffin, espinacs, patata rústica, amanida i salmó fumat.',
      ar: 'بيض مسلوق ومافن إنجليزي وسبانخ وبطاطس ريفية وسلطة وسلمون مدخن.',
      fr: 'Œufs durs, English muffin, épinards, pomme de terre rustique, salade et saumon fumé.',
    },
  },
  {
    cat: 'specialesBrunch', price: 10.50, sku: 'SB-20',
    name: { en: 'Special French Omelette', es: 'Tortilla Francesa Especial', ca: 'Truita Francesa Especial', ar: 'أومليت فرنسي خاص', fr: 'Omelette Française Spéciale' },
    desc: {
      en: 'Cheese, basil, crème fraîche, tomato, salad and bread.',
      es: 'Queso, albahaca, crema fraîche, tomate, ensalada y pan.',
      ca: 'Formatge, alfàbrega, crema fraîche, tomàquet, amanida i pa.',
      ar: 'جبنة وريحان وكريم فريش وطماطم وسلطة وخبز.',
      fr: 'Fromage, basilic, crème fraîche, tomate, salade et pain.',
    },
  },
  {
    cat: 'specialesBrunch', price: 6.90, sku: 'SB-21',
    name: { en: 'Eggs (Fried or Scrambled)', es: 'Huevos (Fritos o Revueltos)', ca: 'Ous (Fregits o Remenats)', ar: 'بيض (مقلي أو مخفوق)', fr: 'Œufs (au Plat ou Brouillés)' },
    desc: {
      en: 'Two eggs served with bread.',
      es: 'Dos huevos acompañados con pan.',
      ca: 'Dos ous acompanyats amb pa.',
      ar: 'بيضتان مع الخبز.',
      fr: 'Deux œufs accompagnés de pain.',
    },
  },
  {
    cat: 'specialesBrunch', price: 10.90, sku: 'SB-22',
    name: { en: 'Avocado Bagel', es: 'Begal Aguacate', ca: 'Bagel Alvocat', ar: 'بيغل أفوكادو', fr: 'Bagel Avocat' },
    desc: {
      en: 'Cream cheese, tomato, spinach, onion, orange and scrambled eggs.',
      es: 'Queso crema, tomate, espinaca, cebolla, china, huevos revueltos.',
      ca: 'Formatge crema, tomàquet, espinacs, ceba, taronja i ous remenats.',
      ar: 'جبنة كريمية وطماطم وسبانخ وبصل وبرتقال وبيض مخفوق.',
      fr: 'Fromage frais, tomate, épinards, oignon, orange et œufs brouillés.',
    },
  },
  {
    cat: 'specialesBrunch', price: 13.90, sku: 'SB-23', isFeatured: true,
    name: { en: 'Salmon Bagel', es: 'Begal Salmón', ca: 'Bagel Salmó', ar: 'بيغل سلمون', fr: 'Bagel Saumon' },
    desc: {
      en: 'Cream cheese, spinach, garlic toast, tomato, cooked tomato and smoked salmon.',
      es: 'Queso crema, espinaca, tostada con ajo, tomate cocido y salmón ahumado.',
      ca: 'Formatge crema, espinacs, torrada amb all, tomàquet cuit i salmó fumat.',
      ar: 'جبنة كريمية وسبانخ وتوست بالثوم وطماطم مطبوخة وسلمون مدخن.',
      fr: 'Fromage frais, épinards, toast à l\'ail, tomate cuite et saumon fumé.',
    },
  },
  // Cafés
  { cat: 'cafes', price: 1.80, sku: 'CF-01', name: { en: 'With Milk', es: 'Con Leche', ca: 'Amb Llet', ar: 'بالحليب', fr: 'Avec Lait' }, desc: { en: 'Coffee with milk.', es: 'Café con leche.', ca: 'Cafè amb llet.', ar: 'قهوة بالحليب.', fr: 'Café au lait.' } },
  { cat: 'cafes', price: 1.60, sku: 'CF-02', name: { en: 'Cortado', es: 'Cortado', ca: 'Tallat', ar: 'كورتادو', fr: 'Cortado' }, desc: { en: 'Espresso cut with a small amount of warm milk.', es: 'Café cortado con un poco de leche.', ca: 'Cafè tallat amb un poc de llet.', ar: 'إسبريسو مع قليل من الحليب الدافئ.', fr: 'Espresso coupé avec un peu de lait chaud.' } },
  { cat: 'cafes', price: 1.40, sku: 'CF-03', name: { en: 'Black Coffee', es: 'Solo', ca: 'Sol', ar: 'قهوة سادة', fr: 'Café Seul' }, desc: { en: 'Plain black coffee.', es: 'Café solo.', ca: 'Cafè sol.', ar: 'قهوة سادة بدون حليب.', fr: 'Café noir simple.' } },
  { cat: 'cafes', price: 1.40, sku: 'CF-04', name: { en: 'Espresso', es: 'Espresso', ca: 'Espresso', ar: 'إسبريسو', fr: 'Espresso' }, desc: { en: 'Classic Italian espresso.', es: 'Espresso clásico italiano.', ca: 'Espresso clàssic italià.', ar: 'إسبريسو إيطالي كلاسيكي.', fr: 'Espresso italien classique.' } },
  { cat: 'cafes', price: 1.80, sku: 'CF-05', name: { en: 'Americano', es: 'Americano', ca: 'Americà', ar: 'أمريكانو', fr: 'Americano' }, desc: { en: 'Espresso diluted with hot water.', es: 'Espresso diluido con agua caliente.', ca: 'Espresso diluït amb aigua calenta.', ar: 'إسبريسو مخفف بالماء الساخن.', fr: 'Espresso allongé à l\'eau chaude.' } },
  { cat: 'cafes', price: 1.80, sku: 'CF-06', name: { en: 'Decaffeinated', es: 'Descafeinado', ca: 'Descafeïnat', ar: 'قهوة بدون كافيين', fr: 'Décaféiné' }, desc: { en: 'Decaffeinated coffee.', es: 'Café descafeinado.', ca: 'Cafè descafeïnat.', ar: 'قهوة بدون كافيين.', fr: 'Café décaféiné.' } },
  { cat: 'cafes', price: 1.80, sku: 'CF-07', name: { en: 'Herbal Tea', es: 'Tés de Hierbas', ca: 'Tes d\'Herbes', ar: 'شاي أعشاب', fr: 'Thés aux Herbes' }, desc: { en: 'Selection of herbal teas.', es: 'Selección de tés de hierbas.', ca: 'Selecció de tes d\'herbes.', ar: 'تشكيلة من شاي الأعشاب.', fr: 'Sélection de thés aux herbes.' } },
  { cat: 'cafes', price: 3.50, sku: 'CF-08', name: { en: 'Fresh Orange Juice', es: 'Zumo Fresco de Naranja', ca: 'Suc Fresc de Taronja', ar: 'عصير برتقال طازج', fr: 'Jus d\'Orange Frais' }, desc: { en: 'Freshly squeezed orange juice.', es: 'Zumo de naranja recién exprimido.', ca: 'Suc de taronja acabat d\'esprémer.', ar: 'عصير برتقال طازج معصور.', fr: 'Jus d\'orange fraîchement pressé.' } },
  // Batidos (medium / large)
  { cat: 'batidos', price: 5.50, sku: 'BT-01', name: { en: 'Oreo Milkshake', es: 'Batido Oreo', ca: 'Batut Oreo', ar: 'ميلك شيك أوريو', fr: 'Milkshake Oreo' }, desc: { en: 'Medium size Oreo milkshake.', es: 'Batido Oreo tamaño mediano.', ca: 'Batut Oreo de mida mitjana.', ar: 'ميلك شيك أوريو حجم متوسط.', fr: 'Milkshake Oreo taille moyenne.' } },
  { cat: 'batidos', price: 6.90, sku: 'BT-01L', name: { en: 'Oreo Milkshake (Large)', es: 'Batido Oreo (Grande)', ca: 'Batut Oreo (Gran)', ar: 'ميلك شيك أوريو (كبير)', fr: 'Milkshake Oreo (Grand)' }, desc: { en: 'Large size Oreo milkshake.', es: 'Batido Oreo tamaño grande.', ca: 'Batut Oreo de mida gran.', ar: 'ميلك شيك أوريو حجم كبير.', fr: 'Milkshake Oreo grande taille.' } },
  { cat: 'batidos', price: 5.50, sku: 'BT-02', name: { en: 'KitKat Milkshake', es: 'Batido KitKat', ca: 'Batut KitKat', ar: 'ميلك شيك كيت كات', fr: 'Milkshake KitKat' }, desc: { en: 'Medium size KitKat milkshake.', es: 'Batido KitKat tamaño mediano.', ca: 'Batut KitKat de mida mitjana.', ar: 'ميلك شيك كيت كات حجم متوسط.', fr: 'Milkshake KitKat taille moyenne.' } },
  { cat: 'batidos', price: 6.90, sku: 'BT-02L', name: { en: 'KitKat Milkshake (Large)', es: 'Batido KitKat (Grande)', ca: 'Batut KitKat (Gran)', ar: 'ميلك شيك كيت كات (كبير)', fr: 'Milkshake KitKat (Grand)' }, desc: { en: 'Large size KitKat milkshake.', es: 'Batido KitKat tamaño grande.', ca: 'Batut KitKat de mida gran.', ar: 'ميلك شيك كيت كات حجم كبير.', fr: 'Milkshake KitKat grande taille.' } },
  { cat: 'batidos', price: 5.50, sku: 'BT-03', name: { en: 'Kinder Milkshake', es: 'Batido Kinder', ca: 'Batut Kinder', ar: 'ميلك شيك كيندر', fr: 'Milkshake Kinder' }, desc: { en: 'Medium size Kinder milkshake.', es: 'Batido Kinder tamaño mediano.', ca: 'Batut Kinder de mida mitjana.', ar: 'ميلك شيك كيندر حجم متوسط.', fr: 'Milkshake Kinder taille moyenne.' } },
  { cat: 'batidos', price: 6.90, sku: 'BT-03L', name: { en: 'Kinder Milkshake (Large)', es: 'Batido Kinder (Grande)', ca: 'Batut Kinder (Gran)', ar: 'ميلك شيك كيندر (كبير)', fr: 'Milkshake Kinder (Grand)' }, desc: { en: 'Large size Kinder milkshake.', es: 'Batido Kinder tamaño grande.', ca: 'Batut Kinder de mida gran.', ar: 'ميلك شيك كيندر حجم كبير.', fr: 'Milkshake Kinder grande taille.' } },
  { cat: 'batidos', price: 5.50, sku: 'BT-04', name: { en: 'Ferrero Rocher Milkshake', es: 'Batido Ferrero Rocher', ca: 'Batut Ferrero Rocher', ar: 'ميلك شيك فيريرو روشيه', fr: 'Milkshake Ferrero Rocher' }, desc: { en: 'Medium size Ferrero Rocher milkshake.', es: 'Batido Ferrero Rocher tamaño mediano.', ca: 'Batut Ferrero Rocher de mida mitjana.', ar: 'ميلك شيك فيريرو روشيه حجم متوسط.', fr: 'Milkshake Ferrero Rocher taille moyenne.' } },
  { cat: 'batidos', price: 6.90, sku: 'BT-04L', name: { en: 'Ferrero Rocher Milkshake (Large)', es: 'Batido Ferrero Rocher (Grande)', ca: 'Batut Ferrero Rocher (Gran)', ar: 'ميلك شيك فيريرو روشيه (كبير)', fr: 'Milkshake Ferrero Rocher (Grand)' }, desc: { en: 'Large size Ferrero Rocher milkshake.', es: 'Batido Ferrero Rocher tamaño grande.', ca: 'Batut Ferrero Rocher de mida gran.', ar: 'ميلك شيك فيريرو روشيه حجم كبير.', fr: 'Milkshake Ferrero Rocher grande taille.' } },
  { cat: 'batidos', price: 5.50, sku: 'BT-05', name: { en: 'Nutella Milkshake', es: 'Batido Nutella', ca: 'Batut Nutella', ar: 'ميلك شيك نوتيلا', fr: 'Milkshake Nutella' }, desc: { en: 'Medium size Nutella milkshake.', es: 'Batido Nutella tamaño mediano.', ca: 'Batut Nutella de mida mitjana.', ar: 'ميلك شيك نوتيلا حجم متوسط.', fr: 'Milkshake Nutella taille moyenne.' } },
  { cat: 'batidos', price: 6.90, sku: 'BT-05L', name: { en: 'Nutella Milkshake (Large)', es: 'Batido Nutella (Grande)', ca: 'Batut Nutella (Gran)', ar: 'ميلك شيك نوتيلا (كبير)', fr: 'Milkshake Nutella (Grand)' }, desc: { en: 'Large size Nutella milkshake.', es: 'Batido Nutella tamaño grande.', ca: 'Batut Nutella de mida gran.', ar: 'ميلك شيك نوتيلا حجم كبير.', fr: 'Milkshake Nutella grande taille.' } },
  { cat: 'batidos', price: 5.50, sku: 'BT-06', name: { en: 'Mango Milkshake', es: 'Batido Mango', ca: 'Batut Mango', ar: 'ميلك شيك مانجو', fr: 'Milkshake Mangue' }, desc: { en: 'Medium size mango milkshake.', es: 'Batido de mango tamaño mediano.', ca: 'Batut de mango de mida mitjana.', ar: 'ميلك شيك مانجو حجم متوسط.', fr: 'Milkshake mangue taille moyenne.' } },
  { cat: 'batidos', price: 6.90, sku: 'BT-06L', name: { en: 'Mango Milkshake (Large)', es: 'Batido Mango (Grande)', ca: 'Batut Mango (Gran)', ar: 'ميلك شيك مانجو (كبير)', fr: 'Milkshake Mangue (Grand)' }, desc: { en: 'Large size mango milkshake.', es: 'Batido de mango tamaño grande.', ca: 'Batut de mango de mida gran.', ar: 'ميلك شيك مانجو حجم كبير.', fr: 'Milkshake mangue grande taille.' } },
  { cat: 'batidos', price: 5.50, sku: 'BT-07', name: { en: 'Banana Caramel Milkshake', es: 'Batido Banana Caramel', ca: 'Batut Banana Caramel', ar: 'ميلك شيك موز وكراميل', fr: 'Milkshake Banane Caramel' }, desc: { en: 'Medium size banana caramel milkshake.', es: 'Batido banana caramel tamaño mediano.', ca: 'Batut banana caramel de mida mitjana.', ar: 'ميلك شيك موز وكراميل حجم متوسط.', fr: 'Milkshake banane caramel taille moyenne.' } },
  { cat: 'batidos', price: 6.90, sku: 'BT-07L', name: { en: 'Banana Caramel Milkshake (Large)', es: 'Batido Banana Caramel (Grande)', ca: 'Batut Banana Caramel (Gran)', ar: 'ميلك شيك موز وكراميل (كبير)', fr: 'Milkshake Banane Caramel (Grand)' }, desc: { en: 'Large size banana caramel milkshake.', es: 'Batido banana caramel tamaño grande.', ca: 'Batut banana caramel de mida gran.', ar: 'ميلك شيك موز وكراميل حجم كبير.', fr: 'Milkshake banane caramel grande taille.' } },
  { cat: 'batidos', price: 5.50, sku: 'BT-08', name: { en: 'Vanilla Milkshake', es: 'Batido Vanilla Healdo', ca: 'Batut Vanilla', ar: 'ميلك شيك فانيليا', fr: 'Milkshake Vanille' }, desc: { en: 'Medium size vanilla ice cream milkshake.', es: 'Batido de helado de vainilla tamaño mediano.', ca: 'Batut de gelat de vanilla de mida mitjana.', ar: 'ميلك شيك آيس كريم الفانيليا حجم متوسط.', fr: 'Milkshake glace vanille taille moyenne.' } },
  { cat: 'batidos', price: 6.90, sku: 'BT-08L', name: { en: 'Vanilla Milkshake (Large)', es: 'Batido Vanilla Healdo (Grande)', ca: 'Batut Vanilla (Gran)', ar: 'ميلك شيك فانيليا (كبير)', fr: 'Milkshake Vanille (Grand)' }, desc: { en: 'Large size vanilla ice cream milkshake.', es: 'Batido de helado de vainilla tamaño grande.', ca: 'Batut de gelat de vanilla de mida gran.', ar: 'ميلك شيك آيس كريم الفانيليا حجم كبير.', fr: 'Milkshake glace vanille grande taille.' } },
  // Postres
  { cat: 'postres', price: 4.90, sku: 'PS-01', name: { en: 'Cheesecake', es: 'Tarta Queso', ca: 'Pastís de Formatge', ar: 'تشيز كيك', fr: 'Cheesecake' }, desc: { en: 'Creamy baked cheesecake.', es: 'Tarta de queso cremosa.', ca: 'Pastís de formatge cremós.', ar: 'تشيز كيك كريمي.', fr: 'Cheesecake crémeux.' } },
  { cat: 'postres', price: 4.90, sku: 'PS-02', name: { en: 'Bounty Cake', es: 'Bounty Cake', ca: 'Bounty Cake', ar: 'كيك باونتي', fr: 'Bounty Cake' }, desc: { en: 'Coconut and chocolate cake.', es: 'Tarta de coco y chocolate.', ca: 'Pastís de coco i xocolata.', ar: 'كيك بجوز الهند والشوكولاتة.', fr: 'Gâteau coco et chocolat.' } },
  { cat: 'postres', price: 4.90, sku: 'PS-03', name: { en: 'Chocolate Cake', es: 'Chocolate Cake', ca: 'Pastís de Xocolata', ar: 'كيك الشوكولاتة', fr: 'Gâteau au Chocolat' }, desc: { en: 'Rich chocolate cake.', es: 'Tarta de chocolate intensa.', ca: 'Pastís de xocolata intens.', ar: 'كيك شوكولاتة غني.', fr: 'Gâteau au chocolat intense.' } },
  { cat: 'postres', price: 4.90, sku: 'PS-04', name: { en: 'Tiramisu', es: 'Tiramisu', ca: 'Tiramisú', ar: 'تيراميسو', fr: 'Tiramisu' }, desc: { en: 'Classic Italian tiramisu.', es: 'Tiramisú clásico italiano.', ca: 'Tiramisú clàssic italià.', ar: 'تيراميسو إيطالي كلاسيكي.', fr: 'Tiramisu italien classique.' } },
  { cat: 'postres', price: 5.90, sku: 'PS-05', name: { en: 'Chocolate Coulant with Ice Cream', es: 'Coulant Chocolate Con Helado', ca: 'Coulant de Xocolata amb Gelat', ar: 'كولانت شوكولاتة مع آيس كريم', fr: 'Coulant au Chocolat avec Glace' }, desc: { en: 'Warm chocolate lava cake served with ice cream.', es: 'Coulant de chocolate caliente servido con helado.', ca: 'Coulant de xocolata calent servit amb gelat.', ar: 'كولانت شوكولاتة دافئ يقدم مع آيس كريم.', fr: 'Coulant au chocolat chaud servi avec glace.' } },
];

async function findCategory(branchId, catKey) {
  const def = CATEGORIES.find((c) => c.key === catKey);
  let doc = await Category.findOne({ branchId, 'name.en': def.name.en });
  if (!doc) {
    doc = await Category.create({
      branchId,
      name: def.name,
      icon: def.icon,
      isActive: true,
    });
    console.log('Created category:', def.name.en, doc._id.toString());
  }
  return doc;
}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set');
    process.exit(1);
  }

  await mongoose.connect(uri);

  const branch = await Branch.findOne({
    $or: [{ name: /Barcelona/i }, { location: /Barcelona/i }],
  });

  if (!branch) {
    console.error('Barcelona branch not found. Run seed-branches.js first.');
    process.exit(1);
  }
  console.log('Using branch:', branch.name, branch._id.toString());

  const categoryIds = {};
  for (const c of CATEGORIES) {
    categoryIds[c.key] = (await findCategory(branch._id, c.key))._id;
  }

  let created = 0;
  let updated = 0;

  for (const item of ITEMS) {
    const doc = {
      branchId: branch._id,
      category: categoryIds[item.cat],
      name: item.name,
      description: item.desc,
      price: item.price,
      imageUrl: PLACEHOLDER_IMAGE,
      sku: item.sku,
      isFeatured: !!item.isFeatured,
      isActive: true,
      isAvailable: true,
      availableUntil: AVAILABLE_UNTIL,
      stockQuantity: 1000,
      barcode: `SBR-${item.sku}`,
    };

    const existing = await FoodItem.findOne({ branchId: branch._id, sku: item.sku });
    if (existing) {
      await FoodItem.updateOne({ _id: existing._id }, { $set: doc });
      updated += 1;
    } else {
      await FoodItem.create(doc);
      created += 1;
    }
  }

  console.log(`Done. Created ${created}, updated ${updated} food items. Valid until ${AVAILABLE_UNTIL.toISOString()}`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
